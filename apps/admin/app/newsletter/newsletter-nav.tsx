import { SectionNav } from '@nexakabi/ui';

/**
 * Navigation de l'espace : la vue d'ensemble (campagnes, réglages) et les abonnés.
 *
 * `inline` : la barre vit dans le corps de la page, qui a déjà son retrait. Le
 * variant par défaut est celui de l'en-tête et ajoutait le sien par-dessus —
 * ces deux onglets commençaient donc 20 px plus à droite que le titre juste
 * en dessous.
 */
export function NewsletterNav() {
  return (
    <SectionNav
      ariaLabel="Newsletter"
      variant="inline"
      className="border-b border-border-subtle"
      entries={[
        { href: '/newsletter', label: 'Campagnes', exact: true },
        { href: '/newsletter/abonnes', label: 'Abonnés' },
      ]}
    />
  );
}
