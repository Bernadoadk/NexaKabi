import type { Metadata } from 'next';
import { ScanHistory } from './history-client';

export const metadata: Metadata = {
  title: 'Historique des scans',
  robots: { index: false, follow: false },
};

export default async function ScanHistoryPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <ScanHistory eventId={eventId} />;
}
