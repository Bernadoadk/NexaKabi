import 'server-only';
import Link from 'next/link';
import type { NewsletterTokenResult } from '@nexakabi/contracts';
import { ErrorState } from '@nexakabi/ui';
import { apiFetch } from '@/lib/api';
import { TokenAction } from './token-action';

/**
 * Cadre commun des deux pages ouvertes depuis un e-mail.
 *
 * Le lien est d'abord LU — quelle adresse, quel état — et rien n'est fait
 * avant le toucher du bouton (voir `TokenAction`).
 */
export async function NewsletterTokenPage({
  token,
  action,
}: {
  token: string | undefined;
  action: 'confirm' | 'unsubscribe';
}) {
  const result = token
    ? await apiFetch<NewsletterTokenResult>(
        `/newsletter/subscription?token=${encodeURIComponent(token)}`,
      )
    : null;

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-5 py-12">
      {token && result?.ok ? (
        <TokenAction token={token} action={action} initial={result.data} />
      ) : (
        <ErrorState
          title="Ce lien n’est pas valable"
          description={
            <>
              Il a peut-être été mal copié depuis l’e-mail, ou date d’une ancienne inscription.{' '}
              {action === 'unsubscribe'
                ? 'Pour ne plus rien recevoir, utilise le lien du dernier e-mail reçu.'
                : 'Inscris-toi de nouveau en bas de n’importe quelle page.'}
            </>
          }
          actions={
            <Link href="/" className="text-body-s font-semibold">
              Retour à l’accueil
            </Link>
          }
        />
      )}
    </main>
  );
}
