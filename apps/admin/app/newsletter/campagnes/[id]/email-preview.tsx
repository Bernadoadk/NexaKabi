import type { NewsletterPreview } from '@nexakabi/contracts';
import { Surface } from '@nexakabi/ui';

/**
 * L'e-mail tel qu'il partira — rendu dans la page.
 *
 * ── Pourquoi pas dans un cadre ─────────────────────────────────────────────
 * La politique de sécurité de la console interdit tout cadre (`frame-src
 * 'none'`) et toute image d'un autre domaine : c'est voulu, cette console
 * gèle des fonds. L'aperçu est donc inséré tel quel, et les visuels des
 * événements (hébergés ailleurs) n'y apparaissent pas — l'envoi de test
 * montre le rendu exact, images comprises.
 *
 * Insérer ce HTML est sûr : il est produit par le gabarit de l'API, qui
 * échappe tout texte saisi et n'accepte que des liens `http(s)` ; et la même
 * politique de sécurité refuserait de toute façon d'y exécuter un script.
 */
export function EmailPreview({ preview }: { preview: NewsletterPreview }) {
  const body = extractBody(preview.html);

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-0.5 border-b border-border-subtle px-4 py-3">
        <span className="text-micro font-bold uppercase tracking-wide text-text-3">Aperçu</span>
        <span className="text-body-s font-bold">{preview.subject}</span>
      </div>
      <div
        className="max-h-[720px] overflow-y-auto bg-[#F5F4F8] px-2 py-6 text-[#12102B]"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </Surface>
  );
}

/** Le contenu de `<body>`, sans la page qui l'entoure : il vit dans la nôtre. */
function extractBody(html: string): string {
  const match = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return match?.[1] ?? html;
}
