import Link from 'next/link';
import { BrandMark, Skeleton } from '@nexakabi/ui';

/**
 * La connexion, pendant que l'écran arrive.
 *
 * ── Ce que ce squelette ne grise pas ──────────────────────────────────────
 * La marque : elle est écrite en dur dans la page, et c'est elle qui dit à
 * l'utilisateur qu'il est au bon endroit. Beaucoup arrivent ici depuis un lien
 * WhatsApp partagé — « connecte-toi pour récupérer ton billet » — et une page
 * sans nom ni logo, sur un domaine qu'ils ne reconnaissent pas, ressemble
 * exactement à ce qu'on leur apprend à fuir.
 *
 * Ne reste en attente que le panneau du formulaire, dont le titre dépend de la
 * porte empruntée (`?suite=`) et n'est donc pas connu d'avance.
 */
export default function LoginLoading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center gap-6 px-5 py-12">
      <Link href="/" className="flex items-center gap-1.5 self-start">
        <BrandMark size={40} />
        <span className="font-display text-[19px] font-bold tracking-[-0.02em] text-text-strong">
          Nexa&#8209;Kabi
        </span>
      </Link>

      <div className="overflow-hidden rounded-panel border border-border bg-surface shadow-lg">
        {/* Le bandeau d'étape est écrit en dur : on arrive toujours sur la
            première, jamais sur une autre. Le mettre en gris ferait patienter
            pour un texte qu'on connaît avant d'avoir rien demandé. */}
        <div className="eyebrow border-b border-border bg-paper px-4 py-3 text-text-3">
          Étape 1 · Entrer
        </div>

        <div className="flex flex-col gap-4 px-6 py-7">
          {/* Le titre dépend de la porte empruntée (`?suite=`) : « pour
              organiser », « pour retrouver ton billet »… Lui, on l'attend. */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[25px] w-[85%]" />
            <Skeleton className="h-[13px] w-full" index={1} />
            <Skeleton className="h-[13px] w-[65%]" index={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-[11px] w-[150px]" index={1} />
            <Skeleton className="h-[var(--tap-min)] w-full rounded-field" index={2} />
          </div>

          <Skeleton className="h-[var(--tap-primary)] w-full rounded-button" index={3} />
          <Skeleton className="mx-auto h-[9px] w-[80%]" index={4} />
        </div>
      </div>
    </main>
  );
}
