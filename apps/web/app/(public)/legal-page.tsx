import { Alert, Surface } from '@nexakabi/ui';

/**
 * Gabarit des pages légales et d'aide.
 *
 * ── Pourquoi une largeur réduite ───────────────────────────────────────────
 * 68 caractères par ligne environ. Au-delà, l'œil perd la ligne suivante en
 * revenant à gauche — le défaut classique des CGU pleine largeur que personne
 * ne lit jusqu'au bout.
 */
export function LegalPage({
  title,
  updatedAt,
  intro,
  children,
}: {
  title: string;
  updatedAt: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1 font-bold tracking-[-0.02em]">{title}</h1>
        <p className="text-micro text-text-3">Dernière mise à jour : {updatedAt}</p>
        {intro ? <p className="text-body text-text-2">{intro}</p> : null}
      </header>

      <div className="flex flex-col gap-6">{children}</div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-h3 font-bold">{title}</h2>
      <div className="flex flex-col gap-2 text-body leading-relaxed text-text-2">{children}</div>
    </section>
  );
}

/**
 * Marque une information que seul l'exploitant peut fournir.
 *
 * ── Pourquoi ces blocs existent, plutôt qu'un texte plausible ─────────────
 * Un numéro RCCM inventé, une adresse approximative ou un délai légal supposé
 * seraient indétectables à la lecture et faux en droit. Une page légale
 * fabriquée est pire qu'une page incomplète : la première trompe, la seconde
 * signale ce qu'il reste à faire.
 *
 * Ces blocs sont visibles à dessein. Ils doivent disparaître avant la mise en
 * ligne, et être impossibles à oublier d'ici là.
 */
export function ToComplete({ children }: { children: React.ReactNode }) {
  return (
    <Alert tone="warning" title="À compléter avant la mise en ligne">
      {children}
    </Alert>
  );
}

export function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-1">
      <p className="text-body font-bold text-text-strong">{term}</p>
      <p className="text-body-s leading-relaxed text-text-2">{children}</p>
    </Surface>
  );
}
