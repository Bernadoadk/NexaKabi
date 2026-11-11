import React, { useId } from 'react';
import type { Friend, HairStyle } from '../config.types';

/**
 * Les personnages de la vidéo « Jeunesse », dessinés en SVG.
 *
 * `FriendAvatar` : la pastille de profil (discussion, billets, scanner).
 * `FriendSilhouette` : le même personnage de dos, en contre-jour, au concert.
 * La coiffure suffit à reconnaître chacun : chignon, coupe haute, foulard
 * en wax, cheveux courts et lunettes.
 */

/** Assombrit (ratio < 0) ou éclaircit (ratio > 0) une couleur « #RRGGBB ». */
export function shade(hex: string, ratio: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    const next = ratio < 0 ? c * (1 + ratio) : c + (255 - c) * ratio;
    return Math.round(Math.max(0, Math.min(255, next)));
  };
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const HAIR = '#17100D';
const FEATURES = '#1A0F0A';

/** Motif wax du foulard : fond corail, ronds ambre, cœur encre. */
const WaxPattern: React.FC<{ id: string; scale?: number }> = ({ id, scale = 1 }) => (
  <pattern
    id={id}
    width={11 * scale}
    height={11 * scale}
    patternUnits="userSpaceOnUse"
    patternTransform="rotate(18)"
  >
    <rect width={11 * scale} height={11 * scale} fill="#FF4D2E" />
    <circle cx={5.5 * scale} cy={5.5 * scale} r={3.4 * scale} fill="#FFD27A" />
    <circle cx={5.5 * scale} cy={5.5 * scale} r={1.4 * scale} fill="#12102B" />
    <circle cx={0} cy={0} r={1.2 * scale} fill="#FFEDE8" />
    <circle cx={11 * scale} cy={11 * scale} r={1.2 * scale} fill="#FFEDE8" />
  </pattern>
);

/** Cheveux derrière la tête (chignon, foulard). */
function HairBack({ style, wax }: { style: HairStyle; wax: string }) {
  if (style === 'puff') return <circle cx="50" cy="14.5" r="12.5" fill={HAIR} />;
  if (style === 'headwrap') {
    return (
      <g>
        <ellipse cx="61" cy="11" rx="10.5" ry="7" transform="rotate(24 61 11)" fill={wax} />
        <path d="M54 6 Q 61 13 68 9" stroke="#12102B" strokeOpacity="0.35" strokeWidth="1.4" fill="none" />
      </g>
    );
  }
  return null;
}

/** Cheveux devant (racine sur le front). */
function HairFront({ style, wax }: { style: HairStyle; wax: string }) {
  switch (style) {
    case 'puff':
      return (
        <g>
          <path
            d="M32 45 C 30 21, 70 21, 68 45 C 66 36, 60 31.5, 50 31.5 C 40 31.5, 34 36, 32 45 Z"
            fill={HAIR}
          />
          {/* Élastique corail du chignon */}
          <ellipse cx="50" cy="24.8" rx="6.2" ry="2.1" fill="#FF4D2E" />
        </g>
      );
    case 'hightop':
      return (
        <path
          d="M32 41 L 32.6 21 Q 33.4 10 43 9.5 L 57 9.5 Q 66.6 10 67.4 21 L 68 41 C 64 32.5, 58 29.5, 50 29.5 C 42 29.5, 36 32.5, 32 41 Z"
          fill={HAIR}
        />
      );
    case 'headwrap':
      return (
        <g>
          <path
            d="M29 45 C 25 19, 40 6, 55 7.5 C 70 9, 77 23, 71 45 C 66 35, 59 30.5, 50 30.5 C 41 30.5, 34 35, 29 45 Z"
            fill={wax}
          />
          <path
            d="M31 38 C 38 30, 62 28, 70 37"
            stroke="#12102B"
            strokeOpacity="0.28"
            strokeWidth="1.5"
            fill="none"
          />
        </g>
      );
    case 'short':
      return (
        <path
          d="M32.5 43 C 30.5 23.5, 69.5 23.5, 67.5 43 C 65.5 34.5, 60 30.8, 50 30.8 C 40 30.8, 34.5 34.5, 32.5 43 Z"
          fill={HAIR}
        />
      );
  }
}

