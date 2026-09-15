import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Button } from '@nexakabi/ui';
import { TicketArticle } from '@/components/ticket-article';
import { fetchTicketByToken } from '@/lib/tickets';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Ton billet',
  /**
   * Jamais indexé, jamais transmis en référent.
   *
   * L'URL contient le jeton d'accès au billet. Un moteur qui l'indexerait le
   * rendrait public ; un site tiers qui le recevrait en `Referer` pourrait le
   * rejouer. `noreferrer` sur les liens sortants complète la mesure.
   */
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Billet invité (`/t/[token]`).
 *
 * Deuxième porte d'accès, et la plus importante en pratique : c'est le lien
 * reçu par WhatsApp, ouvert sans compte, souvent par quelqu'un d'autre que
 * l'acheteur. Il doit fonctionner sans session, sans installation, et rester
 * lisible une fois la page en cache.
 */
export default async function GuestTicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await fetchTicketByToken(token);

  if (!result.ok) {
    if (result.error.statusCode === 404) notFound();

    return (
      <main className="mx-auto w-full max-w-[520px] px-5 py-10">
        <Alert tone="danger" title="Billet inaccessible">
          {result.error.message}
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[520px] px-5 pb-16 pt-6">
      <TicketArticle ticket={result.data} siteUrl={siteUrl()} />

      {/* L'invité n'a pas de compte. Lui dire comment retrouver ce billet
          autrement que par ce lien évite l'appel au support la veille. */}
      <div className="mt-6 flex flex-col gap-2.5 rounded-panel border border-border-subtle p-5">
        <h2 className="text-body font-bold">Retrouver ce billet plus tard</h2>
        <p className="text-body-s text-text-2">
          Conserve ce lien, ou connecte-toi avec le numéro qui a servi à l’achat : tes billets
          t’attendent dans « Mes billets ».
        </p>
        <Button asChild variant="secondary" size="primary" block>
          <Link href="/connexion?suite=/mon-compte/billets" className="text-center">
            Me connecter avec mon numéro
          </Link>
        </Button>
      </div>
    </main>
  );
}
