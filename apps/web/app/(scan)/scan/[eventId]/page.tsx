import type { Metadata } from 'next';
import { Scanner } from './scanner';

export const metadata: Metadata = {
  title: 'Scanner',
  robots: { index: false, follow: false },
};

/**
 * Écrans C2 à C5 — le scanner.
 *
 * Entièrement client : la caméra, la vérification et l'écriture locale n'ont
 * rien à demander au serveur. C'est ce qui permet au contrôleur de travailler
 * en mode avion, du début à la fin de l'événement.
 */
export default async function ScannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  return <Scanner eventId={eventId} />;
}
