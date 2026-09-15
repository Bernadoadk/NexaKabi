import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodeResult, PlaceDetails, PlaceSuggestion } from '@nexakabi/contracts';
import type { Env } from '../../config/env';

/**
 * Recherche de lieux, par Google Places.
 *
 * ── Pourquoi l'appel part du serveur et non de la page ─────────────────────
 * Trois raisons, dans l'ordre :
 *
 *  1. La clé ne circule pas. Une clé posée dans une page se lit dans le code
 *     source ; la restriction par référent la protège, mais une clé qui ne
 *     sort jamais n'a pas besoin d'être protégée.
 *  2. La politique de sécurité du contenu reste fermée : aucun script tiers à
 *     autoriser, aucun hôte à ajouter à `connect-src`.
 *  3. Les bornes sont posées ici. La recherche est limitée au Bénin et à
 *     quelques champs ; la page ne peut pas demander plus, ni ailleurs.
 *
 * ── Deux générations de l'API, et pourquoi les deux sont là ────────────────
 * Google recommande « Places API (New) », mais une clé ne peut l'appeler que
 * si elle est activée sur le projet ET autorisée sur la clé — deux réglages
 * qu'on oublie facilement. L'ancienne API répond alors très bien. Le service
 * essaie la nouvelle, et sur un refus explicite bascule sur l'ancienne pour
 * la durée du processus, en le disant dans les journaux : le produit marche
 * tout de suite, et suit la recommandation dès que la console le permet.
 *
 * ── Ce que coûte une recherche ─────────────────────────────────────────────
 * Google facture à la SESSION quand un même jeton relie les frappes et le
 * détail final ; sans jeton, chaque lettre tapée est une requête pleine. Le
 * client tire ce jeton, le service le transmet tel quel — aux deux API.
 *
 * Documentation : https://developers.google.com/maps/documentation/places/web-service
 */

const NEW_BASE_URL = 'https://places.googleapis.com/v1';
const LEGACY_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * Biais géographique : Cotonou et son agglomération.
 *
 * La restriction au pays reste stricte ; le biais ne fait que CLASSER. Sans
 * lui, « Palais » remonte d'abord des palais royaux du nord, alors que huit
 * organisateurs sur dix cherchent un lieu du Grand Cotonou.
 */
const BIAS_CENTER = { latitude: 6.3703, longitude: 2.3912 };
const BIAS_RADIUS_METERS = 60_000;

/** Un opérateur qui ne répond pas ne doit pas bloquer l'assistant. */
const REQUEST_TIMEOUT_MS = 6_000;

/** Types Google qui désignent la ville, du plus précis au plus large. */
const CITY_COMPONENT_TYPES = ['locality', 'administrative_area_level_2', 'sublocality'];

type Generation = 'new' | 'legacy';

/** Signale un refus qui justifie d'essayer l'autre génération. */
class GenerationRefusedError extends Error {}

// ── Formes de réponse, nouvelle API ──────────────────────────────────────────

interface NewAutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }>;
}

interface NewPlaceResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
}

// ── Formes de réponse, ancienne API ──────────────────────────────────────────

interface LegacyAutocompleteResponse {
  status?: string;
  error_message?: string;
  predictions?: Array<{
    place_id?: string;
    description?: string;
    structured_formatting?: { main_text?: string; secondary_text?: string };
  }>;
}

interface LegacyDetailsResponse {
  status?: string;
  error_message?: string;
  result?: {
    place_id?: string;
    name?: string;
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    address_components?: Array<{ long_name?: string; types?: string[] }>;
  };
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey: string;

