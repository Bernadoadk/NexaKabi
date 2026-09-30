import type { Metadata } from 'next';
import { NewsletterTokenPage } from '../token-page';

export const metadata: Metadata = {
  title: 'Se désabonner',
  robots: { index: false, follow: false },
};

/** Ouverte depuis le lien « Se désabonner » de chaque newsletter. */
export default async function UnsubscribeNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <NewsletterTokenPage token={t} action="unsubscribe" />;
}