export const FriendAvatar: React.FC<{
  friend: Friend;
  size: number;
  /** Anneau autour de la pastille (couleur), par exemple pour la séparer d'un fond. */
  ring?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ friend, size, ring, className, style }) => {
  const raw = useId();
  const id = `f${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const skinShadow = shade(friend.skin, -0.18);
  const wax = `url(#${id}-wax)`;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{
        borderRadius: '50%',
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 ${Math.max(2, size * 0.045)}px ${ring}` : undefined,
        ...style,
      }}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <WaxPattern id={`${id}-wax`} />
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="100" height="100" fill={friend.color} />
        <HairBack style={friend.hair} wax={wax} />
        {/* Cou et épaules */}
        <path d="M42.5 58 L 42.5 74 Q 50 79 57.5 74 L 57.5 58 Z" fill={skinShadow} />
        <path
          d="M8 106 C 8 85, 25 74.5, 42 72.5 Q 50 78.5 58 72.5 C 75 74.5, 92 85, 92 106 Z"
          fill={friend.top}
        />
        <path
          d="M42 72.5 Q 50 80.5 58 72.5"
          stroke={shade(friend.top, -0.3)}
          strokeWidth="2.2"
          fill="none"
        />
        {/* Oreilles, tête */}
        <ellipse cx="32.6" cy="47" rx="3.6" ry="5" fill={friend.skin} />
        <ellipse cx="67.4" cy="47" rx="3.6" ry="5" fill={friend.skin} />
        <ellipse cx="50" cy="44.5" rx="17.6" ry="20.6" fill={friend.skin} />
        <HairFront style={friend.hair} wax={wax} />
        {/* Visage : deux yeux, un sourire */}
        <ellipse cx="43.2" cy="47" rx="1.9" ry="2.35" fill={FEATURES} />
        <ellipse cx="56.8" cy="47" rx="1.9" ry="2.35" fill={FEATURES} />
        <path
          d="M44.2 55 Q 50 60 55.8 55"
          stroke={FEATURES}
          strokeWidth="1.9"
          strokeLinecap="round"
          fill="none"
        />
        {friend.glasses ? (
          <g stroke="#12102B" strokeWidth="1.7" fill="rgba(255,255,255,0.14)">
            <circle cx="43.2" cy="46.8" r="5.4" />
            <circle cx="56.8" cy="46.8" r="5.4" />
            <path d="M48.6 46.2 Q 50 45.2 51.4 46.2" fill="none" />
          </g>
        ) : null}
        {friend.earrings ? (
          <g stroke="#F0A92E" strokeWidth="1.7" fill="none">
            <circle cx="32" cy="54.5" r="3" />
            <circle cx="68" cy="54.5" r="3" />
          </g>
        ) : null}
      </g>
    </svg>
  );
};

/**
 * Le personnage de dos, en contre-jour : épaules, tête, coiffure, et un bras
 * levé (`arm`, en degrés depuis la verticale) qui peut tenir un téléphone.
 * Dessiné dans un cadre de 200 × 260 ; `size` est la largeur affichée.
 */
export const FriendSilhouette: React.FC<{
  friend: Friend;
  size: number;
  arm?: number;
  /** Le bras levé tient un téléphone qui filme (écran lumineux). */
  phone?: boolean;
  /** Couleur du liseré de lumière venu de la scène. */
  rim?: string;
  bounce?: number;
  style?: React.CSSProperties;
}> = ({ friend, size, arm, phone = false, rim = '#FF9E86', bounce = 0, style }) => {
  const raw = useId();
  const id = `s${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const body = '#0A0712';
  const shape = (fill: string) => (
    <g fill={fill}>
      {/* Bras levé (derrière la tête) */}
      {arm !== undefined ? (
        <g transform={`rotate(${arm} ${arm > 0 ? 150 : 50} 150)`}>
          <rect x={arm > 0 ? 139 : 39} y="40" width="22" height="118" rx="11" />
          <circle cx={arm > 0 ? 150 : 50} cy="40" r="15" />
          {phone ? (
            <rect
              x={(arm > 0 ? 150 : 50) - 15}
              y="0"
              width="30"
              height="50"
              rx="6"
              transform={`rotate(${-arm * 0.6} ${arm > 0 ? 150 : 50} 25)`}
            />
          ) : null}
        </g>
      ) : null}
      {/* Épaules */}
      <path d="M8 262 C 8 196, 44 170, 78 164 L 122 164 C 156 170, 192 196, 192 262 Z" />
      {/* Cou */}
      <rect x="84" y="128" width="32" height="44" rx="12" />
      {/* Tête et coiffure */}
      <ellipse cx="100" cy="104" rx="36" ry="42" />
      {friend.hair === 'puff' ? <circle cx="100" cy="46" r="27" /> : null}
      {friend.hair === 'hightop' ? (
        <path d="M64 100 L 65 50 Q 67 30 86 29 L 114 29 Q 133 30 135 50 L 136 100 Z" />
      ) : null}
      {friend.hair === 'headwrap' ? (
        <g>
          <path d="M58 104 C 50 52, 82 30, 108 32 C 136 34, 152 60, 142 104 Z" />
          <ellipse cx="124" cy="36" rx="22" ry="14" transform="rotate(24 124 36)" />
        </g>
      ) : null}
    </g>
  );

  const phoneScreen =
    phone && arm !== undefined ? (
      <g transform={`rotate(${arm} ${arm > 0 ? 150 : 50} 150)`}>
        <rect
          x={(arm > 0 ? 150 : 50) - 12}
          y="3"
          width="24"
          height="42"
          rx="4"
          fill={`url(#${id}-screen)`}
          transform={`rotate(${-arm * 0.6} ${arm > 0 ? 150 : 50} 25)`}
        />
      </g>
    ) : null;

  return (
    <svg
      viewBox="-20 -40 240 310"
      width={size}
      height={(size * 310) / 240}
      style={{ overflow: 'visible', transform: `translateY(${-bounce}px)`, ...style }}
    >
      <defs>
        <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4E0" />
          <stop offset="0.55" stopColor="#FF9E86" />
          <stop offset="1" stopColor="#7FB2FF" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {/* Liseré de lumière : la même forme, décalée vers le haut, floutée */}
      <g transform="translate(0 -4)" opacity="0.85" filter={`url(#${id}-glow)`}>
        {shape(rim)}
      </g>
      <g transform="translate(0 -2.5)" opacity="0.9">
        {shape(rim)}
      </g>
      {shape(body)}
      {phoneScreen}
    </svg>
  );
};
