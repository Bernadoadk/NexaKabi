import type { Metadata } from 'next';
import { ManualSearch } from './search-client';

export const metadata: Metadata = {
  title: 'Recherche manuelle',
  robots: { index: false, follow: false },
};

export default async function ManualSearchPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <ManualSearch eventId={eventId} />;
}
