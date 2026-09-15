import type { EventStatus } from '@nexakabi/contracts';
import { Badge } from '@nexakabi/ui';

/**
 * L'état d'un événement, tel que l'organisateur le lit.
 *
 * Un seul endroit pour les neuf états : la liste et le cadre de l'événement
 * disaient des choses différentes — le cadre appelait « Brouillon » tout ce qui
 * n'était pas en ligne, y compris un événement en cours de vérification, ce qui
 * laissait croire à l'organisateur qu'il n'avait pas publié.
 */
const STATUS_VIEW: Record<
  EventStatus,
  { tone: 'ink' | 'neutral' | 'warning' | 'danger' | 'success'; label: string }
> = {
  DRAFT: { tone: 'neutral', label: 'Brouillon' },
  PENDING_REVIEW: { tone: 'warning', label: 'En vérification' },
  REJECTED: { tone: 'danger', label: 'Refusé' },
  PUBLISHED: { tone: 'ink', label: 'Publié' },
  SOLD_OUT: { tone: 'warning', label: 'Complet' },
  POSTPONED: { tone: 'warning', label: 'Reporté' },
  CANCELLED: { tone: 'danger', label: 'Annulé' },
  COMPLETED: { tone: 'success', label: 'Terminé' },
  ARCHIVED: { tone: 'neutral', label: 'Archivé' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { tone, label } = STATUS_VIEW[status];
  return <Badge tone={tone}>{label}</Badge>;
}
