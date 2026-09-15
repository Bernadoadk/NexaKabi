import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Alert } from '@nexakabi/ui';
import { TicketArticle } from '@/components/ticket-article';
import { fetchMyTicket } from '@/lib/tickets';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Mon billet',
  // Un billet ne s'indexe pas : son QR est un titre d'accès.
  robots: { index: false, follow: false },
};

/**
 * Écran U3 — détail d'un billet.
 *
 * Première des trois portes d'accès : celle du compte. Le rendu est identique
 * à celui du lien public, à dessein — un billet qui changerait d'allure selon
 * le chemin emprunté sèmerait le doute au pire moment.
 */
export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await fetchMyTicket(id);

  if (!result.ok) {
    if (result.error.statusCode === 404) notFound();

    return (
      <Alert tone="danger" title="Billet inaccessible">
        {result.error.message}
      </Alert>
    );
  }

  return (
    <TicketArticle
      ticket={result.data}
      siteUrl={siteUrl()}
      backHref={{ href: '/mon-compte/billets', label: 'Retour à mes billets' }}
    />
  );
}
