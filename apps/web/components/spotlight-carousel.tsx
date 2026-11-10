'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { SPOTLIGHT_VIEW_MIN_MS, SPOTLIGHT_VIEWS_BATCH_MAX } from '@nexakabi/contracts';
import { Badge, cn } from '@nexakabi/ui';

/**
 * La une — le carrousel de Découvrir et de l'accueil.
 *
 * ── Ce qu'il promet au visiteur ─────────────────────────────────────────────
 *  · Il défile seul, une diapositive toutes les `slideSeconds` secondes.
 *  · Il S'ARRÊTE dès qu'on s'y attarde : souris posée dessus, focus clavier,
 *    doigt posé, onglet caché, une sortie de l'écran. La barre de progression
 *    se fige et reprend là où elle en était — elle ne repart pas de zéro.
 *  · Un bouton pause reste toujours visible : tout contenu qui bouge plus de
 *    cinq secondes doit pouvoir s'arrêter (WCAG 2.2.2).
 *  · Avec « réduire les animations », rien ne défile tout seul.
 *
 * ── Une seule rangée pour toutes les tailles ────────────────────────────────
 * Une piste à défilement horizontal, aimantée (`scroll-snap`). Sur téléphone,
 * les cartes font 86 % de la largeur : la suivante se devine, et c'est ce qui
 * invite à glisser. Sur ordinateur, la diapositive occupe la scène et la file
 * des suivantes se lit à droite. Le glissement au doigt est celui du
 * navigateur : aucune bibliothèque, rien à télécharger de plus.
 *
 * ── Poids ───────────────────────────────────────────────────────────────────
 * Seule la première image part tout de suite (c'est le premier affichage) ;
 * les autres attendent d'approcher. Sans JavaScript, la première diapositive
 * reste une bannière cliquable comme une autre.
 *
 * ── La vidéo, quand elle a sa place ─────────────────────────────────────────
 * Une diapositive peut porter une vidéo muette de quinze secondes au plus. Elle
 * ne se charge QUE pour la diapositive affichée, jamais au premier rendu, et
 * seulement si l'appareil le permet : pas d'économie de données demandée, une
 * connexion meilleure que la 3G, pas de « réduire les animations ». Sinon,
 * l'image — qui reste l'affiche — suffit. Le bouton pause arrête aussi la
 * vidéo ; le survol, lui, n'arrête que le défilement : on regarde.
 */

export interface SpotlightView {
  id: string;
  kind: 'EVENT' | 'EXTERNAL';
  sponsored: boolean;
  title: string;
  categoryName: string | null;
  color: string;
  dateLabel: string;
  placeLabel: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  /** Vidéo muette ; l'image reste l'affiche tant qu'elle n'est pas prête. */
  video: { url: string; posterUrl: string; durationSeconds: number } | null;
  href: string;
  ctaLabel: string;
  /** Présent pour un événement dont la billetterie n'est pas chez nous. */
  external: { organizerName: string; host: string | null } | null;
}

export interface SpotlightCarouselProps {
  slides: SpotlightView[];
  slideSeconds: number;
  className?: string;
  /** Titre de la section — « À la une », ou « Aperçu » dans l'espace organisateur. */
  title?: string;
  /**
   * Aperçu : la diapositive telle que la une la montrera, sans rien mesurer
   * ni mener nulle part — l'organisateur la regarde avant de payer.
   */
  preview?: boolean;
}

/** Ce qui retient le défilement — plusieurs causes peuvent se cumuler. */
type Hold = 'hover' | 'focus' | 'touch' | 'hidden' | 'offscreen';

/** Part de la une qui doit être visible pour qu'elle défile… */
const PLAY_VISIBILITY = 0.35;
/** …et pour qu'une diapositive compte comme vue. */
const VIEW_VISIBILITY = 0.5;
/** Après qu'on a levé le doigt, le temps de lire avant que ça reparte. */
const TOUCH_RELEASE_MS = 1_500;
/** Envoi groupé des vues. */
const VIEWS_FLUSH_MS = 5_000;

