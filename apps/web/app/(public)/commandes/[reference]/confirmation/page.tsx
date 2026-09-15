import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import type { Order } from '@nexakabi/contracts';
import { Alert, Badge, Button, Money, Surface } from '@nexakabi/ui';
import { formatEventCaptionWithTime } from '@nexakabi/utils';
import { fetchOrder, fetchOrderTickets } from '@/lib/checkout';

export const metadata: Metadata = {
  title: 'Commande confirmée',
  robots: { index: false, follow: false },
};

/**
 * Écran A5 — confirmation.
 *
 * Fond encre et pastille menthe, comme dans le prototype : cet écran doit se
 * distinguer de tout le reste du produit, parce qu'il marque le seul moment
 * où l'acheteur a payé et attend une preuve.
 *
 * Deux appels à l'action, dans cet ordre : voir ses billets, puis les envoyer
 * sur WhatsApp. Le second est celui qui fait circuler l'événement.
 */
export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const result = await fetchOrder(reference.toUpperCase());

  if (!result.ok) {
    if (result.error.statusCode === 404) notFound();

    return (
      <main className="mx-auto w-full max-w-[720px] px-5 py-10">
        <Alert tone="danger" title="Commande inaccessible">
          {result.error.message}
        </Alert>
      </main>
    );
  }

  const order = result.data;
  const paid = order.status === 'PAID' || order.status === 'COMPLETED';
  const tickets = paid ? await fetchOrderTickets(order.reference) : [];
  const ticketCount = order.items.reduce((total, item) => total + item.quantity, 0);

  if (!paid) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-5 py-10">
        <Surface variant="panel" className="flex flex-col gap-4">
          <Alert tone="warning" title="Cette commande n’est pas encore payée">
            Le paiement n’a pas encore été confirmé par l’opérateur. Si tu viens de valider sur ton
            téléphone, patiente quelques secondes.
          </Alert>
          <Button asChild variant="primary" size="primary" block>
            <Link href={`/checkout/${order.reference}/paiement`}>Reprendre le paiement</Link>
          </Button>
        </Surface>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-ink px-5 py-10 text-white">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6">
        <header className="flex flex-col items-center gap-3 text-center">
          <span
            className="grid size-14 place-items-center rounded-full bg-mint text-ink"
            aria-hidden
          >
            <Check className="size-6" strokeWidth={3} />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">C’est confirmé</h1>
            <p className="text-body text-white/70">
              {ticketCount} billet{ticketCount > 1 ? 's' : ''} pour {order.eventTitle}
            </p>
          </div>
        </header>

        <section className="rounded-panel bg-white/[0.06] p-5">
          <dl className="flex flex-col gap-3">
            <Row label="Référence">
              <span className="tabular font-bold">{order.reference}</span>
            </Row>
            <Row label="Événement">
              <span className="text-right font-semibold">{order.eventTitle}</span>
            </Row>
            <Row label="Date">
              <span className="text-right font-semibold">
                {formatEventCaptionWithTime(new Date(order.eventStartsAt))}
              </span>
            </Row>
            {order.eventVenueName || order.eventCityName ? (
              <Row label="Lieu">
                <span className="text-right font-semibold">
                  {[order.eventVenueName, order.eventCityName].filter(Boolean).join(' · ')}
                </span>
              </Row>
            ) : null}

            <div className="my-1 h-px bg-white/12" />

            {order.items.map((item) => (
              <Row key={item.id} label={`${item.quantity} × ${item.ticketTypeName}`}>
                <Money amount={item.subtotal} size="small" className="text-white" hideSymbol />
              </Row>
            ))}

            <Row label="Frais de service">
              <Money amount={order.buyerFeeAmount} size="small" className="text-white" hideSymbol />
            </Row>

            <div className="mt-1 flex items-baseline justify-between border-t border-white/12 pt-3">
              <dt className="text-body font-bold">Montant payé</dt>
              <dd>
                <Money amount={order.totalAmount} size="hero" className="text-white" />
              </dd>
            </div>
          </dl>
        </section>

        {/* Les billets sont livrés ICI, tout de suite, sans exiger de compte.
            Chaque lien fonctionne seul : c'est celui qui part sur WhatsApp. */}
        {tickets.length > 0 ? (
          <section className="rounded-panel border border-white/12 p-5">
            <h2 className="text-body font-bold">
              {tickets.length} billet{tickets.length > 1 ? 's' : ''} émis
            </h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center justify-between gap-3 border-t border-white/12 pt-2.5 first:border-t-0 first:pt-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body-s font-semibold">
                      {ticket.attendeeName}
                    </span>
                    <span className="tabular text-micro text-white/50">{ticket.reference}</span>
                  </div>
                  <Button asChild variant="secondary" size="compact">
                    <Link href={`/t/${ticket.accessToken}`}>Voir le QR</Link>
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-micro text-white/60">
              Un lien par billet. Envoie-le à la personne concernée : elle n’aura pas besoin de
              compte.
            </p>
          </section>
        ) : (
          <section className="rounded-panel border border-white/12 p-5">
            <div className="flex items-start gap-3">
              <Badge tone="accent">En cours</Badge>
              <p className="flex-1 text-body-s text-white/70">
                Tes billets sont en cours d’émission. Ils apparaîtront ici et au{' '}
                <span className="font-semibold text-white">{order.buyerPhone}</span> dans un
                instant.
              </p>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2.5">
          <Button asChild variant="primary" size="primary" block>
            <Link
              href={tickets[0] ? `/t/${tickets[0].accessToken}` : '/mon-compte/billets'}
              className="text-center"
            >
              {tickets.length > 1 ? 'Voir mon premier billet' : 'Voir mon billet'}
            </Link>
          </Button>

          <Button asChild variant="secondary" size="primary" block>
            <a
              href={buildWhatsAppShare(order)}
              target="_blank"
              rel="noreferrer"
              className="text-center"
            >
              Envoyer sur WhatsApp
            </a>
          </Button>

          <Button asChild variant="tertiary" size="primary" block>
            <Link href={`/e/${order.eventSlug}`} className="text-center text-white/60">
              Revenir à l’événement
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-body-s text-white/60">{label}</dt>
      <dd className="text-body-s">{children}</dd>
    </div>
  );
}

/**
 * Message WhatsApp pré-rédigé.
 *
 * Pré-remplir le texte double le taux de partage : l'acheteur n'a plus qu'à
 * choisir le destinataire.
 */
function buildWhatsAppShare(order: Order): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexakabi.bj';
  const text = `J'y serai ! ${order.eventTitle} — ${site}/e/${order.eventSlug}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
