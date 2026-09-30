import React from 'react';
import { config } from '../config';
import { QrCode } from '../components/ui/Ticket';
import { seeded } from '../lib/anim';
import { referenceSuffix } from '../lib/format';
import { cn } from '../lib/layout';
import { useTime } from '../lib/time';

/** Centre du cadre de visée dans l'écran du téléphone. */
export const VIEWFINDER = { x: 180, y: 372, size: 224 } as const;

/**
 * Scanner du contrôleur (`app/(scan)/scan/[eventId]/scanner.tsx`, écrans C2 à C5).
 *
 * Le flux caméra est simulé (entrée de salle de nuit, lumières floues) ; le
 * cadre de visée, les compteurs, le bandeau « Hors ligne » et le verdict
 * plein écran sont ceux de l'application.
 */
export const ScannerScreen: React.FC<{
  /** Arrivée du téléphone du participant dans le cadre (0 → 1). */
  held: number;
  /** Éclair de lecture (0 → 1 → 0). */
  flash: number;
  /** Verdict vert (0 → 1). */
  verdict: number;
  entries: number;
  pending: number;
}> = ({ held, flash, verdict, entries, pending }) => {
  const time = useTime();
  const [standard] = config.data.tickets;
  const reference = `${config.data.orderReference}-01`;

  return (
    <div className="relative h-full overflow-hidden bg-ink-900 text-white">
      <CameraFeed t={time} />
      <div className="absolute inset-0 bg-ink/35" />

      {/* Téléphone du participant, tenu devant la caméra. */}
      <div
        className="absolute"
        style={{
          left: VIEWFINDER.x,
          top: VIEWFINDER.y,
          transform: `translate(-50%, -50%) translate(${(1 - held) * 170}px, ${(1 - held) * 260}px) rotate(${(1 - held) * 18 - 4}deg) scale(${1.05 - held * 0.05})`,
          filter: `blur(${(1 - held) * 3}px)`,
        }}
      >
        <div
          className="rounded-[26px] p-[7px]"
          style={{ background: '#0B0918', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', width: 176 }}
        >
          <div className="flex flex-col items-center gap-2 rounded-[20px] bg-ink px-3 pb-4 pt-6">
            <span className="eyebrow text-white/60">Pass Standard</span>
            <div className="rounded-[10px] bg-white p-1.5">
              <QrCode text={`https://${config.brand.url}`} size={128} />
            </div>
            <span className="tabular text-[9px] text-white/50">{reference}</span>
          </div>
        </div>
      </div>

      {/* Cadre de visée : quatre coins et la ligne corail. */}
      <div
        className="absolute"
        style={{
          left: VIEWFINDER.x - VIEWFINDER.size / 2,
          top: VIEWFINDER.y - VIEWFINDER.size / 2,
          width: VIEWFINDER.size,
          height: VIEWFINDER.size,
        }}
      >
        <Corner className="left-0 top-0 border-l-4 border-t-4" />
        <Corner className="right-0 top-0 border-r-4 border-t-4" />
        <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
        <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
        <span
          className="absolute inset-x-0 h-0.5 bg-coral"
          style={{
            top: `${50 + Math.sin(time / 7) * 38}%`,
            opacity: 0.55 + 0.45 * Math.abs(Math.sin(time / 9)),
          }}
        />
      </div>

      <div className="absolute inset-x-0 top-[34px] flex items-start justify-between gap-3 p-4">
        <span className="rounded-chip bg-ink/70 px-3 py-2 text-body-s font-semibold">
          ← Événements
        </span>
        <span className="rounded-chip bg-amber-400 px-3 py-2 text-micro font-bold text-ink">
          Hors ligne · le scan continue
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-ink to-transparent p-4 pb-[26px] pt-10">
        <div className="flex items-center justify-between gap-3">
          <Counter label="Entrées" value={entries} />
          <Counter label="En attente" value={pending} amber={pending > 0} />
          <Counter label="Carnet" value={config.data.scanner.manifest} />
        </div>
        <div className="flex gap-2">
          {['Torche', 'Recherche', 'Historique'].map((label) => (
            <span
              key={label}
              className="grid min-h-[52px] flex-1 place-items-center rounded-button bg-white/12 text-[14px] font-bold"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {flash > 0 ? (
        <div className="absolute inset-0 bg-white" style={{ opacity: flash * 0.55 }} />
      ) : null}

      {verdict > 0 ? (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-mint px-8 text-center text-ink"
          style={{
            clipPath: `circle(${verdict * 120}% at ${(VIEWFINDER.x / 360) * 100}% ${(VIEWFINDER.y / 760) * 100}%)`,
          }}
        >
          <span
            className="font-display text-[104px] leading-none"
            style={{ transform: `scale(${0.6 + Math.min(1, verdict * 1.2) * 0.4})` }}
          >
            ✓
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="m-0 font-display text-h1 font-bold leading-tight tracking-[-0.02em]">
              Entrée autorisée
            </h2>
            <p className="m-0 text-[19px] font-bold">{config.data.buyer.name}</p>
            <p className="m-0 text-body-s opacity-70">
              {standard.name} · {referenceSuffix(reference)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};

const Corner: React.FC<{ className: string }> = ({ className }) => (
  <span className={cn('absolute size-8 border-white/90', className)} />
);

const Counter: React.FC<{ label: string; value: number; amber?: boolean }> = ({
  label,
  value,
  amber = false,
}) => (
  <div className="flex flex-1 flex-col items-center gap-0.5">
    <span
      className={cn(
        'tabular font-display text-[24px] font-bold',
        amber ? 'text-amber-400' : 'text-white',
      )}
    >
      {value}
    </span>
    <span className="text-micro text-white/50">{label}</span>
  </div>
);

/** Flux caméra simulé : l'entrée d'une salle, de nuit, floue. */
const CameraFeed: React.FC<{ t: number }> = ({ t }) => (
  <svg
    viewBox="0 0 360 760"
    preserveAspectRatio="xMidYMid slice"
    className="absolute inset-0 size-full"
  >
    <defs>
      <linearGradient id="feed-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1B1433" />
        <stop offset="0.55" stopColor="#3A1E3F" />
        <stop offset="1" stopColor="#120C1C" />
      </linearGradient>
      <filter id="feed-blur" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
    </defs>
    <rect width="360" height="760" fill="url(#feed-sky)" />
    <g filter="url(#feed-blur)">
      {Array.from({ length: 16 }, (_, index) => (
        <circle
          key={index}
          cx={seeded(index + 1) * 360 + Math.sin(t / 30 + index) * 6}
          cy={seeded(index + 40) * 480 + 40}
          r={14 + seeded(index + 80) * 26}
          fill={['#FF9E86', '#FFD27A', '#7FB2FF', '#FF4DB8'][index % 4]}
          opacity={0.35}
        />
      ))}
      {Array.from({ length: 7 }, (_, index) => (
        <g key={`p${index}`} fill="#0B0918" opacity={0.85}>
          <circle cx={20 + index * 55} cy={560 + seeded(index + 9) * 30} r={24} />
          <rect
            x={-10 + index * 55}
            y={585 + seeded(index + 9) * 30}
            width={62}
            height={220}
            rx={28}
          />
        </g>
      ))}
    </g>
  </svg>
);
