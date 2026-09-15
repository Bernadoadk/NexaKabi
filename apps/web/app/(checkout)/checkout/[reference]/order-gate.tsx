import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Order } from '@nexakabi/contracts';
import { Alert, Button, Surface } from '@nexakabi/ui';
import { fetchOrder } from '@/lib/checkout';

/**
 * Chargement d'une commande du tunnel, avec ses issues.
 *
 * Chaque étape appelle ceci en premier. Une commande expirée ou déjà payée ne
 * doit jamais afficher un formulaire : elle affiche ce qu'il faut faire
 * maintenant. Le prototype est explicite — un écran d'erreur donne toujours la
 * cause probable ET une action de sortie.
 */
export type OrderGateResult =
  { kind: 'ready'; order: Order } | { kind: 'terminal'; render: React.ReactNode };

export async function loadOrder(reference: string): Promise<OrderGateResult> {
  const result = await fetchOrder(reference);

  if (!result.ok) {
    if (result.error.statusCode === 404) notFound();

    return {
      kind: 'terminal',
      render: (
        <TerminalState
          tone="danger"
          title="Commande inaccessible"
          message={result.error.message}
          action={{ href: '/evenements', label: 'Voir les événements' }}
        />
      ),
    };
  }

  const order = result.data;

  // Payée : l'acheteur n'a plus rien à faire ici, sa confirmation l'attend.
  if (order.status === 'PAID' || order.status === 'COMPLETED') {
    redirect(`/commandes/${order.reference}/confirmation`);
  }

  if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
    return {
      kind: 'terminal',
      render: (
        <TerminalState
          tone="warning"
          title="Réservation expirée"
          message={
            'Les places n’ont pas été payées à temps et sont retournées à la vente. ' +
            'Rien n’a été débité. Tu peux recommencer ta sélection — il en reste peut-être.'
          }
          action={{ href: `/e/${order.eventSlug}`, label: 'Revenir à l’événement' }}
        />
      ),
    };
  }

  return { kind: 'ready', order };
}

function TerminalState({
  tone,
  title,
  message,
  action,
}: {
  tone: 'danger' | 'warning';
  title: string;
  message: string;
  action: { href: string; label: string };
}) {
  return (
    <Surface variant="panel" className="flex flex-col gap-4">
      <Alert tone={tone} title={title}>
        {message}
      </Alert>
      <Button asChild variant="primary" size="primary" block>
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </Surface>
  );
}
