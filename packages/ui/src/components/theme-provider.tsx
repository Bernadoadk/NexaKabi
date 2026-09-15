'use client';

import * as React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Thème clair / sombre / système.
 *
 * ── Pourquoi un attribut DOM, pas des utilitaires `dark:` ──────────────────
 * Les jetons de `tokens.css` sont déjà nommés par RÔLE (`--color-paper`,
 * `--color-text`, `--color-border`...), pas par palette : faire réagir ces
 * variables au thème suffit à faire réagir tout composant qui écrit
 * `bg-paper` / `text-text-2` / `border-border`, partout dans l'app, sans
 * toucher un seul fichier de page. Un attribut `data-theme` sur `<html>` plus
 * les règles CSS de `tokens.css` est donc la version la MOINS invasive, pas un
 * choix de commodité — voir le commentaire en tête de ce fichier de jetons.
 *
 * ── Pourquoi un script inline (`ThemeScript`) ───────────────────────────────
 * Sans lui, la page se peint d'abord avec le thème par défaut, puis
 * `useEffect` lit `localStorage` et corrige l'attribut — un flash visible à
 * chaque chargement pour qui a choisi le sombre. Le script doit tourner AVANT
 * la peinture ; côté serveur c'est impossible, il lui faut un `<script>`
 * classique, posé en tout premier enfant de `<body>`.
 */

const STORAGE_KEY = 'nk_theme';

export type Theme = 'light' | 'dark' | 'system';

function themeInitScript(): string {
  return (
    `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');` +
    `if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`
  );
}

/**
 * À poser en tout premier enfant de `<body>`, avant `{children}`.
 *
 * Contenu fixe, sans entrée utilisateur — aucun risque d'injection ici. La
 * politique de sécurité du contenu, elle, ne peut pas le savoir : elle bloque
 * tout script en ligne dépourvu de nonce, et c'est précisément ce qui lui
 * donne sa valeur. Le nonce est donc transmis par le layout, qui le lit dans
 * l'en-tête posé par le middleware.
 *
 * Sans nonce, le script est bloqué et le thème sombre reprend son flash de
 * clair à chaque chargement.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript() }}
    />
  );
}

interface ThemeContextValue {
  theme: Theme;
  /** Le thème réellement appliqué, une fois « système » résolu. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [systemIsDark, setSystemIsDark] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') setThemeState(stored);
    } catch {
      // Stockage indisponible (navigation privée, réglages restrictifs) :
      // on reste sur « système », silencieusement.
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(media.matches);

    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Le thème s'applique quand même pour cette page ; il ne survivra
      // simplement pas à un rechargement.
    }
    document.documentElement.dataset.theme = next === 'system' ? '' : next;
  }, []);

  const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme doit être utilisé sous ThemeProvider.');
  return context;
}

const OPTIONS: ReadonlyArray<{
  value: Theme;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
];

export interface ThemeToggleProps {
  className?: string;
  /** Fond adapté à un en-tête sur fond encre (console pro/admin), plutôt que clair. */
  onInk?: boolean;
}

/**
 * Sélecteur à trois positions.
 *
 * Toujours les trois options visibles, jamais un menu qui cache le réglage
 * courant derrière un clic — le prototype applique ce principe à chaque
 * réglage binaire de l'app (`PreferencesForm` en est un autre exemple), pas
 * de raison de faire une exception ici.
 */
export function ThemeToggle({ className, onInk = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Thème"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full p-0.5',
        onInk ? 'bg-white/10' : 'bg-fill-neutral',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full transition',
              active
                ? onInk
                  ? 'bg-white/20 text-white'
                  : 'bg-surface text-text-strong shadow-sm'
                : onInk
                  ? 'text-white/50 hover:text-white/80'
                  : 'text-text-3 hover:text-text',
            )}
          >
            <Icon className="size-[15px]" />
          </button>
        );
      })}
    </div>
  );
}
