import React from 'react';
import { CheckCheck, ChevronLeft, Ticket } from 'lucide-react';
import { config } from '../../config';
import { EventCover } from '../../components/ui/EventCover';
import { SPRINGS, sp } from '../../lib/anim';
import { formatEventCaption, heroEvent, parseDate } from '../../lib/format';
import { useTime } from '../../lib/time';
import { jeunesse } from '../config';
import type { ChatLine, Friend, FriendId } from '../config.types';
import { FriendAvatar } from './Friends';

/**
 * La discussion de groupe de la bande. Une messagerie générique, aux
 * couleurs de Nexa Kabi : aucune marque de réseau social n'est reproduite.
 *
 * Toutes les tailles découlent de `size`, la taille du texte en pixels.
 * Les bulles des autres sont blanches ; celles d'Aïcha, qui tient le
 * téléphone, sont corail (texte encre, règle de la marque).
 */

export const friendOf = (line: ChatLine): Friend =>
  jeunesse.friends[(line.from ?? 'aicha') as FriendId];

const SHADOW = (size: number) =>
  `0 ${size * 0.45}px ${size * 0.9}px -${size * 0.45}px rgba(4, 3, 12, 0.65)`;

/** Hauteurs fixes (emoji compris) : les piles de messages se calculent sans mesure. */
const TEXT_LINE = 1.22;
const NAME_LINE = 0.72;
const PAD_TOP = 0.36;
const PAD_BOTTOM = 0.4;

/** Hauteur d'une bulle d'une ligne, en pixels. */
export function bubbleHeight(line: ChatLine, size: number): number {
  const name = line.from === undefined ? 0 : NAME_LINE + 0.06;
  return (PAD_TOP + name + TEXT_LINE + PAD_BOTTOM) * size;
}

/** Hauteur de la bulle « en train d'écrire ». */
export const typingHeight = (size: number) => 1.3 * size;

