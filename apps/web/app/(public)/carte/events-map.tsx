'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock, LocateFixed, MapPin } from 'lucide-react';
import type { EventMapPin } from '@nexakabi/contracts';
import { formatEventCaption, formatMoney, formatTimeCompact } from '@nexakabi/utils';
import { Alert, Badge, CategoryIcon, CategoryMark, CoverImage, cn, useTheme } from '@nexakabi/ui';
import {
  BENIN_CENTER,
  COUNTRY_ZOOM,
  DARK_MAP_STYLE,
  LIGHT_MAP_STYLE,
  distanceKm,
  formatDistance,
  useGoogleMaps,
  type GoogleMap,
  type GoogleMapCanvasProjection,
  type GoogleMapsLibrary,
  type GoogleOverlayView,
  type LatLngLiteral,
} from '@/components/google-maps';

/**
 * Carte des événements.
 *
 * ── Ce que le participant fait ici ──────────────────────────────────────────
 * Il voit le Bénin avec une épingle par événement à venir, chacune portant
 * l'icône et la couleur de sa catégorie : un concert se reconnaît de loin
 * d'une conférence. Il survole une épingle : une fiche s'ouvre AU-DESSUS du
 * lieu — visuel, date, heure, lieu, prix. Il clique : la page de l'événement
 * s'ouvre. Au doigt, sans survol, le premier appui ouvre la fiche et son
 * bouton mène à la page. La légende filtre par catégorie ; « Autour de moi »
 * centre la carte et trie la liste du plus proche au plus loin.
 *
 * ── Comment les épingles sont dessinées ─────────────────────────────────────
 * Ce sont des éléments HTML, rendus par React dans une superposition du SDK
 * (`OverlayView`) que la carte déplace avec elle. Pas de marqueurs Google :
 * ils n'acceptent ni icône vectorielle, ni survol riche, ni thème sombre, et
 * les marqueurs « avancés » exigent un identifiant de carte facturé. À chaque
 * redessin, la superposition ne fait qu'une chose : poser chaque épingle à
 * son pixel — le contenu, lui, est celui de React.
 *
 * ── Ce que la carte ne sait pas ─────────────────────────────────────────────
 * La position n'est jamais envoyée au serveur. Elle sert au tri, dans le
 * navigateur, et disparaît avec la page. Les épingles arrivent déjà chargées.
 */

const NEARBY_ZOOM = 12;
const CARD_WIDTH = 264;

interface Placement {
  vertical: 'above' | 'below';
  horizontal: 'center' | 'left' | 'right';
}

type Opened = { id: string; placement: Placement; pinned: boolean } | null;

