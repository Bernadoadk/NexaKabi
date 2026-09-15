'use client';

import * as React from 'react';

/**
 * Chargement du SDK Google Maps, une seule fois par page.
 *
 * ── Pourquoi un chargeur partagé ────────────────────────────────────────────
 * Deux écrans affichent une carte — la carte publique des événements et le
 * sélecteur de position de l'assistant — et un troisième viendra (la fiche
 * d'un événement). Chacun injectait sa propre balise, deux cartes sur une
 * même page auraient chargé le SDK deux fois : Google le refuse bruyamment.
 * Ce module tient la promesse unique ; chaque composant l'attend.
 *
 * ── Ce que la CSP exige ─────────────────────────────────────────────────────
 * La balise porte le nonce de la réponse : sans lui, la politique de sécurité
 * la bloque comme n'importe quel script étranger. Les modules que le SDK tire
 * ensuite passent par `strict-dynamic`. Le nonce vient du composant serveur
 * qui monte la carte — il est lu dans l'en-tête `x-nonce`.
 *
 * ── Types ───────────────────────────────────────────────────────────────────
 * Seule la surface réellement utilisée est déclarée, pour ne pas tirer
 * `@types/google.maps` dans le bundle public. Elle est volontairement
 * partagée entre les deux cartes : une même API, une même description.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

export interface GoogleLatLngBounds {
  getNorthEast(): GoogleLatLng;
  getSouthWest(): GoogleLatLng;
  extend(point: LatLngLiteral | GoogleLatLng): GoogleLatLngBounds;
  isEmpty(): boolean;
}

export interface GooglePoint {
  x: number;
  y: number;
}

export interface GoogleMapsEventListener {
  remove(): void;
}

export interface GoogleMap {
  panTo(position: LatLngLiteral | GoogleLatLng): void;
  panBy(x: number, y: number): void;
  setCenter(position: LatLngLiteral | GoogleLatLng): void;
  getCenter(): GoogleLatLng | undefined;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  fitBounds(bounds: GoogleLatLngBounds, padding?: number | Record<string, number>): void;
  getBounds(): GoogleLatLngBounds | undefined;
  getDiv(): HTMLElement;
  setOptions(options: Record<string, unknown>): void;
  addListener(event: string, handler: (...args: unknown[]) => void): GoogleMapsEventListener;
}

export interface GoogleMapPanes {
  floatPane: HTMLElement;
  mapPane: HTMLElement;
  markerLayer: HTMLElement;
  overlayLayer: HTMLElement;
  overlayMouseTarget: HTMLElement;
}

export interface GoogleMapCanvasProjection {
  fromLatLngToDivPixel(position: GoogleLatLng | LatLngLiteral): GooglePoint | null;
}

/**
 * Superposition HTML sur la carte — la classe de base du SDK.
 *
 * C'est elle qui porte les épingles et les fiches : du DOM que React rend,
 * que la carte déplace avec elle. Aucun identifiant de carte (« Map ID »)
 * n'est nécessaire, contrairement aux marqueurs avancés.
 */
export interface GoogleOverlayView {
  setMap(map: GoogleMap | null): void;
  getPanes(): GoogleMapPanes | null;
  getProjection(): GoogleMapCanvasProjection;
  onAdd?(): void;
  draw?(): void;
  onRemove?(): void;
}

export interface GoogleOverlayViewClass {
  new (): GoogleOverlayView;
  preventMapHitsAndGesturesFrom(element: HTMLElement): void;
  preventMapHitsFrom(element: HTMLElement): void;
}

export interface GoogleMapsLibrary {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  OverlayView: GoogleOverlayViewClass;
}

export interface GoogleCoreLibrary {
  LatLng: new (lat: number, lng: number) => GoogleLatLng;
  LatLngBounds: new (sw?: LatLngLiteral, ne?: LatLngLiteral) => GoogleLatLngBounds;
  Size: new (width: number, height: number) => { width: number; height: number };
  Point: new (x: number, y: number) => GooglePoint;
}

export interface GoogleMapsSdk {
  importLibrary(name: 'maps'): Promise<GoogleMapsLibrary>;
  importLibrary(name: 'core'): Promise<GoogleCoreLibrary>;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsSdk };
  }
}

