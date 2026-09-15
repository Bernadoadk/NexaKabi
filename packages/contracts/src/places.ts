/**
 * Recherche de lieux, pour l'assistant de création d'événement.
 *
 * ── Ce que le produit attend d'une recherche de lieu ───────────────────────
 * L'organisateur tape « Érévan Cotonou » et voit tomber les lieux de cette
 * zone ; il en choisit un, et le nom, l'adresse, la ville et les coordonnées
 * sont posés d'un coup. La saisie manuelle reste possible — un lieu que
 * personne n'a encore cartographié doit pouvoir accueillir un événement.
 *
 * Les appels partent de l'API, jamais du navigateur : la clé serveur ne
 * circule pas, et la recherche est bornée au Bénin côté serveur plutôt que
 * confiée à la page.
 */

import { z } from 'zod';

export const placeSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  /**
   * Jeton de session de recherche, tiré par le client.
   *
   * Google regroupe sous un même jeton toutes les frappes d'une recherche et
   * le détail du lieu finalement choisi, et facture l'ensemble comme UNE
   * session plutôt que chaque frappe. Sans lui, chaque lettre tapée coûte une
   * requête pleine.
   */
  session: z.string().trim().min(8).max(64),
});

export type PlaceSearchQuery = z.infer<typeof placeSearchQuerySchema>;

export const placeSuggestionSchema = z.object({
  placeId: z.string(),
  /** « Érévan Hôtel » */
  mainText: z.string(),
  /** « Boulevard de la Marina, Cotonou » */
  secondaryText: z.string(),
});

export type PlaceSuggestion = z.infer<typeof placeSuggestionSchema>;

export const placeDetailsSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  /** Ville telle que Google la nomme, à rapprocher de nos villes de lancement. */
  cityName: z.string().nullable(),
});

export type PlaceDetails = z.infer<typeof placeDetailsSchema>;

/**
 * Géocodage d'une adresse saisie à la main.
 *
 * L'organisateur qui ne trouve pas son lieu dans les suggestions le décrit
 * en toutes lettres — « Bar Le Repaire, Fidjrossè, Cotonou ». Le géocodage
 * en tire une position approximative, qu'il ajuste ensuite en déplaçant
 * l'épingle. Sans cette étape, un lieu saisi à la main n'apparaissait jamais
 * sur la carte des participants.
 */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(240),
});

export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;

export const geocodeResultSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  /** Adresse normalisée par Google, à proposer — jamais imposer — en remplacement. */
  formattedAddress: z.string().nullable(),
  cityName: z.string().nullable(),
  /** `true` quand Google n'a trouvé qu'une zone (quartier, ville), pas un point précis. */
  approximate: z.boolean(),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
