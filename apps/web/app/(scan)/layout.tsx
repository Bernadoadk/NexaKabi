import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { RegisterScannerServiceWorker } from './scan/register-sw';

/**
 * Le scanner s'installe comme une application à part : son manifeste démarre
 * sur `/scan`, pas sur « Mes billets ». Déclaré ici, il remplace celui du site
 * pour toutes les pages de ce groupe.
 */
export const metadata: Metadata = {
  manifest: '/scan/app-manifest',
  title: { default: 'Scanner', template: '%s · Scanner Nexa-Kabi' },
};

/**
 * Espace de contrôle.
 *
 * ── Fond encre, plein écran, aucune navigation ──────────────────────────────
 * Le contrôleur travaille de nuit, à la porte, une main occupée. Un fond sombre
 * ne l'éblouit pas et ne trahit pas sa position à trois mètres ; l'absence de
 * navigation supprime toute chance de sortir du scanner par erreur.
 *
 * C'est aussi un route group SÉPARÉ du reste du site : son service worker et
 * son cache lui sont propres, de sorte que la coque du scanner ne partage rien
 * avec les 1,2 Mo de la partie publique.
 */
export default async function ScanLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect('/connexion?suite=/scan');

  return (
    <div className="min-h-dvh bg-ink text-white">
      <RegisterScannerServiceWorker />
      {children}
    </div>
  );
}
