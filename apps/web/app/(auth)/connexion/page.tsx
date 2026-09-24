import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '@nexakabi/ui';
import { getCurrentUser } from '@/lib/session';
import { LoginFlow } from './login-flow';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connecte-toi avec ton numéro de téléphone et un code à 6 chiffres.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;
  const user = await getCurrentUser();

  // Déjà connecté et profil complet : rien à faire ici.
  if (user && !user.needsProfileCompletion) {
    redirect(safeRedirect(suite));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center gap-6 px-5 py-12">
      <Link href="/" className="flex items-center gap-1.5 self-start">
        <BrandMark size={40} />
        <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-text-strong">
          Nexa&#8209;Kabi
        </span>
      </Link>

      <LoginFlow redirectTo={safeRedirect(suite)} context={contextFor(suite)} />
    </main>
  );
}

/**
 * N'accepte qu'un chemin interne.
 *
 * Sans ce garde-fou, `?suite=https://site-malveillant` transformerait la page de
 * connexion en tremplin de redirection ouverte.
 */
function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//')) {
    return '/mon-compte';
  }
  return target;
}

/**
 * Cadrage de l'écran selon la porte empruntée.
 *
 * L'écran de connexion est un et unique — même numéro, même code, que ce soit
 * pour organiser ou pour acheter — mais rien n'obligeait le TITRE à l'être : il
 * ne dit aujourd'hui jamais pourquoi on est là. `suite` porte déjà cette
 * information (c'est là qu'on revient après connexion) ; ne pas s'en servir
 * pour cadrer l'écran gaspillait un signal déjà disponible.
 */
function contextFor(suite: string | undefined): { title: string; subtitle: string } | null {
  if (!suite) return null;

  if (suite.startsWith('/pro')) {
    return {
      title: 'Connecte-toi pour organiser ton événement',
      subtitle: 'Même numéro, même code : on te reconnaît, ou on crée ton espace organisateur.',
    };
  }
  if (suite.startsWith('/scan')) {
    return {
      title: 'Connecte-toi pour contrôler les entrées',
      subtitle: "Il te faut être membre de l'équipe de l'événement pour accéder au scanner.",
    };
  }
  if (suite.startsWith('/mon-compte/billets') || suite.startsWith('/t/')) {
    return {
      title: 'Connecte-toi pour retrouver ton billet',
      subtitle: 'Il est associé à ton numéro : entre-le pour le récupérer.',
    };
  }
  if (suite.startsWith('/invitation/')) {
    return {
      title: "Connecte-toi pour rejoindre l'équipe",
      subtitle: "Le lien d'invitation t'attend, une fois connecté.",
    };
  }
  if (suite.startsWith('/mon-compte')) {
    return {
      title: 'Connecte-toi pour continuer',
      subtitle: 'On te reconnaît à ton numéro : aucun mot de passe à retenir.',
    };
  }

  return null;
}
