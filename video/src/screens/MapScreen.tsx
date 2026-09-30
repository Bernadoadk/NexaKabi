import React from 'react';
import { ArrowRight, Clock, LocateFixed, MapPin } from 'lucide-react';
import { config } from '../config';
import type { CategorySlug, DemoEvent } from '../config.types';
import { Badge } from '../components/ui/Badge';
import { CategoryIcon } from '../components/ui/CategoryIcon';
import { EventCover } from '../components/ui/EventCover';
import { StatusSpacer } from '../components/motion/Frames';
import { ramp, SPRINGS, sp } from '../lib/anim';
import { formatEventCaption, formatMoney, formatTimeCompact, parseDate } from '../lib/format';
import { useTime } from '../lib/time';
import { BottomNav, PublicHeader } from './shared';

/** Zone de la carte dans l'écran (pixels CSS du téléphone). */
export const MAP_AREA = { top: 226, height: 456, width: 360 } as const;

/** Position d'une épingle dans l'écran entier, pour placer le curseur. */
export function pinPosition(event: DemoEvent) {
  return { x: event.map.x * MAP_AREA.width, y: MAP_AREA.top + event.map.y * MAP_AREA.height };
}

/**
 * Carte des événements, mobile (`app/(public)/carte/`, écran P6).
 *
 * Le fond est un plan stylisé de Cotonou (lac Nokoué, lagune, océan) : la
 * vraie page affiche Google Maps, qu'on ne reproduit pas. Les épingles, la
 * fiche et le bouton « Autour de moi » sont ceux de l'application.
 */
export const MapScreen: React.FC<{
  /** Début de la chute des épingles (temps de la scène). */
  dropStart: number;
  /** Épingle touchée et fiche ouverte (0 → 1). */
  selectedId?: string;
  openAt?: number;
}> = ({ dropStart, selectedId, openAt }) => {
  const time = useTime();
  const events = config.data.events;

  const legend = new Map<CategorySlug, number>();
  for (const event of events) legend.set(event.category, (legend.get(event.category) ?? 0) + 1);

  const selected = events.find((event) => event.id === selectedId);
  const open = openAt === undefined ? 0 : sp(time, openAt, SPRINGS.snappy);

  return (
    <div className="relative h-full bg-paper">
      <StatusSpacer />
      <PublicHeader />

      <div className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <p className="eyebrow m-0 text-text-3">Autour de toi</p>
          <h1 className="m-0 font-display text-[26px] font-bold leading-[1.1] tracking-[-0.02em]">
            Carte des événements
          </h1>
        </div>
        <div className="-mx-4 flex gap-2 overflow-hidden px-4">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-body-s font-semibold text-white">
            Toutes · {events.length}
          </span>
          {[...legend.entries()].map(([slug, count]) => (
            <span
              key={slug}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2"
            >
              <span
                className="flex size-5 items-center justify-center rounded-full text-white"
                style={{ background: config.categories[slug].color }}
              >
                <CategoryIcon slug={slug} className="size-3" strokeWidth={2.5} />
              </span>
              {config.categories[slug].name} · {count}
            </span>
          ))}
        </div>
      </div>

      <div
        className="absolute inset-x-0 overflow-hidden border-y border-border"
        style={{ top: MAP_AREA.top, height: MAP_AREA.height }}
      >
        <CityMap />

        {events.map((event, index) => {
          const drop = sp(time, dropStart + index * 3.5, SPRINGS.bouncy);
          const isSelected = event.id === selectedId;
          return (
            <PinMarker
              key={event.id}
              event={event}
              style={{
                opacity: ramp(time, dropStart + index * 3.5, dropStart + index * 3.5 + 4),
                transform: `translate(-50%, -100%) translateY(${(1 - drop) * -70}px) scale(${isSelected ? 1 + open * 0.14 : 1})`,
                zIndex: isSelected ? 5 : 1,
              }}
            />
          );
        })}

        {selected && open > 0.01 ? <PinCard event={selected} open={open} /> : null}

        <div className="absolute bottom-4 left-1/2 inline-flex min-h-[44px] -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 text-body-s font-bold text-white shadow-lg">
          <LocateFixed className="size-[18px]" />
          Autour de moi
        </div>
      </div>

      <BottomNav active="Découvrir" />
    </div>
  );
};

