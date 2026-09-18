import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import { RouteProgress, ThemeProvider, ThemeScript } from '@nexakabi/ui';
import './globals.css';
import { PwaProvider } from '@/components/pwa-provider';

/**
 * Deux familles seulement, choisies pour leur support complet des diacritiques
 * françaises. Auto-hébergées par `next/font` : aucune requête vers Google au
 * chargement, ce qui compte sur une connexion 3G.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Nexa-Kabi — Découvre et vis les événements au Bénin',
    template: '%s · Nexa-Kabi',
  },
  description:
    'Découvre les événements près de chez toi, achète ton billet en Mobile Money et reçois ton QR Code. Pour les organisateurs : crée, vends, contrôle et analyse.',
  applicationName: 'Nexa-Kabi',
  formatDetection: { telephone: false },

  /**
   * Installation sur l'écran d'accueil.
   *
   * Le manifeste est servi par `app/manifest.ts`. `appleWebApp` fait la même
   * promesse sur iOS, qui ignore le manifeste standard pour ces réglages.
   */
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Nexa-Kabi',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6F5F2' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0918' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste autorisé : le bloquer casse l'accessibilité.
  maximumScale: 5,
  // La page occupe aussi les zones système (encoche, ligne d'accueil) : les
  // barres fixes du bas se dégagent elles-mêmes avec `safe-area-inset-*`.
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
    <html
      lang="fr"
      className={`${bricolage.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      {/* `suppressHydrationWarning` sur `<html>` ET `<body>` : `ThemeScript`
          pose `data-theme` sur `<html>` avant l'hydratation (lecture de
          `localStorage`, voir sa propre documentation), et les attributs
          `data-new-gr-c-s-check-loaded` / `data-gr-ext-installed` sur `<body>`
          sont posés par l'extension Grammarly avant que React n'hydrate — ni
          l'un ni l'autre n'est un mismatch réel à corriger. On ne désactive la
          détection nulle part ailleurs dans l'arbre. */}
      <body suppressHydrationWarning>
        <ThemeScript nonce={nonce} />
        <ThemeProvider>
          {/* Le filet de navigation. Monté à la racine parce qu'il doit
              survivre au changement de page qu'il annonce : posé dans un
              layout de section, il disparaîtrait au moment précis où il sert. */}
          <RouteProgress />
          {children}
          <PwaProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
