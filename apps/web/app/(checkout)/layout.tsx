import Link from 'next/link';
import { Lock } from 'lucide-react';
import { BrandMark } from '@nexakabi/ui';

/**
 * Enveloppe du tunnel d'achat.
 *
 * En-tête réduit à sa plus simple expression : pas de navigation, pas de
 * recherche, pas de menu. Une fois la sélection faite, tout ce qui détourne de
 * l'achat en cours est du bruit — et chaque écart coûte des conversions sur un
 * parcours visé à moins de 90 secondes.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-[62px] max-w-[720px] items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-1 font-display text-[19px] font-bold tracking-[-0.02em]"
          >
            <BrandMark size={36} />
            Nexa-Kabi
          </Link>
          <span className="flex items-center gap-1.5 text-micro text-text-3">
            <Lock aria-hidden className="size-3.5" /> Paiement sécurisé
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] flex-1 px-5 pb-24 pt-6 lg:pb-10">
        {children}
      </main>
    </div>
  );
}