/** L'épingle de l'application : goutte colorée, icône blanche, bord blanc. */
const PinMarker: React.FC<{ event: DemoEvent; style: React.CSSProperties }> = ({
  event,
  style,
}) => {
  const tint = config.categories[event.category].color;
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: event.map.x * MAP_AREA.width,
        top: event.map.y * MAP_AREA.height,
        ...style,
      }}
    >
      <span
        className="flex size-[38px] items-center justify-center rounded-full border-[2.5px] border-white text-white shadow-md"
        style={{ background: tint }}
      >
        <CategoryIcon slug={event.category} className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span
        className="-mt-[3px] block size-0 border-x-[7px] border-t-[9px] border-x-transparent"
        style={{ borderTopColor: tint }}
      />
      <span className="mt-0.5 block h-1 w-3 rounded-full bg-ink/30 blur-[1px]" />
    </div>
  );
};

/** La fiche qui s'ouvre sous l'épingle (placement « dessous » de l'application). */
const PinCard: React.FC<{ event: DemoEvent; open: number }> = ({ event, open }) => {
  const start = parseDate(event.start);
  const end = parseDate(event.end);
  const x = Math.min(Math.max(event.map.x * MAP_AREA.width, 150), MAP_AREA.width - 150);
  return (
    <div
      className="absolute z-10 w-[280px]"
      style={{
        left: x,
        top: event.map.y * MAP_AREA.height + 14,
        transform: `translateX(-50%) translateY(${(1 - open) * 12}px) scale(${0.92 + open * 0.08})`,
        transformOrigin: '50% 0',
        opacity: Math.min(1, open * 1.5),
      }}
    >
      <span className="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-l border-t border-border bg-surface" />
      <div className="overflow-hidden rounded-card border border-border bg-surface text-text shadow-lg">
        <div className="relative h-[118px] overflow-hidden bg-ink">
          <div
            className="absolute inset-0"
            style={{ background: config.categories[event.category].color }}
          />
          <EventCover event={event} />
          <div className="ink-scrim-soft absolute inset-0" />
          <div className="absolute left-2.5 top-2.5 flex gap-1.5">
            <Badge tone="overlay">
              <CategoryIcon slug={event.category} className="size-3" strokeWidth={2.5} />
              {config.categories[event.category].name}
            </Badge>
          </div>
          <div className="absolute inset-x-3 bottom-2.5 text-white">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-coral-200">
              {formatEventCaption(start)} · {formatTimeCompact(start)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-3.5 pb-3 pt-2.5">
          <h3 className="m-0 font-display text-[16px] font-bold leading-tight tracking-[-0.01em] text-text-strong">
            {event.title}
          </h3>
          <p className="m-0 flex items-start gap-1.5 text-body-s text-text-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-text-3" />
            {event.venue}, {event.city}
          </p>
          <p className="m-0 flex items-center gap-1.5 text-body-s text-text-2">
            <Clock className="size-3.5 shrink-0 text-text-3" />
            {formatTimeCompact(start)} → {formatTimeCompact(end)}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
            <span className="whitespace-nowrap text-body font-bold text-text-strong">
              {event.price === 0 ? 'Gratuit' : `Dès ${formatMoney(event.price)}`}
            </span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-body-s font-bold text-coral">
              Voir l’événement
              <ArrowRight className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Plan stylisé de Cotonou : lac au nord, lagune au centre, océan au sud. */
const CityMap: React.FC = () => {
  const water = '#C6DDF0';
  const road = '#FFFFFF';
  const casing = '#E2DDD2';
  const major = [
    'M0 380 C 90 388, 170 384, 250 390 S 330 384, 360 386',
    'M0 234 C 80 226, 160 238, 236 230 S 320 236, 360 230',
    'M118 58 C 116 150, 126 250, 120 384',
    'M186 50 C 190 150, 182 260, 196 388',
    'M302 56 C 298 160, 308 280, 302 392',
    'M150 138 C 200 130, 260 148, 360 136',
  ];
  const minor = [
    'M0 110 L 360 96',
    'M0 170 L 230 164',
    'M0 300 L 360 292',
    'M0 336 L 230 344',
    'M60 60 L 70 380',
    'M150 60 L 160 380',
    'M260 70 L 270 390',
    'M330 60 L 336 390',
  ];

  return (
    <svg
      viewBox={`0 0 ${MAP_AREA.width} ${MAP_AREA.height}`}
      className="absolute inset-0 size-full"
      preserveAspectRatio="none"
    >
      <rect width="360" height="456" fill="#F1EEE7" />
      <rect
        x="24"
        y="252"
        width="118"
        height="30"
        rx="6"
        fill="#E7E3DA"
        transform="rotate(-6 83 267)"
      />
      <line
        x1="34"
        y1="272"
        x2="134"
        y2="261"
        stroke="#FFFFFF"
        strokeWidth="3"
        strokeDasharray="8 6"
      />
      {[
        [58, 146, 50, 34],
        [276, 250, 48, 30],
        [150, 302, 40, 26],
        [212, 84, 34, 26],
      ].map(([x, y, w, h], index) => (
        <rect key={index} x={x} y={y} width={w} height={h} rx={8} fill="#DCEAD5" />
      ))}
      <g fill="none" strokeLinecap="round">
        {minor.map((d) => (
          <path key={d} d={d} stroke={road} strokeWidth={3} />
        ))}
        {major.map((d) => (
          <path key={`c${d}`} d={d} stroke={casing} strokeWidth={10} />
        ))}
        {major.map((d) => (
          <path key={d} d={d} stroke={road} strokeWidth={7} />
        ))}
      </g>
      <path d="M0 0 H360 V36 C 300 52, 250 30, 200 44 C 150 58, 90 34, 0 50 Z" fill={water} />
      <path
        d="M226 40 C 238 120, 214 200, 236 280 S 250 360, 246 408"
        fill="none"
        stroke={water}
        strokeWidth={20}
      />
      <path d="M0 392 C 80 402, 160 398, 240 404 S 330 396, 360 400 V456 H0 Z" fill="#F2E4C0" />
      <path d="M0 402 C 80 412, 160 408, 240 414 S 330 406, 360 410 V456 H0 Z" fill={water} />
      <g
        fontFamily="var(--font-sans)"
        fontSize="8.5"
        fontWeight="700"
        letterSpacing="0.1em"
        fill="#A29FAF"
        style={{ textTransform: 'uppercase' }}
      >
        <text x="18" y="354">
          Fidjrossè
        </text>
        <text x="30" y="202">
          Cadjèhoun
        </text>
        <text x="96" y="326">
          Haie Vive
        </text>
        <text x="196" y="346">
          Ganhi
        </text>
        <text x="262" y="204">
          Akpakpa
        </text>
        <text x="70" y="134">
          Gbégamey
        </text>
        <text x="34" y="296" fontSize="7.5">
          Aéroport
        </text>
      </g>
      <g
        fontFamily="var(--font-sans)"
        fontSize="9"
        fontStyle="italic"
        fontWeight="600"
        fill="#7FA3C4"
      >
        <text x="16" y="24">
          Lac Nokoué
        </text>
        <text x="120" y="440">
          Océan Atlantique
        </text>
        <text x="0" y="0" transform="translate(221 118) rotate(86)">
          Lagune
        </text>
      </g>
    </svg>
  );
};
