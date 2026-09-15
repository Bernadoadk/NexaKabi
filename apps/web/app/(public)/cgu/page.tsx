import type { Metadata } from 'next';
import { DEFAULT_COMMISSION_POLICY, RESERVATION_TTL_MINUTES } from '@nexakabi/contracts';
import { LegalPage, Section, ToComplete } from '../legal-page';

export const metadata: Metadata = {
  title: 'Conditions générales',
  description:
    'Les règles d’utilisation de Nexa-Kabi, pour les participants comme pour les organisateurs.',
};

/**
 * Conditions générales d'utilisation.
 *
 * ── Ce que cette page contient, et ce qu'elle ne contient pas ─────────────
 * Elle décrit les règles que le produit APPLIQUE RÉELLEMENT : la durée de
 * réservation, le calcul des frais, la politique de remboursement, le rôle de
 * la plateforme vis-à-vis des organisateurs. Chaque affirmation ici correspond
 * à du code vérifiable.
 *
 * Elle ne contient pas de clauses inventées — droit applicable, juridiction
 * compétente, mentions d'identité de la société. Ces éléments engagent
 * juridiquement et relèvent d'un conseil, pas d'une supposition. Ils sont
 * signalés par des encarts visibles plutôt que remplis au plausible.
 */
export default function TermsPage() {
  // Les chiffres viennent de la politique appliquée par le code, pas d'une
  // valeur recopiée : une CGU qui annonce un taux différent de celui prélevé
  // est un problème juridique, et le recopiage finit toujours par diverger.
  const feePercent = DEFAULT_COMMISSION_POLICY.percentageBps / 100;
  const minFee = DEFAULT_COMMISSION_POLICY.minFeePerOrder;

  return (
    <LegalPage
      title="Conditions générales"
      updatedAt="4 septembre 2026"
      intro="Ces conditions décrivent ce que Nexa-Kabi fait, ce qu’elle ne fait pas, et ce à quoi tu peux t’attendre en achetant un billet ou en organisant un événement."
    >
      <ToComplete>
        L’identité de la société exploitante (raison sociale, RCCM, siège, capital), le droit
        applicable et la juridiction compétente doivent être renseignés par l’exploitant, avec
        l’appui d’un conseil juridique béninois. Ces mentions engagent : elles ne peuvent pas être
        rédigées par approximation.
      </ToComplete>

      <Section title="1. Ce qu’est Nexa-Kabi">
        <p>
          Nexa-Kabi est une plateforme de billetterie. Elle met en relation des organisateurs
          d’événements et des participants, encaisse le paiement pour le compte de l’organisateur,
          émet les billets et en contrôle la validité à l’entrée.
        </p>
        <p>
          <strong className="text-text-strong">Nexa-Kabi n’organise aucun événement.</strong> Le
          contenu, le déroulement, la sécurité et la tenue effective d’un événement relèvent
          entièrement de son organisateur, dont l’identité est affichée sur la page de l’événement.
        </p>
      </Section>

      <Section title="2. Acheter un billet">
        <p>
          L’achat ne demande pas de compte. Un numéro de téléphone suffit : c’est sur lui que le
          billet est envoyé, et c’est avec lui qu’on le retrouve plus tard.
        </p>
        <p>
          Les places sont réservées pendant{' '}
          <strong className="text-text-strong">{RESERVATION_TTL_MINUTES} minutes</strong> le temps
          du paiement. Passé ce délai sans paiement confirmé, elles retournent en vente. Un compte à
          rebours l’indique pendant tout le tunnel.
        </p>
        <p>
          Le billet est un QR code signé, valable une seule fois. Il fonctionne sans connexion : une
          fois ouvert, il reste consultable même sans réseau à l’entrée de l’événement.
        </p>
      </Section>

      <Section title="3. Frais de service">
        <p>
          Un frais de service de <strong className="text-text-strong">{feePercent} %</strong> du
          montant des billets s’ajoute au prix, avec un minimum de{' '}
          <strong className="text-text-strong">{minFee} FCFA</strong> par commande. Il est affiché
          avant le paiement, jamais après.
        </p>
        <p>
          Le minimum couvre le coût de traitement d’une transaction, qui ne dépend pas du montant :
          sur une commande de 500 FCFA, 5 % ne couvriraient pas ce que l’opérateur nous facture.
        </p>
        <p>
          Les billets gratuits ne supportent aucun frais. Le montant total à payer est celui qui
          apparaît sur l’écran de confirmation : il n’y a pas de supplément ultérieur.
        </p>
      </Section>

      <Section title="4. Remboursement">
        <p>
          <strong className="text-text-strong">Événement annulé par l’organisateur :</strong>{' '}
          remboursement intégral, frais de service compris, sur le numéro qui a payé. Aucune
          démarche n’est nécessaire.
        </p>
        <p>
          <strong className="text-text-strong">Annulation à ta demande :</strong> possible selon la
          politique choisie par l’organisateur, affichée sur la page de l’événement avant l’achat.
          Les frais de service ne sont alors pas remboursés — le service a été rendu : la place a
          été bloquée, le billet émis, l’opérateur de paiement rémunéré.
        </p>
        <p>
          <strong className="text-text-strong">Billet déjà scanné :</strong> aucun remboursement.
          L’entrée a eu lieu.
        </p>
      </Section>

      <Section title="5. Organiser un événement">
        <p>
          Publier un événement demande un compte organisateur. Un premier événement passe par une
          revue avant publication ; les suivants sont publiés directement une fois l’organisation
          vérifiée.
        </p>
        <p>
          L’organisateur est responsable de l’exactitude des informations qu’il publie, de la tenue
          de son événement et du respect des autorisations nécessaires. Une information sensible
          modifiée après publication — date, lieu — déclenche une notification automatique aux
          porteurs de billet.
        </p>
        <p>
          Les recettes sont versées sur le compte Mobile Money ou bancaire déclaré par
          l’organisateur, selon les délais indiqués dans son espace. Une partie des recettes peut
          rester bloquée jusqu’après l’événement, en garantie des remboursements éventuels.
        </p>
      </Section>

      <Section title="6. Ce qui peut suspendre un compte">
        <p>
          La vente de billets pour un événement inexistant, l’usage d’un moyen de paiement
          frauduleux, la revente de billets au-delà du prix affiché, ou la publication d’un contenu
          illicite entraînent la suspension du compte et le blocage des fonds correspondants, le
          temps de l’examen.
        </p>
        <p>
          Une suspension est toujours motivée et notifiée. Elle peut être contestée en répondant à
          la notification reçue.
        </p>
      </Section>

      <Section title="7. Limites">
        <p>
          Nexa-Kabi met tout en œuvre pour que les billets soient disponibles à l’entrée, y compris
          hors ligne. Elle ne peut pas garantir la disponibilité des opérateurs Mobile Money, des
          réseaux mobiles, ni la tenue effective d’un événement.
        </p>
        <p>
          En cas de défaillance de la plateforme empêchant l’accès à un événement payé, le
          remboursement est intégral.
        </p>
      </Section>

      <ToComplete>
        Sections restant à rédiger avec un conseil : propriété intellectuelle, protection des
        mineurs, modalités de modification des présentes conditions, et voies de recours (médiation,
        juridiction).
      </ToComplete>
    </LegalPage>
  );
}
