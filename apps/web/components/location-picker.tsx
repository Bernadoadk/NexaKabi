'use client';

import * as React from 'react';
import { MapPin, Move } from 'lucide-react';
import { cn, useTheme } from '@nexakabi/ui';
import {
  COTONOU_CENTER,
  DARK_MAP_STYLE,
  LIGHT_MAP_STYLE,
  useGoogleMaps,
  type GoogleMap,
  type LatLngLiteral,
} from './google-maps';

/**
 * Sélecteur de position — l'épingle au centre, la carte qui bouge dessous.
 *
 * ── Pourquoi ce geste et pas une épingle qu'on tire ─────────────────────────
 * Sur un téléphone, attraper une épingle de 30 px sous le doigt qui la cache
 * est une loterie. Le motif inverse — l'épingle fixe au centre, on déplace la
 * carte — est celui des applications de VTC, précisément parce qu'il se fait
 * d'une main, sans précision. Il n'exige aucun marqueur du SDK : l'épingle est
 * un élément HTML posé au-dessus de la carte, jamais un objet Google.
 *
 * ── Quand la position change ────────────────────────────────────────────────
 * Le composant n'émet qu'à l'arrêt du mouvement (`idle`), jamais pendant le
 * glissement : un formulaire qui se réenregistre à chaque pixel serait
 * inutilisable. Une valeur reçue de l'extérieur (recherche, géocodage)
 * recentre la carte ; l'arrêt qui suit renvoie la même position, comparée à
 * la précédente pour ne pas boucler.
 */
const PLACE_ZOOM = 16;
const AREA_ZOOM = 12;

function sameSpot(a: LatLngLiteral | null, b: LatLngLiteral | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7;
}

export interface LocationPickerProps {
  apiKey: string;
  nonce?: string;
  value: LatLngLiteral | null;
  onChange: (value: LatLngLiteral) => void;
  disabled?: boolean;
  /** `true` quand la position vient d'un géocodage de zone, à affiner. */
  approximate?: boolean;
  className?: string;
}

export function LocationPicker({
  apiKey,
  nonce,
  value,
  onChange,
  disabled = false,
  approximate = false,
  className,
}: LocationPickerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GoogleMap | null>(null);
  const lastEmittedRef = React.useRef<LatLngLiteral | null>(value);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const sdkState = useGoogleMaps(apiKey, nonce);
  const { resolvedTheme } = useTheme();
  const [dragging, setDragging] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  // ── Création de la carte ─────────────────────────────────────────────────
  React.useEffect(() => {
    if (sdkState.status !== 'ready' || !containerRef.current || mapRef.current) return;

    let cancelled = false;
    const listeners: Array<{ remove(): void }> = [];

    void (async () => {
      const { Map: GMap } = await sdkState.sdk.importLibrary('maps');
      if (cancelled || !containerRef.current) return;

      const initial = lastEmittedRef.current;

      const map = new GMap(containerRef.current, {
        center: initial ?? COTONOU_CENTER,
        zoom: initial ? PLACE_ZOOM : AREA_ZOOM,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
        zoomControl: true,
        styles: resolvedTheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
      });

      mapRef.current = map;

      listeners.push(map.addListener('dragstart', () => setDragging(true)));
      listeners.push(map.addListener('dragend', () => setDragging(false)));
      listeners.push(
        map.addListener('idle', () => {
          const center = map.getCenter();
          if (!center) return;

          const next = { lat: center.lat(), lng: center.lng() };
          if (sameSpot(next, lastEmittedRef.current)) return;

          lastEmittedRef.current = next;
          onChangeRef.current(next);
        }),
      );

      setReady(true);
    })();

    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove();
    };
    // Le thème est appliqué par l'effet suivant : le recréer ici ferait
    // repartir la carte de zéro à chaque bascule clair/sombre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkState]);

  // ── Thème ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    mapRef.current?.setOptions({
      styles: resolvedTheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
    });
  }, [resolvedTheme, ready]);

  // ── Valeur reçue de l'extérieur ──────────────────────────────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !value || sameSpot(value, lastEmittedRef.current)) return;

    lastEmittedRef.current = value;
    map.panTo(value);
    map.setZoom(approximate ? 14 : PLACE_ZOOM);
  }, [value, approximate, ready]);

  if (!apiKey) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-card border border-dashed border-border-field bg-surface-alt p-4 text-body-s text-text-2',
          className,
        )}
      >
        <MapPin className="size-5 shrink-0 text-text-3" aria-hidden />
        La carte n’est pas configurée sur cet environnement : la position ne peut pas être
        ajustée ici, mais le lieu choisi est bien enregistré.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'relative h-[240px] overflow-hidden rounded-card border border-border bg-paper sm:h-[280px]',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <div
          ref={containerRef}
          role="application"
          aria-label="Position de l’événement — déplace la carte pour placer l’épingle"
          className="size-full"
        />

        {/* L'épingle : fixe au centre, soulevée pendant le glissement. Son ombre
            reste au sol — c'est ce qui donne l'impression qu'on la tient. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
        >
          <span
            className={cn(
              'block transition-transform duration-150 ease-out',
              dragging ? '-translate-y-2.5' : 'translate-y-0',
            )}
          >
            <svg width="38" height="48" viewBox="0 0 34 44" className="drop-shadow-md">
              <path
                d="M17 43c8-11.5 15-19 15-27A15 15 0 0 0 2 16c0 8 7 15.5 15 27Z"
                fill="#FF4D2E"
                stroke="#12102B"
                strokeWidth="2"
              />
              <circle cx="17" cy="16" r="5.5" fill="#12102B" />
            </svg>
          </span>
          <span
            className={cn(
              'mx-auto -mt-1 block h-1.5 rounded-full bg-ink/35 blur-[1px] transition-all duration-150',
              dragging ? 'w-3 opacity-40' : 'w-5 opacity-70',
            )}
          />
        </div>

        {sdkState.status === 'error' ? (
          <div className="absolute inset-0 grid place-items-center bg-paper/90 p-4 text-center text-body-s text-text-2">
            {sdkState.message}
          </div>
        ) : !ready ? (
          <div className="absolute inset-0 grid place-items-center bg-paper text-body-s text-text-2">
            Chargement de la carte…
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/85 px-3 py-1.5 text-micro font-semibold text-white shadow-md backdrop-blur">
            <Move className="size-3.5" aria-hidden />
            {approximate
              ? 'Position approximative · déplace la carte pour l’affiner'
              : 'Déplace la carte pour ajuster l’épingle'}
          </span>
        </div>
      </div>

      {value ? (
        <p className="tabular text-micro text-text-3">
          Épingle posée en {value.lat.toFixed(5)}, {value.lng.toFixed(5)} — c’est cette position que
          les participants verront sur la carte.
        </p>
      ) : null}
    </div>
  );
}