export const ChatBubble: React.FC<{
  line: ChatLine;
  size: number;
  /** Affiche la pastille de profil à gauche des messages reçus. */
  avatar?: boolean;
  /** Affiche le prénom de l'expéditeur dans la bulle (messages reçus). */
  showName?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ line, size, avatar = true, showName = true, style, children }) => {
  const mine = line.from === undefined;
  const friend = friendOf(line);
  const radius = size * 0.62;
  const tail = size * 0.16;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: mine ? 'flex-end' : 'flex-start',
        gap: size * 0.32,
        ...style,
      }}
    >
      {!mine && avatar ? <FriendAvatar friend={friend} size={size * 1.55} /> : null}
      <div
        style={{
          padding: `${size * PAD_TOP}px ${size * 0.58}px ${size * PAD_BOTTOM}px`,
          borderRadius: mine
            ? `${radius}px ${radius}px ${tail}px ${radius}px`
            : `${radius}px ${radius}px ${radius}px ${tail}px`,
          background: mine ? 'var(--color-coral)' : '#FFFFFF',
          color: 'var(--color-ink)',
          boxShadow: SHADOW(size),
          fontFamily: 'var(--font-sans)',
        }}
      >
        {!mine && showName ? (
          <div
            style={{
              fontSize: size * 0.6,
              fontWeight: 800,
              color: friend.nameColor,
              height: size * NAME_LINE,
              lineHeight: `${size * NAME_LINE}px`,
              marginBottom: size * 0.06,
            }}
          >
            {friend.name}
          </div>
        ) : null}
        {children}
        {line.text ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: size * 0.3,
              fontSize: size,
              fontWeight: 700,
              height: size * TEXT_LINE,
              lineHeight: `${size * TEXT_LINE}px`,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{line.text}</span>
            {mine ? (
              <CheckCheck
                size={size * 0.62}
                strokeWidth={2.6}
                style={{ opacity: 0.55, marginTop: size * 0.28, flexShrink: 0 }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** « … est en train d'écrire » : trois points qui sautillent. */
export const TypingBubble: React.FC<{ size: number; mine?: boolean }> = ({
  size,
  mine = false,
}) => {
  const time = useTime();
  const radius = size * 0.62;
  const tail = size * 0.16;
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          display: 'flex',
          gap: size * 0.2,
          padding: `${size * 0.5}px ${size * 0.62}px`,
          borderRadius: mine
            ? `${radius}px ${radius}px ${tail}px ${radius}px`
            : `${radius}px ${radius}px ${radius}px ${tail}px`,
          background: mine ? 'var(--color-coral-300)' : '#FFFFFF',
          boxShadow: SHADOW(size),
        }}
      >
        {[0, 1, 2].map((index) => {
          const hop = Math.max(0, Math.sin((time - index * 3) / 3.2));
          return (
            <span
              key={index}
              style={{
                width: size * 0.3,
                height: size * 0.3,
                borderRadius: '50%',
                background: mine ? 'var(--color-ink)' : 'var(--color-text-3)',
                opacity: 0.45 + hop * 0.55,
                transform: `translateY(${-hop * size * 0.16}px)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Hauteur de l'aperçu de lien (`EventLinkPreview`), marge comprise. */
export const linkPreviewHeight = (size: number) => size * 6.95;

/** Aperçu du lien de l'événement, collé dans une bulle (page `/e/…` du site). */
export const EventLinkPreview: React.FC<{ size: number }> = ({ size }) => {
  const event = heroEvent();
  const row = (height: number): React.CSSProperties => ({
    height: size * height,
    lineHeight: `${size * height}px`,
    whiteSpace: 'nowrap',
  });
  return (
    <div
      style={{
        width: size * 10.5,
        marginBottom: size * 0.32,
        borderRadius: size * 0.36,
        overflow: 'hidden',
        background: 'rgba(255, 255, 255, 0.94)',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: size * 3.6,
          background: config.categories[event.category].color,
          overflow: 'hidden',
        }}
      >
        <EventCover event={event} />
      </div>
      <div style={{ padding: `${size * 0.26}px ${size * 0.36}px ${size * 0.3}px` }}>
        <div
          style={{
            ...row(0.95),
            fontFamily: 'var(--font-display)',
            fontSize: size * 0.78,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--color-ink)',
          }}
        >
          {event.title}
        </div>
        <div
          style={{ ...row(0.8), fontSize: size * 0.56, fontWeight: 600, color: 'var(--color-text-2)' }}
        >
          {formatEventCaption(parseDate(event.start))} · {event.city}
        </div>
        <div
          style={{ ...row(0.72), fontSize: size * 0.5, fontWeight: 600, color: 'var(--color-text-3)' }}
        >
          {config.brand.url}
        </div>
      </div>
    </div>
  );
};

/** Le lien d'un billet, tel qu'Aïcha l'envoie : un par personne (`/t/…`). */
export const TicketLink: React.FC<{ friend: Friend; size: number; style?: React.CSSProperties }> = ({
  friend,
  size,
  style,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: size * 0.4,
      padding: `${size * 0.36}px ${size * 0.5}px ${size * 0.36}px ${size * 0.36}px`,
      borderRadius: size * 0.5,
      background: '#FFFFFF',
      boxShadow: `0 ${size * 0.6}px ${size * 1.2}px -${size * 0.5}px rgba(4, 3, 12, 0.7)`,
      fontFamily: 'var(--font-sans)',
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    <span
      style={{
        width: size * 1.6,
        height: size * 1.6,
        borderRadius: size * 0.42,
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-coral)',
        color: 'var(--color-ink)',
        flexShrink: 0,
      }}
    >
      <Ticket size={size * 0.9} strokeWidth={2.4} />
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', gap: size * 0.04 }}>
      <span style={{ fontSize: size * 0.72, fontWeight: 800, color: 'var(--color-ink)' }}>
        Billet de {friend.name}
      </span>
      <span style={{ fontSize: size * 0.54, fontWeight: 600, color: 'var(--color-text-3)' }}>
        {config.brand.url}/t/…
      </span>
    </span>
  </div>
);

/** Un message d'une pile : son arrivée (temps de la scène), sa bulle « … » éventuelle. */
export interface StackItem {
  key: string;
  line: ChatLine;
  at: number;
  /** Début de la bulle « en train d'écrire », remplacée par le message à `at`. */
  typingAt?: number;
  /** Contenu ajouté dans la bulle, au-dessus du texte (aperçu de lien), et sa hauteur. */
  extra?: { node: React.ReactNode; height: number };
}

/**
 * Une pile de messages ancrée en bas, comme dans une messagerie : chaque
 * nouveau message pousse les précédents vers le haut. `bottom` : ordonnée du
 * bas de la pile ; `focus` : 0 → 1, les autres messages s'effacent devant
 * celui de `focusKey`.
 */
export const ChatStack: React.FC<{
  items: StackItem[];
  size: number;
  left: number;
  width: number;
  bottom: number;
  gap?: number;
  focusKey?: string;
  focus?: number;
}> = ({ items, size, left, width, bottom, gap = size * 0.45, focusKey, focus = 0 }) => {
  const time = useTime();
  const states = items.map((item) => {
    const full = bubbleHeight(item.line, size) + (item.extra?.height ?? 0);
    const start = item.typingAt ?? item.at;
    if (time < start) return { item, slot: 0, typing: 0, arrived: 0 };
    const typing = item.typingAt === undefined ? 0 : sp(time, item.typingAt, SPRINGS.snappy);
    const arrived = time < item.at ? 0 : sp(time, item.at, SPRINGS.snappy);
    const before = item.typingAt === undefined ? 0 : typingHeight(size) * typing;
    const slot = before + (full - before) * arrived;
    return { item, slot, typing, arrived };
  });

  let offset = 0;
  const placed = states
    .map((state) => state)
    .reverse()
    .map((state) => {
      const y = bottom - offset - state.slot;
      if (state.slot > 0) offset += state.slot + gap * Math.min(1, state.slot / (size * 0.6));
      return { ...state, y };
    })
    .reverse();

  return (
    <>
      {placed.map(({ item, slot, typing, arrived, y }) => {
        if (slot <= 0) return null;
        const mine = item.line.from === undefined;
        const dim = focusKey !== undefined && item.key !== focusKey ? 1 - focus * 0.7 : 1;
        return (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              left,
              width,
              top: y,
              height: slot,
              opacity: dim,
            }}
          >
            {arrived < 1 && item.typingAt !== undefined ? (
              <div
                style={{
                  position: 'absolute',
                  left: mine ? undefined : size * 1.87,
                  right: mine ? 0 : undefined,
                  bottom: 0,
                  opacity: 1 - arrived,
                  transform: `scale(${0.7 + 0.3 * typing})`,
                  transformOrigin: mine ? '100% 100%' : '0% 100%',
                }}
              >
                <TypingBubble size={size} mine={mine} />
              </div>
            ) : null}
            {arrived > 0 ? (
              <ChatBubble
                line={item.line}
                size={size}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: Math.min(1, arrived * 1.6),
                  transform: `scale(${0.82 + 0.18 * arrived})`,
                  transformOrigin: mine ? '100% 100%' : '0% 100%',
                }}
              >
                {item.extra?.node}
              </ChatBubble>
            ) : null}
          </div>
        );
      })}
    </>
  );
};

/** En-tête de la discussion : retour, pastilles empilées, nom du groupe. */
export const ChatHeader: React.FC<{ size: number }> = ({ size }) => {
  const others = (['koffi', 'sena', 'yann'] as const).map((id) => jeunesse.friends[id]);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.4,
        fontFamily: 'var(--font-sans)',
        color: '#FFFFFF',
      }}
    >
      <ChevronLeft size={size * 1.2} strokeWidth={2.4} color="var(--color-on-ink-2)" />
      <div style={{ display: 'flex' }}>
        {others.map((friend, index) => (
          <FriendAvatar
            key={friend.name}
            friend={friend}
            size={size * 1.75}
            ring="var(--color-ink)"
            style={{ marginLeft: index === 0 ? 0 : -size * 0.6 }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.02 }}>
        <span style={{ fontSize: size * 0.95, fontWeight: 800, letterSpacing: '-0.01em' }}>
          {jeunesse.groupName}
        </span>
        <span style={{ fontSize: size * 0.62, fontWeight: 600, color: 'var(--color-on-ink-3)' }}>
          {others.map((friend) => friend.name).join(', ')}, Vous
        </span>
      </div>
    </div>
  );
};
