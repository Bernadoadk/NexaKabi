import React from 'react';
import { EASE_IN, ramp, SPRINGS, sp } from '../../lib/anim';
import { useTime } from '../../lib/time';

/**
 * Texte cinétique : chaque mot monte de derrière un masque, en décalé.
 *
 * Syntaxe (la même que dans `config.ts`) :
 *   *mots*  → couleur d'accent
 *   \n      → retour à la ligne forcé
 *
 * La ponctuation haute française (« ? », « ! », « : », « ; ») reste collée
 * au mot qui la précède, par une espace insécable.
 */

interface Segment {
  text: string;
  accent: boolean;
}

type Word = Segment[];

const HIGH_PUNCTUATION = /^[?!:;»%]+$/;

/** Espace insécable avant la ponctuation haute. */
const NBSP = String.fromCharCode(0xa0);

export function parseRichText(text: string): Word[][] {
  let accent = false;

  return text.split('\n').map((line) => {
    const words: Word[] = [];
    let word: Segment[] = [];
    let buffer = '';

    const flushSegment = () => {
      if (buffer) {
        word.push({ text: buffer, accent });
        buffer = '';
      }
    };
    const flushWord = () => {
      flushSegment();
      if (word.length > 0) words.push(word);
      word = [];
    };

    for (const character of line) {
      if (character === '*') {
        flushSegment();
        accent = !accent;
      } else if (character === ' ') {
        flushWord();
      } else {
        buffer += character;
      }
    }
    flushWord();

    // « ? » seul devient « week-end ? » : un seul mot, jamais coupé.
    const merged: Word[] = [];
    for (const current of words) {
      const plain = current.map((segment) => segment.text).join('');
      const previous = merged[merged.length - 1];
      if (previous && HIGH_PUNCTUATION.test(plain)) {
        const last = previous[previous.length - 1];
        previous.push({ text: NBSP, accent: last.accent }, ...current);
      } else {
        merged.push([...current]);
      }
    }
    return merged;
  });
}

export const KineticText: React.FC<{
  text: string;
  /** Image de départ (temps de la scène). */
  start: number;
  /** Image où les mots repartent vers le haut. Absent : le texte reste. */
  exit?: number;
  size: number;
  color?: string;
  accentColor?: string;
  font?: 'display' | 'sans';
  weight?: number;
  lineHeight?: number;
  letterSpacing?: string;
  align?: 'left' | 'center';
  /** Décalage entre deux mots, en images. */
  stagger?: number;
  maxWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({
  text,
  start,
  exit,
  size,
  color = '#FFFFFF',
  accentColor = 'var(--color-coral)',
  font = 'display',
  weight = 800,
  lineHeight = 1.04,
  letterSpacing = '-0.035em',
  align = 'left',
  stagger = 2.5,
  maxWidth,
  className,
  style,
}) => {
  const time = useTime();
  const lines = parseRichText(text);
  let index = 0;

  return (
    <div
      className={className}
      style={{
        fontFamily: font === 'display' ? 'var(--font-display)' : 'var(--font-sans)',
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing,
        color,
        textAlign: align,
        maxWidth,
        ...style,
      }}
    >
      {lines.map((words, lineIndex) => (
        <div key={lineIndex}>
          {words.map((segments, wordIndex) => {
            const order = index++;
            const enter = sp(time, start + order * stagger, SPRINGS.snappy);
            const leave =
              exit === undefined
                ? 0
                : ramp(time, exit + order * 1.2, exit + order * 1.2 + 11, [0, 1], EASE_IN);
            const y = (1 - enter) * 108 - leave * 108;
            return (
              <React.Fragment key={wordIndex}>
                <span
                  style={{
                    display: 'inline-block',
                    overflow: 'hidden',
                    verticalAlign: 'top',
                    padding: '0.14em 0.06em 0.2em',
                    margin: '-0.14em -0.06em -0.2em',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${y}%)`,
                      opacity: Math.min(1, enter * 1.6) * (1 - leave),
                    }}
                  >
                    {segments.map((segment, segmentIndex) => (
                      <span
                        key={segmentIndex}
                        style={segment.accent ? { color: accentColor } : undefined}
                      >
                        {segment.text}
                      </span>
                    ))}
                  </span>
                </span>
                {wordIndex < words.length - 1 ? ' ' : null}
              </React.Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Sur-titre de scène : un trait corail qui se dessine, puis le libellé. */
export const Eyebrow: React.FC<{
  text: string;
  start: number;
  exit?: number;
  size?: number;
  color?: string;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
}> = ({ text, start, exit, size = 22, color = 'var(--color-coral)', align = 'left', style }) => {
  const time = useTime();
  const line = sp(time, start, SPRINGS.smooth);
  const label = sp(time, start + 5, SPRINGS.snappy);
  const leave = exit === undefined ? 0 : ramp(time, exit, exit + 10, [0, 1], EASE_IN);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        gap: size * 0.6,
        opacity: 1 - leave,
        ...style,
      }}
    >
      <span
        style={{
          width: size * 2.2 * line,
          height: Math.max(3, size * 0.14),
          borderRadius: 4,
          background: color,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 800,
          fontSize: size,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color,
          opacity: label,
          transform: `translateX(${(1 - label) * -16}px)`,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </span>
    </div>
  );
};
