import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { RouteProgress, ThemeProvider, ThemeScript } from '@nexakabi/ui';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Administration', template: '%s · Administration Nexa-Kabi' },
  description: 'Console d’administration Nexa-Kabi.',
  // Ceinture et bretelles avec l'en-tête `X-Robots-Tag` de `next.config.ts` :
  // un moteur qui ignorerait l'un lira l'autre.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F5F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0918' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

/**
 * Nonce de la politique de sécurité du contenu.
 *
 * Le middleware en tire un nouveau à chaque réponse et le dépose dans l'en-tête
 * `x-nonce` de la requête. Le lire ici est ce qui autorise le script
 * d'initialisation du thème à s'exécuter : sans lui, la CSP le bloque — et
 * c'est bien le but d'une CSP, elle ne sait pas distinguer notre script d'un
 * script injecté.
 *
 * Lire `headers()` rend le layout dynamique, ce qu'il est déjà : chaque page de
 * ce site consulte la session.
 */
async function readNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = await readNonce();

  return (
    // `suppressHydrationWarning` sur `<html>` ET `<body>` : `ThemeScript` pose
    // `data-theme` sur `<html>` avant l'hydratation (voir sa propre
    // documentation), et les attributs `data-new-gr-c-s-check-loaded` /
    // `data-gr-ext-installed` sur `<body>` sont posés par l'extension
    // Grammarly avant que React n'hydrate — ni l'un ni l'autre n'est un
    // mismatch réel à corriger. Même correctif que `apps/web/app/layout.tsx`.
    <html lang="fr" suppressHydrationWarning>
      {/* `text-text` explicite, pas `text-ink` : ce dernier est la teinte de
          marque invariable, pas le texte par défaut — voir `base.css`, qui
          fait exactement ce choix pour l'app publique. Sans ça, aucun texte de
          cette console ne réagirait au mode sombre. */}
      <body className="min-h-dvh bg-paper text-text antialiased" suppressHydrationWarning>
        <ThemeScript nonce={nonce} />
        <ThemeProvider>
          {/* Voir `apps/web/app/layout.tsx` : monté à la racine pour survivre
              au changement de page qu'il annonce. */}
          <RouteProgress />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
