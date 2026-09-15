import type { Metadata } from 'next';
import { LegalPage, Section, Definition, ToComplete } from '../legal-page';

export const metadata: Metadata = {
  title: 'Confidentialité',
  description:
    'Quelles données Nexa-Kabi collecte, pourquoi, et comment les récupérer ou les effacer.',
};

/**
 * Politique de confidentialité.
 *
 * ── Le principe qui a guidé cette page ────────────────────────────────────
 * Chaque donnée listée ici est une donnée que le code stocke réellement, et la
 * raison donnée est celle qui a motivé sa collecte. L'inventaire vient du
 * schéma de base, pas d'un modèle générique.
 *
 * L'exercice a d'ailleurs sa propre valeur : une donnée qu'on ne sait pas
 * justifier en une phrase est une donnée qu'il faut cesser de collecter.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Confidentialité"
      updatedAt="4 septembre 2026"
      intro="Ce que nous savons de toi, pourquoi, combien de temps, et comment le récupérer ou l’effacer."
    >
      <Section title="Ce que nous collectons, et pourquoi">
        <div className="flex flex-col gap-2.5">
          <Definition term="Ton numéro de téléphone">
            C’est ton identifiant. Il sert à t’envoyer ton billet, à te reconnecter, et à te
            rembourser le cas échéant. Sans lui, un billet perdu est perdu pour de bon.
          </Definition>

          <Definition term="Ton nom">
            Il figure sur le billet et sur la liste de contrôle à l’entrée. Certains organisateurs
            l’exigent pour chaque place ; l’information est alors indiquée avant l’achat.
          </Definition>

          <Definition term="Ton adresse e-mail — facultative">
            Uniquement si tu la renseignes. Elle sert de canal de secours pour retrouver un billet
            quand le SMS n’arrive pas.
          </Definition>

          <Definition term="Tes commandes et tes billets">
            Le détail de ce que tu as acheté, à quel prix, et si le billet a été scanné. C’est ce
            qui permet de répondre à « j’ai payé mais je n’ai rien reçu » — la question la plus
            fréquente du support.
          </Definition>

          <Definition term="Le numéro Mobile Money utilisé pour payer">
            Conservé pour rapprocher un paiement d’une commande et pour rembourser sur le bon
            numéro. Nous ne stockons aucun code PIN ni aucune donnée de carte : le paiement se fait
            entièrement chez l’opérateur.
          </Definition>

          <Definition term="Ton appareil et ta session">
            Un identifiant technique par appareil connecté, pour que tu puisses te déconnecter à
            distance et pour détecter un vol de session. Aucun pistage publicitaire.
          </Definition>
        </div>
      </Section>

      <Section title="Ce que nous ne faisons pas">
        <p>
          Nous ne vendons aucune donnée. Nous n’envoyons aucune publicité non sollicitée : les
          quatre seuls messages que tu peux recevoir concernent tes propres billets, et trois
          d’entre eux se désactivent depuis tes réglages.
        </p>
        <p>
          Nous n’utilisons pas de traceurs publicitaires tiers, ni de pixels de réseaux sociaux.
        </p>
      </Section>

      <Section title="Qui voit tes données">
        <p>
          <strong className="text-text-strong">L’organisateur de ton événement</strong> voit ton
          nom, ton numéro et ce que tu as acheté — il en a besoin pour te laisser entrer et pour te
          contacter en cas d’annulation. Il ne voit rien de tes autres événements.
        </p>
        <p>
          <strong className="text-text-strong">L’opérateur de paiement</strong> reçoit le montant et
          ton numéro payeur, le temps de la transaction.
        </p>
        <p>
          <strong className="text-text-strong">Notre équipe support</strong> accède à tes commandes
          uniquement pour traiter une demande. Chaque consultation est journalisée.
        </p>
      </Section>

      <Section title="Combien de temps">
        <p>
          Les commandes et les billets sont conservés le temps nécessaire aux obligations comptables
          et à la gestion des litiges. Les sessions expirent d’elles-mêmes après quatre-vingt-dix
          jours d’inactivité. Les codes de connexion sont effacés après usage ou expiration.
        </p>
        <ToComplete>
          Les durées de conservation exactes dépendent des obligations comptables et fiscales
          béninoises applicables à l’exploitant. Elles doivent être précisées ici, chiffres à
          l’appui, plutôt que formulées de façon vague.
        </ToComplete>
      </Section>

      <Section title="Tes droits">
        <p>
          Tu peux consulter tes données depuis ton compte, demander leur correction, leur export ou
          leur effacement. L’effacement ne peut pas porter sur les commandes déjà payées tant que
          les obligations comptables courent — dans ce cas, elles sont détachées de ton identité
          plutôt que supprimées.
        </p>
        <ToComplete>
          Renseigner ici l’adresse de contact pour l’exercice des droits, le responsable de
          traitement, et le cas échéant la déclaration auprès de l’Autorité de Protection des
          Données à Caractère Personnel du Bénin (APDP).
        </ToComplete>
      </Section>
    </LegalPage>
  );
}
