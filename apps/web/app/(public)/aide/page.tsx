import type { Metadata } from 'next';
import Link from 'next/link';
import { Surface } from '@nexakabi/ui';
import { LegalPage, Section, ToComplete } from '../legal-page';

export const metadata: Metadata = {
  title: 'Aide',
  description:
    'Les réponses aux questions qui reviennent : billet non reçu, paiement bloqué, remboursement.',
};

/**
 * Centre d'aide.
 *
 * ── Ce que cette page doit accomplir ──────────────────────────────────────
 * Éteindre les appels au support avant qu'ils partent. Les questions listées
 * ici sont celles que le produit PRODUIT réellement : le paiement resté en
 * attente, le SMS qui n'arrive pas, le billet acheté sans compte.
 *
 * Chaque réponse dit quoi FAIRE, pas comment ça marche. « Le webhook de
 * l'opérateur peut tarder » n'aide personne ; « attends deux minutes, ton
 * billet arrivera tout seul » si.
 */
export default function HelpPage() {
  return (
    <LegalPage
      title="Aide"
      updatedAt="4 septembre 2026"
      intro="Les situations qui reviennent le plus souvent, et quoi faire dans chacune."
    >
      <Section title="Je n’ai pas reçu mon billet">
        <p>
          Ton billet est disponible dans{' '}
          <Link href="/mon-compte/billets" className="font-semibold">
            Mes billets
          </Link>{' '}
          dès que le paiement est confirmé — connecte-toi avec le numéro qui a servi à payer, même
          si tu n’as jamais créé de compte : il en existe un, créé automatiquement à l’achat.
        </p>
        <p>
          Si le SMS n’arrive pas, le billet est quand même là. Le SMS est un rappel, pas le billet
          lui-même.
        </p>
      </Section>

      <Section title="J’ai payé mais rien ne se passe">
        <p>
          Attends deux minutes sans fermer la page : les opérateurs Mobile Money confirment parfois
          avec du retard. La page se met à jour toute seule.
        </p>
        <p>
          Si l’argent a été débité et qu’aucun billet n’apparaît au bout de dix minutes, ta commande
          est rattrapée automatiquement — nous interrogeons l’opérateur toutes les minutes. Passé
          une heure, contacte le support avec la référence de ta commande.
        </p>
      </Section>

      <Section title="Mon code de connexion n’arrive pas">
        <p>
          Vérifie que le numéro saisi est bien celui de la ligne dans ton téléphone. Le code met
          rarement plus d’une minute ; au-delà, demande-en un nouveau depuis le même écran.
        </p>
        <p>
          Un code n’est valable qu’une fois et expire au bout de quelques minutes. En demander un
          second annule le premier — c’est toujours le dernier reçu qui fonctionne.
        </p>
      </Section>

      <Section title="Mon QR ne s’affiche pas à l’entrée">
        <p>
          Ouvre ton billet AVANT de partir, en zone couverte. Il reste ensuite consultable sans
          réseau : c’est prévu pour les salles où le signal ne passe pas.
        </p>
        <p>
          Si l’écran reste blanc, la référence de ta commande suffit à te faire entrer — le
          contrôleur peut chercher un billet par référence ou par nom.
        </p>
      </Section>

      <Section title="Je veux me faire rembourser">
        <p>
          Si l’événement est annulé, le remboursement est automatique et intégral, frais compris. Tu
          n’as rien à demander.
        </p>
        <p>
          Sinon, cela dépend de la politique de l’organisateur, indiquée sur la page de l’événement.
          La demande se fait auprès de lui, depuis le détail de ta commande.
        </p>
      </Section>

      <Section title="J’organise un événement">
        <p>
          Crée ton espace organisateur depuis{' '}
          <Link href="/pro" className="font-semibold">
            l’espace professionnel
          </Link>
          . La publication d’un premier événement passe par une vérification ; prévois quelques
          jours et rassemble tes justificatifs à l’avance.
        </p>
      </Section>

      <Surface variant="panel" padding="comfortable" className="flex flex-col gap-2">
        <p className="text-body font-bold">Une question qui n’est pas ici ?</p>
        <ToComplete>
          Renseigner ici le canal de support retenu — numéro WhatsApp, adresse e-mail, horaires de
          réponse. Une page d’aide sans porte de sortie renvoie la question au hasard, ce qui est
          pire que pas de page d’aide du tout.
        </ToComplete>
      </Surface>
    </LegalPage>
  );
}