/** Centre du Bénin et niveau de zoom qui montre tout le pays. */
export const BENIN_CENTER: LatLngLiteral = { lat: 9.3, lng: 2.32 };
export const COUNTRY_ZOOM = 7;
/** Grand Cotonou, là où presque tout se passe. */
export const COTONOU_CENTER: LatLngLiteral = { lat: 6.3703, lng: 2.3912 };

/**
 * Habillage nocturne de la carte.
 *
 * Google ne suit pas le thème de la page : sans ces règles, le mode sombre
 * garderait un rectangle blanc éclatant au milieu de l'écran. Palette
 * dérivée des jetons encre du design system, pour que la carte semble faire
 * partie de la page plutôt que d'y être incrustée.
 */
export const DARK_MAP_STYLE: ReadonlyArray<Record<string, unknown>> = [
  { elementType: 'geometry', stylers: [{ color: '#1c1834' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b8b4cc' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0918' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3468' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#162a24' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2550' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#161228' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8d89a6' }] },
  // Les écussons de route (N1, RNIE 2…) ressortent en pastilles criardes sur
  // fond sombre : ils ne servent à rien pour trouver un concert.
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3468' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b0918' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#474262' }] },
];

/** Habillage diurne : quelques étiquettes de moins, pour que les épingles respirent. */
export const LIGHT_MAP_STYLE: ReadonlyArray<Record<string, unknown>> = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

let loader: Promise<GoogleMapsSdk> | null = null;

/** Attend que le SDK expose `importLibrary`. Dix secondes, puis on renonce. */
function waitForSdk(): Promise<GoogleMapsSdk> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const probe = () => {
      const sdk = window.google?.maps;

      if (sdk && typeof sdk.importLibrary === 'function') {
        resolve(sdk);
      } else if (Date.now() - startedAt > 10_000) {
        reject(new Error('Le SDK Google Maps ne s’est pas initialisé.'));
      } else {
        setTimeout(probe, 50);
      }
    };

    probe();
  });
}

/**
 * Charge le SDK — une seule fois — et le rend prêt.
 *
 * `onLoad` de la balise arrive AVANT que le SDK soit prêt : avec
 * `loading=async`, le script chargé n'est qu'un amorceur qui pose
 * `importLibrary` un instant plus tard. Sonder jusqu'à sa présence est la
 * seule façon fiable de savoir qu'on peut commencer.
 */
export function loadGoogleMaps(options: { apiKey: string; nonce?: string }): Promise<GoogleMapsSdk> {
  if (loader) return loader;

  loader = new Promise<GoogleMapsSdk>((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve(window.google.maps);
      return;
    }

    const params = new URLSearchParams({
      key: options.apiKey,
      v: 'weekly',
      language: 'fr',
      region: 'BJ',
      loading: 'async',
    });

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    if (options.nonce) script.nonce = options.nonce;
    script.onload = () => waitForSdk().then(resolve, reject);
    script.onerror = () => {
      loader = null;
      reject(new Error('Google Maps n’a pas pu se charger. Vérifie la connexion, puis réessaie.'));
    };

    document.head.appendChild(script);
  });

  return loader;
}

export type SdkState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; sdk: GoogleMapsSdk }
  | { status: 'error'; message: string };

/** Le SDK, sous forme d'état React. `apiKey` vide : rien n'est chargé. */
export function useGoogleMaps(apiKey: string, nonce?: string): SdkState {
  const [state, setState] = React.useState<SdkState>({ status: 'idle' });

  React.useEffect(() => {
    if (!apiKey) return;

    let cancelled = false;
    setState({ status: 'loading' });

    loadGoogleMaps({ apiKey, nonce }).then(
      (sdk) => {
        if (!cancelled) setState({ status: 'ready', sdk });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              error instanceof Error ? error.message : 'La carte n’a pas pu se charger.',
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [apiKey, nonce]);

  return state;
}

/** Distance à vol d'oiseau, en kilomètres. Formule de haversine. */
export function distanceKm(from: LatLngLiteral, to: LatLngLiteral): number {
  const earthRadiusKm = 6_371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}