export function EventsMap({
  pins,
  apiKey,
  nonce,
}: {
  pins: EventMapPin[];
  apiKey: string;
  nonce?: string;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const sdkState = useGoogleMaps(apiKey, nonce);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GoogleMap | null>(null);
  const overlayRef = React.useRef<GoogleOverlayView | null>(null);
  const elementsRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const closeTimerRef = React.useRef<number | null>(null);

  // Élément hôte des épingles : créé APRÈS le montage, adopté par la
  // superposition. Le créer au rendu ferait diverger le HTML du serveur (sans
  // portail) de celui du client (avec) — une erreur d'hydratation.
  const [host, setHost] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    setHost(document.createElement('div'));
  }, []);

  const [mapReady, setMapReady] = React.useState(false);
  const [category, setCategory] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<Opened>(null);
  const [position, setPosition] = React.useState<LatLngLiteral | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [locateError, setLocateError] = React.useState<string | null>(null);
  const [hoverCapable, setHoverCapable] = React.useState(false);

  React.useEffect(() => {
    setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  const visible = React.useMemo(
    () => (category ? pins.filter((pin) => pin.categorySlug === category) : pins),
    [pins, category],
  );
  const visibleRef = React.useRef(visible);
  visibleRef.current = visible;

  const legend = React.useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; color: string; count: number }>();
    for (const pin of pins) {
      const entry = groups.get(pin.categorySlug);
      if (entry) entry.count += 1;
      else groups.set(pin.categorySlug, { slug: pin.categorySlug, name: pin.categoryName, color: pin.categoryColor, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [pins]);

  // ── Position de chaque épingle, au pixel ────────────────────────────────
  const draw = React.useCallback((projection: GoogleMapCanvasProjection) => {
    // Deux événements au même lieu se superposeraient : le second est décalé
    // de quelques pixels, le troisième de l'autre côté — assez pour les
    // distinguer, pas assez pour tromper sur le lieu.
    const seen = new Map<string, number>();

    for (const pin of visibleRef.current) {
      const element = elementsRef.current.get(pin.id);
      if (!element) continue;

      const point = projection.fromLatLngToDivPixel({ lat: pin.latitude, lng: pin.longitude });
      if (!point) continue;

      const key = `${pin.latitude.toFixed(5)},${pin.longitude.toFixed(5)}`;
      const duplicates = seen.get(key) ?? 0;
      seen.set(key, duplicates + 1);
      const shift = duplicates === 0 ? 0 : (duplicates % 2 === 1 ? 1 : -1) * Math.ceil(duplicates / 2) * 22;

      element.style.transform = `translate(${point.x + shift}px, ${point.y}px)`;
    }
  }, []);

  // ── Création de la carte et de la superposition ──────────────────────────
  React.useEffect(() => {
    if (sdkState.status !== 'ready' || !containerRef.current || !host || mapRef.current) return;

    let cancelled = false;
    const listeners: Array<{ remove(): void }> = [];

    void (async () => {
      let maps: GoogleMapsLibrary;
      try {
        maps = await sdkState.sdk.importLibrary('maps');
      } catch (cause) {
        console.error('Carte des événements : initialisation impossible', cause);
        return;
      }
      if (cancelled || !containerRef.current) return;
      const pinsHost = host;

      const map = new maps.Map(containerRef.current, {
        center: BENIN_CENTER,
        zoom: COUNTRY_ZOOM,
        // Contrôles réduits au nécessaire : sur un téléphone, chaque bouton
        // superflu cache un morceau de carte.
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: 'greedy',
        styles: resolvedTheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
      });
      mapRef.current = map;

      // Un clic sur la carte elle-même referme la fiche épinglée.
      listeners.push(map.addListener('click', () => setOpened(null)));

      const Base = maps.OverlayView;
      class PinsOverlay extends Base {
        override onAdd() {
          this.getPanes()?.overlayMouseTarget.appendChild(pinsHost);
        }

        override draw() {
          // Avant `onAdd`, la superposition n'a pas encore de projection.
          const projection = this.getProjection() as GoogleMapCanvasProjection | undefined;
          if (projection) draw(projection);
        }

        override onRemove() {
          pinsHost.remove();
        }
      }

      // Sans ceci, la carte prend le clic pour elle et se déplace au lieu
      // d'ouvrir la fiche.
      Base.preventMapHitsAndGesturesFrom(pinsHost);

      const overlay = new PinsOverlay();
      overlay.setMap(map);
      overlayRef.current = overlay;

      // La carte n'est « prête » qu'après son premier `idle` : avant, elle
      // n'a ni dimensions fiables ni projection, et un `fitBounds` calculé
      // à ce moment-là se trompe de zoom.
      const ready = map.addListener('idle', () => {
        ready.remove();
        if (!cancelled) setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      for (const listener of listeners) listener.remove();
    };
    // Le thème est appliqué par l'effet suivant : le recréer ici ferait
    // repartir la carte de zéro à chaque bascule clair/sombre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkState, host, draw]);

  // ── Thème ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    mapRef.current?.setOptions({
      styles: resolvedTheme === 'dark' ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
    });
  }, [resolvedTheme, mapReady]);

  // ── Cadrage : toutes les épingles visibles dans l'écran ──────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !mapReady || sdkState.status !== 'ready') return;

    // De nouvelles épingles viennent d'être rendues par React : la
    // superposition ne redessine que sur un mouvement de carte, on la relance.
    overlayRef.current?.draw?.();

    if (visible.length === 0) return;

    const sdk = sdkState.sdk;
    let disposed = false;

    const fit = async () => {
      const core = await sdk.importLibrary('core');
      if (disposed) return;

      const bounds = new core.LatLngBounds();
      for (const pin of visible) bounds.extend({ lat: pin.latitude, lng: pin.longitude });

      const only = visible.length === 1 ? visible[0] : undefined;
      if (only) {
        map.panTo({ lat: only.latitude, lng: only.longitude });
        map.setZoom(14);
      } else {
        map.fitBounds(bounds, { top: 80, right: 60, bottom: 60, left: 60 });
      }
    };

    // Un cadrage calculé sur une carte sans dimensions — onglet en arrière-
    // plan, panneau replié — donne un zoom absurde. On attend qu'elle en ait.
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      void fit();
      return () => {
        disposed = true;
      };
    }

    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        observer.disconnect();
        void fit();
      }
    });
    observer.observe(container);

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [visible, mapReady, sdkState]);

  // ── Position du participant ──────────────────────────────────────────────
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !position) return;

    map.panTo(position);
    map.setZoom(NEARBY_ZOOM);
  }, [position]);

  function locate() {
    if (!('geolocation' in navigator)) {
      setLocateError('Ton navigateur ne permet pas la géolocalisation.');
      return;
    }

    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (result) => {
        setLocating(false);
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude });
      },
      (error) => {
        setLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? 'Position refusée. Tu peux l’autoriser dans les réglages du navigateur, ou parcourir la carte à la main.'
            : 'Position introuvable pour le moment. Réessaie, ou parcours la carte à la main.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  /** Où poser la fiche pour qu'elle reste dans la carte. */
  function placementFor(id: string): Placement {
    const element = elementsRef.current.get(id);
    const container = containerRef.current;
    if (!element || !container) return { vertical: 'above', horizontal: 'center' };

    const pin = element.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const half = CARD_WIDTH / 2;

    return {
      vertical: pin.top - box.top < 300 ? 'below' : 'above',
      horizontal:
        pin.left - box.left < half ? 'left' : box.right - pin.right < half ? 'right' : 'center',
    };
  }

  function cancelClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpened((current) => (current && !current.pinned ? null : current));
    }, 160);
  }

  function open(id: string, pinned: boolean) {
    cancelClose();
    setOpened({ id, placement: placementFor(id), pinned });
  }

  /**
   * Ouvre la fiche d'une épingle TOUCHÉE (pas survolée) : sur un téléphone,
   * la carte est basse et la fiche haute — si l'épingle est près du bord
   * supérieur, on décale d'abord la carte pour que la fiche tienne au-dessus,
   * puis on ouvre une fois le mouvement terminé.
   */
  function openPinned(id: string) {
    const map = mapRef.current;
    const element = elementsRef.current.get(id);
    const container = containerRef.current;
    if (!map || !element || !container) {
      open(id, true);
      return;
    }

    const pin = element.getBoundingClientRect();
    const box = container.getBoundingClientRect();
    const top = pin.top - box.top;
    const bottom = box.bottom - pin.bottom;
    const room = 340;

    if (top < room && bottom < room) {
      // Ni au-dessus ni en dessous : on descend l'épingle pour ouvrir au-dessus.
      map.panBy(0, top - room);
      window.setTimeout(() => open(id, true), 260);
      return;
    }

    open(id, true);
  }

  function focus(pin: EventMapPin) {
    mapRef.current?.panTo({ lat: pin.latitude, lng: pin.longitude });
    const zoom = mapRef.current?.getZoom() ?? 0;
    if (zoom < 13) mapRef.current?.setZoom(13);
    // Le déplacement redessine les épingles : la fiche se place une fois la
    // carte arrêtée, sinon elle viserait l'ancien pixel.
    window.setTimeout(() => openPinned(pin.id), 260);
    containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const ordered = React.useMemo(() => {
    if (!position) return visible;

    return [...visible]
      .map((pin) => ({ pin, distance: distanceKm(position, { lat: pin.latitude, lng: pin.longitude }) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ pin }) => pin);
  }, [visible, position]);

  if (!apiKey) {
    return (
      <Alert tone="warning" title="Carte non configurée">
        La clé Google Maps du navigateur manque (<code>NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code>).
        Les événements restent accessibles depuis le catalogue.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {legend.length > 1 ? (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filtrer par catégorie"
        >
          <LegendChip active={category === null} onClick={() => setCategory(null)}>
            Toutes · {pins.length}
          </LegendChip>
          {legend.map((entry) => (
            <LegendChip
              key={entry.slug}
              active={category === entry.slug}
              onClick={() => setCategory(category === entry.slug ? null : entry.slug)}
            >
              <span
                className="flex size-5 items-center justify-center rounded-full text-white"
                style={{ background: entry.color }}
                aria-hidden
              >
                <CategoryIcon slug={entry.slug} className="size-3" strokeWidth={2.5} />
              </span>
              {entry.name} · {entry.count}
            </LegendChip>
          ))}
        </div>
      ) : null}

      {sdkState.status === 'error' ? (
        <Alert tone="danger" title="Carte indisponible">
          {sdkState.message}
        </Alert>
      ) : null}

      {locateError ? (
        <Alert tone="warning" title="Position">
          {locateError}
        </Alert>
      ) : null}

      <div className="relative -mx-4 overflow-hidden border-y border-border bg-paper sm:mx-0 sm:rounded-panel sm:border">
        <div
          ref={containerRef}
          role="application"
          aria-label="Carte des événements"
          className="h-[58dvh] min-h-[380px] w-full sm:h-[62vh] sm:min-h-[440px]"
        />

        {!mapReady && sdkState.status !== 'error' ? (
          <div className="absolute inset-0 grid place-items-center bg-paper text-body-s text-text-2">
            Chargement de la carte…
          </div>
        ) : null}

        {mapReady && visible.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-[360px] rounded-card bg-surface/95 p-3.5 text-center text-body-s text-text-2 shadow-md backdrop-blur">
            {pins.length === 0
              ? 'Aucun événement localisé pour l’instant.'
              : 'Aucun événement de cette catégorie sur la carte.'}
          </div>
        ) : null}

        {position ? <UserDot map={mapRef.current} position={position} host={host} /> : null}

        <button
          type="button"
          onClick={locate}
          disabled={!mapReady || locating}
          className="absolute bottom-4 left-1/2 inline-flex min-h-[var(--tap-min)] -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-body-s font-bold text-white shadow-lg transition hover:bg-ink-700 disabled:opacity-60"
        >
          <LocateFixed className="size-[18px]" aria-hidden />
          {locating ? 'Localisation…' : position ? 'Recentrer sur moi' : 'Autour de moi'}
        </button>
      </div>

      {/* Les épingles : rendues par React, posées par la superposition. */}
      {host
        ? createPortal(
            <>
              {visible.map((pin) => {
                const isOpen = opened?.id === pin.id;

                return (
                  <div
                    key={pin.id}
                    ref={(element) => {
                      if (element) elementsRef.current.set(pin.id, element);
                      else elementsRef.current.delete(pin.id);
                    }}
                    className="absolute left-0 top-0"
                    style={{ zIndex: isOpen ? 1000 : undefined }}
                    onMouseEnter={() => {
                      if (hoverCapable) open(pin.id, false);
                    }}
                    onMouseLeave={() => {
                      if (hoverCapable) scheduleClose();
                    }}
                  >
                    <PinMarker
                      pin={pin}
                      active={isOpen}
                      onActivate={() => {
                        if (hoverCapable) {
                          router.push(`/e/${pin.slug}`);
                        } else if (isOpen && opened?.pinned) {
                          setOpened(null);
                        } else {
                          openPinned(pin.id);
                        }
                      }}
                    />
                    {isOpen && opened ? (
                      <PinCard
                        pin={pin}
                        placement={opened.placement}
                        position={position}
                        onMouseEnter={cancelClose}
                        onMouseLeave={() => {
                          if (hoverCapable) scheduleClose();
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </>,
            host,
          )
        : null}

      <section className="flex flex-col gap-3" aria-label="Liste des événements">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-h3 font-bold">
            {position ? 'Du plus proche au plus loin' : 'Tous les événements à venir'}
          </h2>
          <span className="text-body-s text-text-3">
            {ordered.length} sur la carte
          </span>
        </div>

        {ordered.length === 0 ? (
          <p className="text-body-s text-text-2">Aucun événement localisé pour l’instant.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ordered.map((pin) => {
              const selected = opened?.id === pin.id;
              const startsAt = new Date(pin.startsAt);

              return (
                <li key={pin.id}>
                  <button
                    type="button"
                    onClick={() => focus(pin)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-card border bg-surface p-3 text-left transition hover:bg-surface-alt',
                      selected ? 'border-coral shadow-md' : 'border-border',
                    )}
                  >
                    <CategoryMark slug={pin.categorySlug} color={pin.categoryColor} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-body font-semibold text-text-strong">
                        {pin.title}
                      </span>
                      <span className="truncate text-micro text-text-2">
                        <span className="font-semibold uppercase tracking-[0.06em] text-coral">
                          {formatEventCaption(startsAt)} · {formatTimeCompact(startsAt)}
                        </span>
                        {pin.cityName ? ` · ${pin.venueName ?? pin.cityName}` : ''}
                      </span>
                    </span>
                    {position ? (
                      <span className="tabular shrink-0 text-micro font-semibold text-text-2">
                        {formatDistance(distanceKm(position, { lat: pin.latitude, lng: pin.longitude }))}
                      </span>
                    ) : (
                      <MapPin className="size-4 shrink-0 text-text-3" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function LegendChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-full px-3 text-body-s font-semibold transition-colors',
        active
          ? 'bg-ink text-white'
          : 'border border-border-field bg-surface text-text-2 hover:bg-paper hover:text-text-strong',
      )}
    >
      {children}
    </button>
  );
}

/**
 * L'épingle. Goutte colorée à la catégorie, icône blanche, bord blanc.
 * Ancrée par sa POINTE : `translate(-50%, -100%)` place la pointe sur le pixel
 * calculé par la superposition.
 */
function PinMarker({
  pin,
  active,
  onActivate,
}: {
  pin: EventMapPin;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${pin.title} — ${pin.categoryName}`}
      aria-expanded={active}
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      className={cn(
        'group absolute left-0 top-0 flex -translate-x-1/2 -translate-y-full cursor-pointer flex-col items-center focus-visible:outline-none',
      )}
    >
      <span
        className={cn(
          'flex size-[38px] items-center justify-center rounded-full border-[2.5px] border-white text-white shadow-md transition-transform duration-(--duration-hover)',
          active ? 'scale-110 shadow-lg' : 'group-hover:scale-110',
        )}
        style={{ background: pin.categoryColor }}
      >
        <CategoryIcon slug={pin.categorySlug} className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span
        aria-hidden
        className="-mt-[3px] block size-0 border-x-[7px] border-t-[9px] border-x-transparent"
        style={{ borderTopColor: pin.categoryColor }}
      />
      <span aria-hidden className="mt-0.5 block h-1 w-3 rounded-full bg-ink/30 blur-[1px]" />
      {pin.isSoldOut ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-ink px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.06em] text-white ring-2 ring-white">
          Complet
        </span>
      ) : null}
    </button>
  );
}

/** La fiche qui s'ouvre sur l'épingle, flèche pointée sur le lieu. */
function PinCard({
  pin,
  placement,
  position,
  onMouseEnter,
  onMouseLeave,
}: {
  pin: EventMapPin;
  placement: Placement;
  position: LatLngLiteral | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const startsAt = new Date(pin.startsAt);
  const above = placement.vertical === 'above';

  return (
    <div
      role="dialog"
      aria-label={pin.title}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'absolute z-10 w-[264px]',
        above ? 'bottom-[58px]' : 'top-[14px]',
        placement.horizontal === 'center' && 'left-0 -translate-x-1/2',
        placement.horizontal === 'left' && '-left-6',
        placement.horizontal === 'right' && '-right-6',
      )}
    >
      <Link
        href={`/e/${pin.slug}`}
        className="group/card block overflow-hidden rounded-card border border-border bg-surface text-text shadow-lg transition-shadow hover:shadow-xl"
      >
        <div className="relative h-[118px] overflow-hidden bg-ink">
          <div className="absolute inset-0" style={{ background: pin.categoryColor }} />
          {pin.coverImageUrl ? (
            <CoverImage src={pin.coverImageUrl} className="size-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/25">
              <CategoryIcon slug={pin.categorySlug} className="size-10" strokeWidth={1.5} />
            </div>
          )}
          <div aria-hidden className="ink-scrim-soft pointer-events-none absolute inset-0" />
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            <Badge tone="overlay">
              <CategoryIcon slug={pin.categorySlug} className="size-3" strokeWidth={2.5} />
              {pin.categoryName}
            </Badge>
            {pin.isSoldOut ? <Badge tone="overlay-accent">Complet</Badge> : null}
          </div>
          <div className="absolute inset-x-3 bottom-2.5 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-coral-200">
              {formatEventCaption(startsAt)} · {formatTimeCompact(startsAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-3.5 pb-3 pt-2.5">
          <h3 className="line-clamp-2 font-display text-[16px] font-bold leading-tight tracking-[-0.01em] text-text-strong">
            {pin.title}
          </h3>
          <p className="flex items-start gap-1.5 text-body-s text-text-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-text-3" aria-hidden />
            <span className="line-clamp-2">
              {[pin.venueName, pin.cityName].filter(Boolean).join(', ')}
              {position
                ? ` · ${formatDistance(distanceKm(position, { lat: pin.latitude, lng: pin.longitude }))}`
                : ''}
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-body-s text-text-2">
            <Clock className="size-3.5 shrink-0 text-text-3" aria-hidden />
            {formatTimeCompact(startsAt)} → {formatTimeCompact(new Date(pin.endsAt))}
          </p>

          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
            <span className="text-body font-bold text-text-strong">
              {pin.fromPrice === null
                ? 'Sur invitation'
                : pin.fromPrice === 0
                  ? 'Gratuit'
                  : `Dès ${formatMoney(pin.fromPrice)}`}
            </span>
            <span className="inline-flex items-center gap-1 text-body-s font-bold text-coral transition-transform group-hover/card:translate-x-0.5">
              Voir l’événement
              <ArrowRight className="size-4" aria-hidden />
            </span>
          </div>
        </div>
      </Link>

      {/* La flèche, pointée sur l'épingle. */}
      <span
        aria-hidden
        className={cn(
          'absolute size-3 rotate-45 border-border bg-surface',
          above ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t',
          placement.horizontal === 'center' && 'left-1/2 -translate-x-1/2',
          placement.horizontal === 'left' && 'left-[18px]',
          placement.horizontal === 'right' && 'right-[18px]',
        )}
      />
    </div>
  );
}

/**
 * Point bleu de la position du participant, dans la même superposition que
 * les épingles : posé par un redessin, déplacé avec la carte.
 */
function UserDot({
  map,
  position,
  host,
}: {
  map: GoogleMap | null;
  position: LatLngLiteral;
  host: HTMLDivElement | null;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!map || !ref.current) return;

    const element = ref.current;
    const place = () => {
      // La projection est celle de la superposition : on la retrouve via la
      // carte, en passant par les bornes visibles.
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      const container = map.getDiv();
      if (!bounds || zoom === undefined) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const width = container.clientWidth;
      const height = container.clientHeight;

      const lngSpan = ne.lng() - sw.lng();
      const x = ((position.lng - sw.lng()) / lngSpan) * width;

      const latToY = (lat: number) => {
        const rad = (lat * Math.PI) / 180;
        return Math.log(Math.tan(Math.PI / 4 + rad / 2));
      };
      const top = latToY(ne.lat());
      const bottom = latToY(sw.lat());
      const y = ((top - latToY(position.lat)) / (top - bottom)) * height;

      element.style.transform = `translate(${x}px, ${y}px)`;
    };

    place();
    const listener = map.addListener('bounds_changed', place);
    return () => listener.remove();
  }, [map, position, host]);

  return (
    <div
      ref={ref}
      aria-label="Ta position"
      className="pointer-events-none absolute left-0 top-0 z-[5]"
    >
      <span className="absolute -left-3.5 -top-3.5 block size-7 rounded-full bg-blue/20 animate-nk-pulse" />
      <span className="absolute -left-1.5 -top-1.5 block size-3 rounded-full border-2 border-white bg-blue shadow-md" />
    </div>
  );
}
