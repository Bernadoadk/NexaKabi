import React from 'react';
import { Lock } from 'lucide-react';
import { config } from '../../config';

/**
 * Cadres d'appareils : un téléphone et une fenêtre de navigateur.
 * Les maquettes y sont dessinées à leur taille réelle (pixels CSS), puis
 * le cadre entier est agrandi par la scène.
 */

export const PHONE = { width: 360, height: 760, bezel: 11, status: 34 } as const;
export const PHONE_OUTER = {
  width: PHONE.width + PHONE.bezel * 2,
  height: PHONE.height + PHONE.bezel * 2,
};

const StatusBar: React.FC<{ theme: 'dark' | 'light'; clock: string }> = ({ theme, clock }) => {
  const ink = theme === 'dark' ? '#12102B' : '#FFFFFF';
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0 0 auto 0',
        height: PHONE.status,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 26px 0 30px',
        color: ink,
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        fontSize: 13.5,
        letterSpacing: '-0.01em',
      }}
    >
      <span>{clock}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="17" height="11" viewBox="0 0 17 11">
          {[0, 1, 2, 3].map((index) => (
            <rect
              key={index}
              x={index * 4.5}
              y={8 - index * 2.6}
              width="3"
              height={3 + index * 2.6}
              rx="0.8"
              fill={ink}
            />
          ))}
        </svg>
        <svg
          width="15"
          height="11"
          viewBox="0 0 15 11"
          fill="none"
          stroke={ink}
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M1.2 3.9 C 5 0.6, 10 0.6, 13.8 3.9" />
          <path d="M3.6 6.4 C 5.9 4.5, 9.1 4.5, 11.4 6.4" />
          <circle cx="7.5" cy="9" r="1.1" fill={ink} stroke="none" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12">
          <rect
            x="0.7"
            y="0.7"
            width="21.6"
            height="10.6"
            rx="3"
            fill="none"
            stroke={ink}
            strokeOpacity="0.45"
            strokeWidth="1.2"
          />
          <rect x="2.4" y="2.4" width="15.5" height="7.2" rx="1.6" fill={ink} />
          <rect x="23.4" y="4" width="1.8" height="4" rx="0.9" fill={ink} fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
};

export const PhoneFrame: React.FC<{
  children: React.ReactNode;
  /** Couleur des icônes de la barre d'état : sombres sur écran clair. */
  statusBar?: 'dark' | 'light';
  screenBackground?: string;
  /** Heure de la barre d'état (par défaut `config.data.clock`). */
  clock?: string;
  style?: React.CSSProperties;
}> = ({
  children,
  statusBar = 'dark',
  screenBackground = 'var(--color-paper)',
  clock = config.data.clock,
  style,
}) => (
  <div
    style={{
      position: 'relative',
      width: PHONE_OUTER.width,
      height: PHONE_OUTER.height,
      borderRadius: 54,
      padding: PHONE.bezel,
      background: 'linear-gradient(150deg, #34305A 0%, #0B0918 38%, #07060F 70%, #2A2548 100%)',
      boxShadow:
        '0 60px 120px -40px rgba(4, 3, 12, 0.75), 0 30px 60px -30px rgba(4, 3, 12, 0.55), inset 0 0 0 1.5px rgba(255, 255, 255, 0.12)',
      ...style,
    }}
  >
    {/* Boutons latéraux */}
    <span
      style={{
        position: 'absolute',
        left: -3,
        top: 150,
        width: 4,
        height: 34,
        borderRadius: 3,
        background: '#221E3E',
      }}
    />
    <span
      style={{
        position: 'absolute',
        left: -3,
        top: 200,
        width: 4,
        height: 60,
        borderRadius: 3,
        background: '#221E3E',
      }}
    />
    <span
      style={{
        position: 'absolute',
        right: -3,
        top: 190,
        width: 4,
        height: 88,
        borderRadius: 3,
        background: '#221E3E',
      }}
    />

    <div
      style={{
        position: 'relative',
        width: PHONE.width,
        height: PHONE.height,
        borderRadius: 43,
        overflow: 'hidden',
        background: screenBackground,
        // Isole le rendu : les éléments en position fixe restent dans l'écran.
        transform: 'translateZ(0)',
      }}
    >
      {children}
      <StatusBar theme={statusBar} clock={clock} />
      <span
        style={{
          position: 'absolute',
          top: 9,
          left: '50%',
          width: 96,
          height: 27,
          marginLeft: -48,
          borderRadius: 20,
          background: '#050409',
          zIndex: 70,
        }}
      />
      <span
        style={{
          position: 'absolute',
          bottom: 7,
          left: '50%',
          width: 120,
          height: 4.5,
          marginLeft: -60,
          borderRadius: 4,
          background: statusBar === 'dark' ? 'rgba(18, 16, 43, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          zIndex: 70,
        }}
      />
    </div>
  </div>
);

/** Espace réservé à la barre d'état, dans la couleur de l'en-tête de l'écran. */
export const StatusSpacer: React.FC<{ background?: string }> = ({
  background = 'var(--color-surface)',
}) => <div style={{ height: PHONE.status, background, flexShrink: 0 }} />;

export const BROWSER = { width: 1040, height: 640, bar: 44 } as const;

export const BrowserFrame: React.FC<{
  children: React.ReactNode;
  path: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ children, path, width = BROWSER.width, height = BROWSER.height, style }) => (
  <div
    style={{
      width,
      borderRadius: 16,
      overflow: 'hidden',
      background: 'var(--color-surface)',
      boxShadow:
        '0 60px 120px -40px rgba(4, 3, 12, 0.75), 0 24px 48px -24px rgba(4, 3, 12, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      ...style,
    }}
  >
    <div
      style={{
        height: BROWSER.bar,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        background: '#ECEAE4',
        borderBottom: '1px solid #DEDBD2',
      }}
    >
      {['#FF6159', '#FFBD2E', '#28C941'].map((dot) => (
        <span key={dot} style={{ width: 12, height: 12, borderRadius: '50%', background: dot }} />
      ))}
      <div
        style={{
          margin: '0 auto',
          width: 520,
          height: 28,
          borderRadius: 8,
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: 500,
          color: '#5C5870',
        }}
      >
        <Lock size={12} strokeWidth={2.4} />
        {config.brand.url}
        <span style={{ color: '#9C98AC' }}>{path}</span>
      </div>
      <span style={{ width: 52 }} />
    </div>
    <div
      style={{ position: 'relative', height, overflow: 'hidden', background: 'var(--color-paper)' }}
    >
      {children}
    </div>
  </div>
);