  /** Génération retenue. Bascule sur `legacy` au premier refus de la nouvelle. */
  private generation: Generation = 'new';

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('GOOGLE_MAPS_SERVER_KEY', { infer: true });
  }

  /** Vrai si la recherche de lieux est branchée. L'assistant s'y adapte. */
  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: string, sessionToken: string): Promise<PlaceSuggestion[]> {
    this.assertEnabled();

    return this.withFallback(
      () => this.searchNew(query, sessionToken),
      () => this.searchLegacy(query, sessionToken),
    );
  }

  async details(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    this.assertEnabled();

    return this.withFallback(
      () => this.detailsNew(placeId, sessionToken),
      () => this.detailsLegacy(placeId, sessionToken),
    );
  }

  // ── Nouvelle API ───────────────────────────────────────────────────────────

  private async searchNew(query: string, sessionToken: string): Promise<PlaceSuggestion[]> {
    const payload = await this.callNew<NewAutocompleteResponse>('POST', '/places:autocomplete', {
      input: query,
      sessionToken,
      // Le produit est béninois : un lieu hors du pays est une erreur de
      // saisie, pas un résultat.
      includedRegionCodes: ['bj'],
      languageCode: 'fr',
      locationBias: {
        circle: { center: BIAS_CENTER, radius: BIAS_RADIUS_METERS },
      },
    });

    return (payload.suggestions ?? [])
      .map((entry) => entry.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .map((p) => ({
        placeId: p.placeId!,
        mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
        secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
      }))
      .filter((suggestion) => suggestion.mainText.length > 0);
  }

  private async detailsNew(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    const query = new URLSearchParams({ sessionToken, languageCode: 'fr' });

    const place = await this.callNew<NewPlaceResponse>(
      'GET',
      `/places/${encodeURIComponent(placeId)}?${query.toString()}`,
      undefined,
      // Le masque de champs borne la réponse — et la facture : Google tarife
      // selon les champs demandés, pas selon ceux qu'on lit.
      { 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
    );

    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;

    if (!place.id || latitude === undefined || longitude === undefined) {
      throw new NotFoundException('Ce lieu n’a pas pu être localisé. Saisis-le à la main.');
    }

    return {
      placeId: place.id,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? null,
      latitude,
      longitude,
      cityName: pickCity(
        (place.addressComponents ?? []).map((c) => ({ name: c.longText, types: c.types })),
      ),
    };
  }

  private async callNew<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const response = await this.fetch(`${NEW_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `HTTP ${response.status}`;

      // 403 : API non activée, ou clé non autorisée sur elle. C'est un réglage
      // de console, pas une panne — l'ancienne génération prend le relais.
      if (response.status === 403) {
        throw new GenerationRefusedError(message);
      }

      this.logger.error(`Google Places (New) ${method} ${path} → ${message}`);
      throw new BadGatewayException('La recherche de lieux a échoué. Saisis le lieu à la main.');
    }

    return payload as T;
  }

  // ── Ancienne API ───────────────────────────────────────────────────────────

  private async searchLegacy(query: string, sessionToken: string): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({
      input: query,
      components: 'country:bj',
      language: 'fr',
      location: `${BIAS_CENTER.latitude},${BIAS_CENTER.longitude}`,
      radius: String(BIAS_RADIUS_METERS),
      sessiontoken: sessionToken,
      key: this.apiKey,
    });

    const payload = await this.callLegacy<LegacyAutocompleteResponse>(
      `/autocomplete/json?${params.toString()}`,
    );

    return (payload.predictions ?? [])
      .filter((p) => Boolean(p.place_id))
      .map((p) => ({
        placeId: p.place_id!,
        mainText: p.structured_formatting?.main_text ?? p.description ?? '',
        secondaryText: p.structured_formatting?.secondary_text ?? '',
      }))
      .filter((suggestion) => suggestion.mainText.length > 0);
  }

  private async detailsLegacy(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'place_id,name,formatted_address,geometry,address_components',
      language: 'fr',
      sessiontoken: sessionToken,
      key: this.apiKey,
    });

    const payload = await this.callLegacy<LegacyDetailsResponse>(
      `/details/json?${params.toString()}`,
    );

    const result = payload.result;
    const latitude = result?.geometry?.location?.lat;
    const longitude = result?.geometry?.location?.lng;

    if (!result?.place_id || latitude === undefined || longitude === undefined) {
      throw new NotFoundException('Ce lieu n’a pas pu être localisé. Saisis-le à la main.');
    }

    return {
      placeId: result.place_id,
      name: result.name ?? '',
      address: result.formatted_address ?? null,
      latitude,
      longitude,
      cityName: pickCity(
        (result.address_components ?? []).map((c) => ({ name: c.long_name, types: c.types })),
      ),
    };
  }

  private async callLegacy<T extends { status?: string; error_message?: string }>(
    path: string,
  ): Promise<T> {
    const response = await this.fetch(`${LEGACY_BASE_URL}${path}`, { method: 'GET' });
    const payload = (await response.json().catch(() => null)) as T | null;

    // L'ancienne API répond 200 même en erreur : le statut est dans le corps.
    const status = payload?.status ?? `HTTP ${response.status}`;

    if (!payload || (status !== 'OK' && status !== 'ZERO_RESULTS')) {
      // La clé n'est jamais journalisée : elle est dans l'URL, d'où le chemin
      // tronqué avant les paramètres.
      this.logger.error(
        `Google Places (legacy) ${path.split('?')[0]} → ${status} ${payload?.error_message ?? ''}`,
      );

      throw new BadGatewayException(
        status === 'REQUEST_DENIED'
          ? 'La recherche de lieux est refusée par Google : vérifie que Places API est activée ' +
              'et que la clé serveur y a droit.'
          : 'La recherche de lieux a échoué. Saisis le lieu à la main.',
      );
    }

    return payload;
  }

  // ── Géocodage ──────────────────────────────────────────────────────────────

  /**
   * Position d'une adresse saisie en toutes lettres.
   *
   * L'API Geocoding n'a qu'une génération et ne connaît pas les sessions :
   * chaque appel est facturé, d'où le bouton explicite côté assistant plutôt
   * qu'une recherche à la frappe. Résultat restreint au Bénin, en français.
   */
  async geocode(query: string): Promise<GeocodeResult> {
    this.assertEnabled();

    const params = new URLSearchParams({
      address: query,
      components: 'country:BJ',
      language: 'fr',
      region: 'bj',
      key: this.apiKey,
    });

    const response = await this.fetch(`${GEOCODE_URL}?${params.toString()}`, { method: 'GET' });
    const payload = (await response.json().catch(() => null)) as {
      status?: string;
      error_message?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
        address_components?: Array<{ long_name?: string; types?: string[] }>;
      }>;
    } | null;

    const status = payload?.status ?? `HTTP ${response.status}`;

    if (status === 'ZERO_RESULTS' || (status === 'OK' && !payload?.results?.length)) {
      throw new NotFoundException(
        'Cette adresse est introuvable. Précise le quartier et la ville, ou place l’épingle à la main.',
      );
    }

    if (!payload || status !== 'OK') {
      this.logger.error(`Google Geocoding → ${status} ${payload?.error_message ?? ''}`);
      throw new BadGatewayException(
        status === 'REQUEST_DENIED'
          ? 'Le géocodage est refusé par Google : vérifie que Geocoding API est activée sur la clé serveur.'
          : 'Le géocodage a échoué. Place l’épingle à la main.',
      );
    }

    const best = payload.results?.[0];
    const latitude = best?.geometry?.location?.lat;
    const longitude = best?.geometry?.location?.lng;

    if (!best || latitude === undefined || longitude === undefined) {
      throw new NotFoundException('Cette adresse n’a pas pu être localisée.');
    }

    return {
      latitude,
      longitude,
      formattedAddress: best.formatted_address ?? null,
      cityName: pickCity(
        (best.address_components ?? []).map((c) => ({ name: c.long_name, types: c.types })),
      ),
      // ROOFTOP et RANGE_INTERPOLATED désignent un point ; le reste est une zone.
      approximate: !['ROOFTOP', 'RANGE_INTERPOLATED'].includes(
        best.geometry?.location_type ?? '',
      ),
    };
  }

  // ── Commun ─────────────────────────────────────────────────────────────────

  /**
   * Exécute avec la génération courante, et bascule sur l'ancienne si la
   * nouvelle est refusée. La bascule est mémorisée : inutile de réessayer la
   * nouvelle à chaque frappe tant que la console n'a pas changé.
   */
  private async withFallback<T>(viaNew: () => Promise<T>, viaLegacy: () => Promise<T>): Promise<T> {
    if (this.generation === 'legacy') return viaLegacy();

    try {
      return await viaNew();
    } catch (error) {
      if (!(error instanceof GenerationRefusedError)) throw error;

      this.generation = 'legacy';
      this.logger.warn(
        `Places API (New) refusée (${error.message}). Repli sur l'ancienne Places API pour la ` +
          'durée du processus. Pour suivre la recommandation de Google : activer « Places API ' +
          '(New) » dans Google Cloud et l’autoriser sur la clé serveur.',
      );

      return viaLegacy();
    }
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      this.logger.warn({ err: error }, 'Google Places injoignable');
      throw new BadGatewayException(
        'La recherche de lieux ne répond pas. Saisis le lieu à la main.',
      );
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'La recherche de lieux n’est pas configurée. Saisis le lieu à la main.',
      );
    }
  }
}

/** Ville d'un lieu, depuis ses composants d'adresse, du plus précis au plus large. */
function pickCity(components: Array<{ name?: string; types?: string[] }>): string | null {
  for (const type of CITY_COMPONENT_TYPES) {
    const match = components.find((component) => component.types?.includes(type));
    if (match?.name) return match.name;
  }

  return null;
}