export function SpotlightCarousel({
  slides,
  slideSeconds,
  className,
  title = 'À la une',
  preview = false,
}: SpotlightCarouselProps) {
  const count = slides.length;
  const animated = count > 1;

  // Décidé après le montage : le rendu serveur ne sait rien de l'appareil, et
  // la première image doit partir sans attendre ce verdict.
  const [videoAllowed, setVideoAllowed] = React.useState(false);
  const videoAllowedRef = React.useRef(false);
  videoAllowedRef.current = videoAllowed;

  /** Durée d'une diapositive : celle de sa vidéo si elle est plus longue. */
  const durationOf = React.useCallback(
    (position: number) => {
      const video = videoAllowedRef.current ? slides[position]?.video : null;
      return Math.max(slideSeconds, video?.durationSeconds ?? 0) * 1000;
    },
    [slideSeconds, slides],
  );

  const [index, setIndex] = React.useState(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const [holds, setHolds] = React.useState<ReadonlySet<Hold>>(() => new Set());
  const [announcement, setAnnouncement] = React.useState('');

  const sectionRef = React.useRef<HTMLElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const segmentRefs = React.useRef<Array<HTMLElement | null>>([]);
  const queueRefs = React.useRef<Array<HTMLElement | null>>([]);

  const indexRef = React.useRef(0);
  const elapsedRef = React.useRef(0);
  const pausedRef = React.useRef(false);
  const reducedRef = React.useRef(false);
  const visibleRatioRef = React.useRef(1);
  const programmaticRef = React.useRef(false);
  const programmaticTimer = React.useRef<number | undefined>(undefined);
  const touchTimer = React.useRef<number | undefined>(undefined);

  // Mesure : temps vu par diapositive, vues déjà comptées, vues à envoyer.
  const viewTimeRef = React.useRef(new Map<string, number>());
  const reportedRef = React.useRef(new Set<string>());
  const pendingRef = React.useRef(new Set<string>());

  const paused = userPaused || holds.size > 0;
  pausedRef.current = paused;

  const hold = React.useCallback((cause: Hold, on: boolean) => {
    setHolds((current) => {
      if (current.has(cause) === on) return current;
      const next = new Set(current);
      if (on) next.add(cause);
      else next.delete(cause);
      return next;
    });
  }, []);

  // ── Déplacement ──────────────────────────────────────────────────────────

  const scrollToSlide = React.useCallback((target: number, smooth: boolean) => {
    const track = trackRef.current;
    const slide = track?.children[target] as HTMLElement | undefined;
    if (!track || !slide) return;

    // La marge d'aimantation du CSS (`scroll-px-*`) dit où une carte s'arrête.
    const padding = Number.parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;

    programmaticRef.current = true;
    window.clearTimeout(programmaticTimer.current);
    track.scrollTo({
      left: slide.offsetLeft - padding,
      behavior: smooth && !reducedRef.current ? 'smooth' : 'auto',
    });
    programmaticTimer.current = window.setTimeout(() => {
      programmaticRef.current = false;
    }, 700);
  }, []);

  const goTo = React.useCallback(
    (target: number, cause: 'auto' | 'user') => {
      if (count === 0) return;
      const next = ((target % count) + count) % count;

      indexRef.current = next;
      elapsedRef.current = 0;
      setIndex(next);
      scrollToSlide(next, true);

      if (cause === 'user') {
        const slide = slides[next];
        if (slide) setAnnouncement(`${next + 1} sur ${count} : ${slide.title}`);
      }
    },
    [count, scrollToSlide, slides],
  );

  // ── Boucle : progression, passage à la suivante, temps vu ────────────────

  React.useEffect(() => {
    if (count === 0) return;

    let frame = 0;
    let last = performance.now();

    const paint = () => {
      const progress = Math.min(elapsedRef.current / durationOf(indexRef.current), 1);
      const current = indexRef.current;

      segmentRefs.current.forEach((element, position) => {
        if (!element) return;
        const value = position < current ? 1 : position === current ? progress : 0;
        element.style.transform = `scaleX(${value})`;
      });

      queueRefs.current.forEach((element, position) => {
        if (element) element.style.transform = `scaleX(${position === current ? progress : 0})`;
      });
    };

    const loop = (now: number) => {
      const delta = Math.min(now - last, 100);
      last = now;

      if (animated && !pausedRef.current) {
        elapsedRef.current += delta;
        if (elapsedRef.current >= durationOf(indexRef.current)) goTo(indexRef.current + 1, 'auto');
      }

      // Une vue : la diapositive affichée, la une à moitié visible au moins,
      // l'onglet au premier plan — pendant une seconde. Qu'elle défile ou non.
      const slide = slides[indexRef.current];
      if (!preview && slide && !document.hidden && visibleRatioRef.current >= VIEW_VISIBILITY) {
        const seen = (viewTimeRef.current.get(slide.id) ?? 0) + delta;
        viewTimeRef.current.set(slide.id, seen);

        if (seen >= SPOTLIGHT_VIEW_MIN_MS && !reportedRef.current.has(slide.id)) {
          reportedRef.current.add(slide.id);
          pendingRef.current.add(slide.id);
        }
      }

      paint();
      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [animated, count, durationOf, goTo, preview, slides]);

  // ── Envoi des vues ───────────────────────────────────────────────────────

  React.useEffect(() => {
    if (count === 0) return;

    const flush = () => {
      if (pendingRef.current.size === 0) return;
      const ids = [...pendingRef.current].slice(0, SPOTLIGHT_VIEWS_BATCH_MAX);
      ids.forEach((id) => pendingRef.current.delete(id));
      sendBeacon({ views: ids });
    };

    const timer = window.setInterval(flush, VIEWS_FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [count]);

  // ── Ce qui retient le défilement sans geste de l'utilisateur ─────────────

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = media.matches;
    setVideoAllowed(!media.matches && slides.some((slide) => slide.video) && canStreamVideo());
    // Pas de défilement automatique pour qui l'a demandé : la pause est mise
    // d'emblée, le bouton lecture reste là pour qui veut quand même.
    if (media.matches) setUserPaused(true);

    const onVisibility = () => hold('hidden', document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const section = sectionRef.current;
    const observer =
      section && 'IntersectionObserver' in window
        ? new IntersectionObserver(
            ([entry]) => {
              const ratio = entry?.intersectionRatio ?? 0;
              visibleRatioRef.current = ratio;
              hold('offscreen', ratio < PLAY_VISIBILITY);
            },
            { threshold: [0, PLAY_VISIBILITY, VIEW_VISIBILITY, 1] },
          )
        : null;
    if (section && observer) observer.observe(section);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      window.clearTimeout(touchTimer.current);
      window.clearTimeout(programmaticTimer.current);
    };
  }, [hold, slides]);

  // ── Glissement au doigt : la diapositive qui s'est aimantée devient l'active ─

  const scrollTimer = React.useRef<number | undefined>(undefined);
  const onScroll = () => {
    if (programmaticRef.current) return;
    window.clearTimeout(scrollTimer.current);

    scrollTimer.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (!track) return;

      const padding = Number.parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;

      Array.from(track.children).forEach((child, position) => {
        const gap = Math.abs((child as HTMLElement).offsetLeft - padding - track.scrollLeft);
        if (gap < distance) {
          distance = gap;
          nearest = position;
        }
      });

      if (nearest !== indexRef.current) {
        indexRef.current = nearest;
        elapsedRef.current = 0;
        setIndex(nearest);
      }
    }, 120);
  };

  const onTouchStart = () => {
    window.clearTimeout(touchTimer.current);
    hold('touch', true);
  };
  const onTouchEnd = () => {
    window.clearTimeout(touchTimer.current);
    touchTimer.current = window.setTimeout(() => hold('touch', false), TOUCH_RELEASE_MS);
  };

  // Le survol ne vaut que pour une vraie souris : sur un écran tactile, le
  // navigateur simule un `mouseenter` au toucher, sans `mouseleave` ensuite.
  const onPointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') hold('hover', true);
  };
  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') hold('hover', false);
  };

  // Le focus ne retient que s'il vient du clavier : un bouton cliqué à la
  // souris garde le focus, et la une resterait figée sans raison visible.
  const onFocus = (event: React.FocusEvent) => {
    if ((event.target as HTMLElement).matches(':focus-visible')) hold('focus', true);
  };
  const onBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && sectionRef.current?.contains(active));
      hold('focus', inside && Boolean(active?.matches(':focus-visible')));
    }, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!animated) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(indexRef.current + 1, 'user');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(indexRef.current - 1, 'user');
    }
  };

  if (count === 0) return null;

  const pauseLabel = userPaused ? 'Relancer le défilement' : 'Mettre en pause le défilement';
  // La vidéo s'arrête avec le bouton pause, l'onglet caché ou la une hors de
  // l'écran — pas au survol : qui s'attarde regarde.
  const videoPaused = userPaused || holds.has('hidden') || holds.has('offscreen');

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carrousel"
      aria-label={title}
      className={cn('flex flex-col gap-3', className)}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <h2 className="font-display text-h2 font-bold">{title}</h2>

      <div
        className={cn(animated && 'lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-4')}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <div className="relative">
          <div
            ref={trackRef}
            onScroll={onScroll}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            className={cn(
              'relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain px-4',
              'sm:-mx-5 sm:scroll-px-5 sm:px-5',
              'lg:mx-0 lg:scroll-px-0 lg:gap-0 lg:rounded-block lg:px-0',
              '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {slides.map((slide, position) => (
              <div
                key={slide.id}
                role="group"
                aria-roledescription="diapositive"
                aria-label={`${position + 1} sur ${count}`}
                className={cn(
                  'shrink-0 snap-start',
                  animated ? 'w-[86%] md:w-[72%] lg:w-full' : 'w-full',
                )}
              >
                <Slide
                  slide={slide}
                  priority={position === 0}
                  preview={preview}
                  video={
                    videoAllowed && slide.video && position === index
                      ? { playing: !videoPaused, loop: !animated }
                      : null
                  }
                />
              </div>
            ))}
          </div>

          {animated ? (
            <div className="pointer-events-none absolute right-5 top-5 hidden items-center gap-2 lg:flex">
              {paused ? (
                <span className="rounded-full bg-white px-3 py-1.5 text-micro font-bold text-ink">
                  En pause
                </span>
              ) : null}
              <StageButton label="Événement précédent" onClick={() => goTo(index - 1, 'user')}>
                <ChevronLeft className="size-[18px]" aria-hidden />
              </StageButton>
              <StageButton label={pauseLabel} onClick={() => setUserPaused((value) => !value)}>
                {userPaused ? (
                  <Play className="size-[16px]" aria-hidden />
                ) : (
                  <Pause className="size-[16px]" aria-hidden />
                )}
              </StageButton>
              <StageButton label="Événement suivant" onClick={() => goTo(index + 1, 'user')}>
                <ChevronRight className="size-[18px]" aria-hidden />
              </StageButton>
            </div>
          ) : null}
        </div>

        {animated ? (
          <ol
            aria-label="Événements à la une"
            className="hidden max-h-[420px] flex-col gap-2 overflow-y-auto [scrollbar-width:thin] lg:flex"
          >
            {slides.map((slide, position) => (
              <li key={slide.id}>
                <button
                  type="button"
                  aria-current={position === index ? 'true' : undefined}
                  onClick={() => goTo(position, 'user')}
                  className={cn(
                    'relative grid w-full grid-cols-[56px_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-panel border bg-surface p-2 text-left transition-colors',
                    position === index
                      ? 'border-text-strong bg-surface-alt'
                      : 'border-border hover:border-border-field',
                  )}
                >
                  <span
                    className="relative size-14 overflow-hidden rounded-[10px]"
                    style={{ background: slide.color }}
                  >
                    {slide.imageUrl ? <SlideImage src={slide.imageUrl} priority={false} /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-micro font-bold uppercase tracking-[0.06em] text-text-3">
                      {slide.dateLabel}
                    </span>
                    <span className="line-clamp-2 text-body-s font-bold leading-snug text-text-strong">
                      {slide.title}
                    </span>
                    {slide.external ? (
                      <span className="text-micro font-semibold text-text-2">
                        Billetterie externe
                      </span>
                    ) : slide.placeLabel ? (
                      <span className="truncate text-micro text-text-2">{slide.placeLabel}</span>
                    ) : null}
                  </span>
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]">
                    <span
                      ref={(element) => {
                        queueRefs.current[position] = element;
                      }}
                      className="block h-full origin-left bg-coral [transform:scaleX(0)]"
                    />
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {animated ? (
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex flex-1 gap-1.5">
            {slides.map((slide, position) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Aller à : ${slide.title}`}
                aria-current={position === index ? 'true' : undefined}
                onClick={() => goTo(position, 'user')}
                className="relative h-1 flex-1 rounded-full bg-border after:absolute after:inset-x-0 after:-inset-y-3 after:content-['']"
              >
                <span
                  ref={(element) => {
                    segmentRefs.current[position] = element;
                  }}
                  aria-hidden
                  className="absolute inset-0 origin-left rounded-full bg-coral [transform:scaleX(0)]"
                />
              </button>
            ))}
          </div>
          <span aria-hidden className="min-w-[52px] text-right text-micro font-bold text-text-2">
            {paused ? 'En pause' : `${index + 1} / ${count}`}
          </span>
          <button
            type="button"
            aria-label={pauseLabel}
            onClick={() => setUserPaused((value) => !value)}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-text-strong"
          >
            {userPaused ? (
              <Play className="size-4" aria-hidden />
            ) : (
              <Pause className="size-4" aria-hidden />
            )}
          </button>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Slide({
  slide,
  priority,
  preview,
  video,
}: {
  slide: SpotlightView;
  priority: boolean;
  preview: boolean;
  /** Présent pour la diapositive affichée, quand sa vidéo peut être lue. */
  video: { playing: boolean; loop: boolean } | null;
}) {
  const external = slide.external;

  const body = (
    <>
      <div className="absolute inset-0" style={{ background: slide.color }}>
        {slide.imageUrl ? (
          <SlideImage src={slide.imageUrl} priority={priority} />
        ) : slide.video ? (
          <SlideImage src={slide.video.posterUrl} priority={priority} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.25em] text-white/20">
              Nexa Kabi
            </span>
          </div>
        )}
        {slide.video && video ? (
          <SlideVideo
            src={slide.video.url}
            poster={slide.video.posterUrl}
            playing={video.playing}
            loop={video.loop}
          />
        ) : null}
      </div>

      <div aria-hidden className="ink-scrim pointer-events-none absolute inset-0" />
      {/* Sur téléphone, le texte monte haut dans la carte : un voile plus long
          garde la date lisible même sur un visuel clair. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(18_16_43/0.5)_0%,rgb(18_16_43/0.35)_60%,rgb(18_16_43/0.12)_100%)] lg:hidden"
      />
      {/* Sur la scène large, le texte tient à gauche : un second voile le rend
          lisible quel que soit le visuel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgb(18_16_43/0.7)_0%,transparent_62%)] lg:block"
      />

      {slide.sponsored ? (
        <span className="absolute left-4 top-4 rounded-chip bg-black/45 px-2 py-1 text-micro font-semibold text-white/90 backdrop-blur-sm sm:left-5 sm:top-5 lg:left-8 lg:top-7">
          Sponsorisé
        </span>
      ) : null}

      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5 text-white sm:inset-x-5 sm:bottom-5 lg:inset-x-8 lg:bottom-8 lg:max-w-[620px] lg:gap-2">
        <div className="flex flex-wrap gap-1.5">
          {slide.categoryName ? <Badge tone="overlay">{slide.categoryName}</Badge> : null}
          {external ? (
            <Badge tone="overlay-accent">
              Billetterie externe
              <ArrowUpRight className="size-3" aria-hidden />
            </Badge>
          ) : null}
        </div>

        <p className="eyebrow text-coral-200">{slide.dateLabel}</p>

        <h3 className="line-clamp-2 font-display text-[24px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[28px] lg:text-[44px] lg:leading-none">
          {slide.title}
        </h3>

        {slide.placeLabel ? (
          <p className="truncate text-body-s text-on-ink-soft">{slide.placeLabel}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span
            className={cn(
              'inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-body-s font-bold text-ink transition-colors',
              external ? 'bg-white group-hover:bg-white/90' : 'bg-coral group-hover:bg-coral-hover',
            )}
          >
            {slide.ctaLabel}
            {external ? <ArrowUpRight className="size-4" aria-hidden /> : null}
          </span>
          {slide.priceLabel && !external ? (
            <span className="text-body font-bold text-white">{slide.priceLabel}</span>
          ) : null}
        </div>

        {/* Externe : le prix saisi, le vendeur et le domaine tiennent sur une
            ligne de note — le badge dit déjà que la vente se fait ailleurs. */}
        {external ? (
          <p className="line-clamp-2 text-micro text-on-ink-soft">
            {[slide.priceLabel, `Vendu par ${external.organizerName}`, external.host]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </>
  );

  const className =
    'group relative block h-[360px] overflow-hidden rounded-[20px] bg-ink text-white lg:h-[420px] lg:rounded-none';

  // Aperçu : la même diapositive, qui ne compte rien et ne mène nulle part.
  if (preview) {
    return <div className={className}>{body}</div>;
  }

  // Externe : une route du site qui compte le clic puis redirige, dans un
  // nouvel onglet — le visiteur garde Nexa Kabi ouvert derrière.
  if (external) {
    return (
      <a href={slide.href} target="_blank" rel="noopener" draggable={false} className={className}>
        {body}
        <span className="sr-only"> (ouvre le site officiel dans un nouvel onglet)</span>
      </a>
    );
  }

  return (
    <Link
      href={slide.href}
      prefetch={false}
      draggable={false}
      className={className}
      onClick={() => sendBeacon({ click: slide.id })}
    >
      {body}
    </Link>
  );
}

function SlideImage({ src, priority }: { src: string; priority: boolean }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

/**
 * La vidéo d'une diapositive : muette, en ligne, sans contrôles — la une n'est
 * pas un lecteur. Invisible tant qu'elle n'a pas de quoi jouer : l'image reste
 * l'affiche, et rien ne clignote. Une vidéo qui échoue s'efface sans bruit.
 */
function SlideVideo({
  src,
  poster,
  playing,
  loop,
}: {
  src: string;
  poster: string;
  playing: boolean;
  loop: boolean;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Le son coupé par la PROPRIÉTÉ : c'est elle que lisent les règles de
    // lecture automatique des navigateurs, pas l'attribut.
    element.muted = true;

    if (playing) {
      void element.play().catch(() => setFailed(true));
    } else {
      element.pause();
    }
  }, [playing]);

  if (failed) return null;

  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      muted
      playsInline
      loop={loop}
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden
      tabIndex={-1}
      onCanPlay={() => setReady(true)}
      onError={() => setFailed(true)}
      className={cn(
        'pointer-events-none absolute inset-0 size-full object-cover transition-opacity duration-500',
        ready ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/**
 * L'appareil peut-il lire une vidéo sans peser sur son forfait ?
 *
 * Non si l'économie de données est demandée, ou sur une connexion 3G ou moins.
 * Un navigateur qui ne dit rien de sa connexion (Safari, Firefox) est supposé
 * capable — c'est surtout le cas des ordinateurs.
 */
function canStreamVideo(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;

  if (connection?.saveData) return false;
  if (connection?.effectiveType && ['slow-2g', '2g', '3g'].includes(connection.effectiveType)) {
    return false;
  }

  return document.createElement('video').canPlayType('video/mp4') !== '';
}

function StageButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/30"
    >
      {children}
    </button>
  );
}

/**
 * Mesure envoyée sans retenir la page : `sendBeacon` part même quand le
 * visiteur s'en va, ce qui est exactement le moment d'un clic.
 */
function sendBeacon(payload: { views: string[] } | { click: string }) {
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon?.('/api/spotlights', new Blob([body], { type: 'application/json' }))) {
      return;
    }
  } catch {
    // On retombe sur `fetch` ci-dessous.
  }

  void fetch('/api/spotlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
