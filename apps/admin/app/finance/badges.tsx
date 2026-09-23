import { PAYMENT_STATUS_LABELS, type PaymentStatus } from '@nexakabi/contracts';
import { Badge } from '@nexakabi/ui';

/** Statut d'un paiement : toujours un mot, jamais la couleur seule. */
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const tone =
    status === 'SUCCEEDED'
      ? 'success'
      : status === 'FAILED'
        ? 'danger'
        : status === 'REFUNDED' || status === 'PARTIALLY_REFUNDED'
          ? 'info'
          : status === 'EXPIRED' || status === 'CANCELLED'
            ? 'neutral'
            : 'warning';

  return <Badge tone={tone}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}
