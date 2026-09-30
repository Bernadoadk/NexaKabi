import type { Metadata } from 'next';
import { NewsletterTokenPage } from '../token-page';

export const metadata: Metadata = {
  title: 'Confirmer mon inscription',
  // Une page par abonné, sans intérêt pour un moteur de recherche.
  robots: { index: false, follow: false },
};

/** Ouverte depuis l'e-mail de confirmation — double consentement. */
export default async function ConfirmNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <NewsletterTokenPage token={t} action="confirm" />;
}
