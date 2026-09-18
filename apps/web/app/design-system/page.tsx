import type { Metadata } from 'next';
import { Bell, Check, Ticket } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  DateChip,
  EmptyState,
  ErrorState,
  EventCardCompact,
  EventCardHorizontal,
  EventCardLarge,
  EventCardSkeleton,
  EventCardStandard,
  LongWait,
  Money,
  OfflineBanner,
  RowSkeleton,
  SearchEmptyState,
  Stat,
  SuccessState,
  Surface,
  SurfaceFooter,
  SurfaceHeader,
  SurfaceSubtitle,
  SurfaceTitle,
  Table,
  TableFooter,
  TableNumber,
  TableRow,
  type EventCardData,
} from '@nexakabi/ui';
import { FormsSection, PaginationDemo, WaitingSection } from './client-parts';

export const metadata: Metadata = {
  title: 'Design system',
  description: 'Galerie de vérification des jetons et composants Nexa-Kabi.',
  robots: { index: false, follow: false },
};

/**
 * Galerie de vérification du design system.
 *
 * Cette page n'est pas un écran produit : elle sert à comparer chaque
 * composant, côte à côte, avec l'écran « Design system » du prototype de
 * référence `design-reference/Nexa-Kabi.dc.html`.
 */

const FESTIVAL: EventCardData = {
  slug: 'yele-2026',
  title: 'Festival Yélé · 3e édition',
  startsAt: new Date(2026, 2, 14, 18, 0),
  venueName: 'Plage de Fidjrossè',
  cityName: 'Cotonou',
  categoryName: 'Musique',
  categoryColor: '#1E1A48',
  fromPrice: 5_000,
  feeAmount: 250,
  isAlmostSoldOut: true,
};

const SUMMIT: EventCardData = {
  slug: 'benin-tech-summit-2026',
  title: 'Bénin Tech Summit 2026',
  startsAt: new Date(2026, 2, 26, 9, 0),
  venueName: 'Sofitel',
  cityName: 'Cotonou',
  categoryName: 'Tech',
  categoryColor: '#0B3C5D',
  fromPrice: 25_000,
  remainingSeats: 42,
};

const AFROBEAT: EventCardData = {
  slug: 'soiree-afrobeat-live-band',
  title: 'Soirée Afrobeat · Live Band',
  startsAt: new Date(2026, 3, 3, 20, 0),
  venueName: 'Le Berlin',
  cityName: 'Cotonou',
  ageRestriction: '18 ans+',
  categoryColor: '#3D1E4A',
  fromPrice: 3_000,
};

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-6 py-10">
      <header className="mb-10 flex flex-col gap-3">
        <p className="eyebrow text-text-3">Nexa-Kabi · design system</p>
        <h1 className="max-w-[760px] font-display text-h1 font-bold">
          La nuit d’un concert, la clarté d’une banque.
        </h1>
        <p className="max-w-[720px] text-body-l text-text-2">
          Chaque valeur de cette page est relevée dans le prototype de référence. Cette galerie sert
          à vérifier la fidélité composant par composant, avant qu’un écran produit ne soit
          construit.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        <Palette />
        <Typography />
        <Buttons />
        <Badges />
        <FormsSection />
        <Amounts />
        <EventCards />
        <DataTable />
        <States />
        <WaitingSection />
        <Feedback />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
        {note ? <p className="max-w-[520px] text-body-s text-text-2">{note}</p> : null}
      </div>
      {children}
    </Surface>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const PRIMARY_COLORS = [
  ['Encre · Primary', '#12102B', 'bg-ink', 'Fonds immersifs, sidebar, texte'],
  ['Encre 700', '#1E1A48', 'bg-ink-700', 'Élévation sur fond sombre'],
  ['Corail · Accent', '#FF4D2E', 'bg-coral', 'Action principale, prix — jamais décoratif'],
  ['Menthe · Success', '#12B981', 'bg-mint', 'Payé, billet valide, retrait effectué'],
  ['Ambre · Warning', '#F0A92E', 'bg-amber', 'En attente, déjà utilisé, hors ligne'],
  ['Rouge · Error', '#E03535', 'bg-red', 'Échec, billet invalide, annulation'],
] as const;

const SURFACE_COLORS = [
  ['Papier · Background', '#F6F5F2', 'bg-paper border border-border'],
  ['Surface', '#FFFFFF', 'bg-surface border border-border'],
  ['Bordure', '#E7E4DC', 'bg-border'],
  ['Texte secondaire', '#6E6A80', 'bg-[#6E6A80]'],
  ['Corail 50', '#FFEDE8', 'bg-coral-50'],
  ['Bleu · Info', '#3B82F6', 'bg-blue'],
] as const;

function Palette() {
  return (
    <Section title="Palette">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {PRIMARY_COLORS.map(([name, hex, className, usage]) => (
          <div key={hex} className="flex flex-col gap-1.5">
            <div className={`h-[82px] rounded-[14px] ${className}`} />
            <div className="text-body-s font-semibold">{name}</div>
            <div className="tabular text-micro text-text-3">{hex}</div>
            <div className="text-micro leading-snug text-text-2">{usage}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 md:grid-cols-3 lg:grid-cols-6">
        {SURFACE_COLORS.map(([name, hex, className]) => (
          <div key={hex} className="flex flex-col gap-1.5">
            <div className={`h-[54px] rounded-[12px] ${className}`} />
            <div className="text-[12px] font-semibold">{name}</div>
            <div className="tabular text-micro text-text-3">{hex}</div>
          </div>
        ))}
      </div>

      <p className="rounded-[12px] bg-paper px-4 py-3.5 text-body-s leading-relaxed text-text-2">
        Règle d’usage :{' '}
        <b className="text-text-strong">un seul élément corail par zone de décision</b>. Si deux
        boutons corail sont visibles ensemble, l’un des deux est mal hiérarchisé. Le corail n’est
        jamais utilisé pour du texte courant sur fond clair en dessous de 16 px semi-gras.
      </p>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Typography() {
  return (
    <Section
      title="Typographie"
      note="Bricolage Grotesque pour les titres · Plus Jakarta Sans pour l’interface — support complet des diacritiques françaises, chiffres tabulaires pour les montants."
    >
      <div className="flex flex-col gap-3.5">
        <TypeRow spec={'Display\n56/1.02 · -3,5 %'}>
          <span className="font-display text-display font-bold">Sors ce soir à Cotonou</span>
        </TypeRow>
        <TypeRow spec={'H1\n34/1.1'}>
          <span className="font-display text-h1 font-bold">Festival Yélé · 3e édition</span>
        </TypeRow>
        <TypeRow spec={'H2\n24/1.2'}>
          <span className="font-display text-h2 font-bold">Types de billets disponibles</span>
        </TypeRow>
        <TypeRow spec={'H3\n17/1.3 · 700'}>
          <span className="text-h3 font-bold">Informations du participant</span>
        </TypeRow>
        <TypeRow spec={'Body L\n15/1.65'}>
          <span className="max-w-[620px] text-body-l text-text-strong">
            Trois scènes, dix-huit artistes, deux jours de concerts à la Plage de Fidjrossè.
            Ouverture des portes à 18 h.
          </span>
        </TypeRow>
        <TypeRow spec={'Body\n13,5/1.6'}>
          <span className="max-w-[620px] text-body text-text-2">
            Texte d’interface courant, descriptions, aide contextuelle. Base de la densité pro.
          </span>
        </TypeRow>
        <TypeRow spec={'Caption\n11/1.45 · .14em'}>
          <span className="eyebrow text-caption text-text-3">Sam. 14 mars · 18h00 · Cotonou</span>
        </TypeRow>
      </div>

      <p className="rounded-[12px] bg-paper px-4 py-3.5 text-body-s leading-relaxed text-text-2">
        Le français allonge les libellés de 15 à 25 % par rapport à l’anglais : tout composant est
        dessiné avec une marge de débordement d’une ligne, et aucun bouton n’a de largeur fixe. Les
        montants utilisent l’espace insécable comme séparateur de milliers.
      </p>
    </Section>
  );
}

function TypeRow({ spec, children }: { spec: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-border-subtle pb-3.5 md:flex-row md:items-baseline md:gap-5">
      <div className="w-[130px] shrink-0 whitespace-pre-line text-micro leading-snug text-text-3">
        {spec}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Buttons() {
  return (
    <Section
      title="Boutons"
      note="Le corail porte un texte encre, pas blanc : contraste plus élevé et rendu moins « bouton web générique ». Hauteur tactile minimale 44 px partout, 48 px sur les surfaces mobiles."
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="primary">Obtenir un billet</Button>
        <Button variant="ink">Publier</Button>
        <Button variant="secondary">Secondaire</Button>
        <Button variant="tertiary">Tertiaire</Button>
        <Button variant="destructive">Annuler l’événement</Button>
        <Button variant="destructive-solid">Annuler et rembourser</Button>
        <Button variant="secondary" size="icon" aria-label="Plus d’actions">
          ⋯
        </Button>
        <Button variant="primary" loading />
        <Button variant="primary" disabled>
          Épuisé
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle pt-4">
        <Button variant="primary" size="mobile">
          48 px · mobile
        </Button>
        <Button variant="primary" size="primary">
          52 px · action primaire
        </Button>
        <Button variant="primary" size="scan">
          56 px · scan
        </Button>
        <Button variant="secondary" size="compact">
          Compact
        </Button>
      </div>

      <div className="rounded-[12px] bg-ink p-5">
        <p className="mb-3 text-body-s text-on-ink-2">Boutons posés sur un fond encre :</p>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="primary">Voir mes billets</Button>
          <Button variant="on-ink">Envoyer sur WhatsApp</Button>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Badges() {
  return (
    <Section
      title="Badges & statuts"
      note="Un statut n’est jamais porté par la couleur seule : toujours un mot, et un point ou une icône pour les cas critiques."
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone="success">Payé</Badge>
        <Badge tone="warning">En attente</Badge>
        <Badge tone="danger">Échoué</Badge>
        <Badge tone="info">Remboursé</Badge>
        <Badge tone="neutral">Brouillon</Badge>
        <Badge tone="ink">Publié</Badge>
        <Badge tone="accent">Bientôt complet</Badge>
        <Badge tone="success" dot>
          Entré · 19h42
        </Badge>
        <Badge tone="verified">
          <Check className="size-3" strokeWidth={3} />
          Organisateur vérifié
        </Badge>
        <Badge tone="accent">Gratuit</Badge>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Amounts() {
  return (
    <Section
      title="Montants"
      note="Tout montant passe par le composant Money : espace insécable, chiffres tabulaires, suffixe FCFA toujours d’un poids inférieur au chiffre."
    >
      <div className="flex flex-wrap items-baseline gap-8">
        <Money amount={15_000} size="large" />
        <Money amount={9_500} size="hero" />
        <Money amount={2_000} size="default" />
        <Money amount={1_250_000} size="small" />
        <Money amount={-212_125} size="medium" />
      </div>

      <div className="grid grid-cols-2 gap-3.5 border-t border-border-subtle pt-4 lg:grid-cols-5">
        <Stat label="Revenus bruts" amount={4_242_500} hint="FCFA · 714 billets" />
        <Stat label="Commission plateforme" amount={-212_125} hint="5 % du prix des billets" />
        <Stat label="Frais opérateurs" amount={-71_400} hint="100 FCFA par transaction" />
        <Stat label="Remboursements" amount={-36_900} hint="4 commandes" />
        <Stat
          label="Solde disponible"
          amount={1_894_000}
          hint="2 028 075 débloqués le 16 mars"
          tone="ink"
        />
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EventCards() {
  return (
    <Section
      title="Carte d’événement · quatre variantes d’un même composant"
      note="La variante compacte remplace l’image par une pastille de date : dans un dashboard, la photo n’aide pas à décider et coûte de la bande passante."
    >
      <div className="grid gap-5 lg:grid-cols-[300px_240px_1fr]">
        <div className="flex flex-col gap-2.5">
          <p className="eyebrow text-text-3">Large · sections principales</p>
          <EventCardLarge event={FESTIVAL} href="/e/yele-2026" />
        </div>

        <div className="flex flex-col gap-2.5">
          <p className="eyebrow text-text-3">Standard · listes</p>
          <EventCardStandard event={SUMMIT} href="/e/benin-tech-summit-2026" />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="eyebrow text-text-3">Horizontale · mobile & recommandations</p>
            <EventCardHorizontal event={AFROBEAT} href="/e/soiree-afrobeat-live-band" />
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="eyebrow text-text-3">Compacte · dashboard</p>
            <EventCardCompact
              event={FESTIVAL}
              detail="18h00 · Fidjrossè · 2 billets"
              status={<Badge tone="success">Valide</Badge>}
            />
            <div className="flex items-center gap-3">
              <DateChip date={SUMMIT.startsAt} />
              <DateChip date={AFROBEAT.startsAt} size="large" />
              <span className="text-micro text-text-2">Pastilles de date, deux tailles</span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const TABLE_COLUMNS = '1.5fr .8fr .6fr .6fr .8fr 40px';

function DataTable() {
  return (
    <Section
      title="Table de données · densité pro"
      note="Sur mobile, cette table devient une pile de cartes : aucun défilement horizontal."
    >
      <Table>
        <TableRow columns={TABLE_COLUMNS} variant="head">
          <div>Billet</div>
          <div className="text-right">Prix</div>
          <div className="text-right">Vendus</div>
          <div className="text-right">Restants</div>
          <div>Statut</div>
          <div />
        </TableRow>

        <TableRow columns={TABLE_COLUMNS}>
          <div className="font-semibold">Pass 2 jours · VIP</div>
          <TableNumber className="font-semibold">25 000</TableNumber>
          <TableNumber>64</TableNumber>
          <TableNumber>36</TableNumber>
          <div>
            <Badge tone="success">En vente</Badge>
          </div>
          <div className="cursor-pointer text-right text-text-3">⋯</div>
        </TableRow>

        <TableRow columns={TABLE_COLUMNS}>
          <div className="font-semibold">Pass 2 jours · Standard</div>
          <TableNumber className="font-semibold">8 000</TableNumber>
          <TableNumber>412</TableNumber>
          <TableNumber>88</TableNumber>
          <div>
            <Badge tone="accent">Bientôt complet</Badge>
          </div>
          <div className="cursor-pointer text-right text-text-3">⋯</div>
        </TableRow>

        <TableRow columns={TABLE_COLUMNS} variant="muted">
          <div className="font-semibold">Early bird</div>
          <TableNumber>5 000</TableNumber>
          <TableNumber>200</TableNumber>
          <TableNumber>0</TableNumber>
          <div>
            <Badge tone="neutral">Clôturé</Badge>
          </div>
          <div className="cursor-pointer text-right text-text-3">⋯</div>
        </TableRow>

        <TableFooter>
          <div>676 billets vendus · 3 catégories</div>
          <PaginationDemo />
        </TableFooter>
      </Table>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function States() {
  return (
    <Section
      title="États UX"
      note="Un écran n’est livré que lorsque ses cinq états sont dessinés : vide, chargement, erreur, succès, hors ligne."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Surface variant="panel" padding="none" className="overflow-hidden">
          <StateHeader>Vide · premier événement</StateHeader>
          <EmptyState
            icon={<Ticket size={26} />}
            title="Aucun événement pour l’instant"
            description="Créez votre premier événement — il faut cinq minutes, et vous pouvez le publier plus tard."
            action={<Button variant="primary">Créer mon événement</Button>}
            secondaryAction={
              <a href="#" className="text-body-s text-text-2 underline">
                Voir un exemple d’événement
              </a>
            }
          />
        </Surface>

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <StateHeader>Vide · résultat de recherche</StateHeader>
          <SearchEmptyState
            title="Rien pour « slam » à Parakou"
            suggestions={[
              { label: '« slam » dans tout le Bénin · 6 événements' },
              { label: 'Culture à Parakou · 11 événements' },
              {
                label: 'M’alerter dès qu’un événement correspond',
                icon: <Bell className="size-4" />,
              },
            ]}
          />
        </Surface>

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <StateHeader>Chargement · squelette</StateHeader>
          <div className="flex flex-col gap-3 p-4">
            <EventCardSkeleton />
            <RowSkeleton />
            <p className="text-[12px] leading-relaxed text-text-2">
              Le squelette reprend exactement la géométrie finale — aucun décalage à l’arrivée des
              données. Jamais de spinner plein écran sur une liste.
            </p>
          </div>
        </Surface>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SuccessState
          title="C’est payé, ton billet est prêt"
          description={
            <>
              Commande <b className="tabular text-white">NK-8F4C21</b>
              <br />2 × Pass Standard · Festival Yélé
            </>
          }
          actions={
            <>
              <Button variant="primary" size="primary" block>
                Voir mes billets
              </Button>
              <Button variant="on-ink" size="mobile" block>
                Envoyer sur WhatsApp
              </Button>
            </>
          }
        />

        <Surface variant="panel" padding="none" className="overflow-hidden">
          <StateHeader>Erreur · paiement</StateHeader>
          <ErrorState
            title="Le paiement n’a pas abouti"
            description={
              <>
                Aucun montant n’a été débité. Ton panier est conservé{' '}
                <b className="text-text-strong">28 minutes</b> et tes places restent réservées.
              </>
            }
            actions={
              <>
                <Button variant="primary" size="mobile" block>
                  Réessayer avec MTN MoMo
                </Button>
                <Button variant="secondary" size="mobile" block>
                  Changer de moyen de paiement
                </Button>
              </>
            }
            cause={
              <>
                Motif technique : <b>délai de confirmation opérateur dépassé</b> · réf. NK-8F4C21.
                Toujours donner la cause probable, jamais un code brut seul.
              </>
            }
          />
        </Surface>

        <Surface variant="panel" padding="none" className="flex flex-col overflow-hidden">
          <StateHeader>Attente longue · Mobile Money</StateHeader>
          <LongWait
            title="Confirmation en cours…"
            description={
              <>
                Valide la demande reçue sur ton téléphone. Cela prend en général 30 secondes.{' '}
                <b className="text-text-strong">Ne ferme pas cette page.</b>
              </>
            }
            progress={0.38}
            countdown="2 min 04"
            reassurance={
              <p className="text-micro text-text-3">aucun débit tant que tu ne valides pas</p>
            }
          />
        </Surface>
      </div>
    </Section>
  );
}

function StateHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow border-b border-border-subtle px-4 py-3 text-text-3">{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Feedback() {
  return (
    <Section
      title="Feedback"
      note="Une erreur est toujours suivie d’une action. Le hors-ligne dégrade la fonctionnalité, il ne coupe jamais l’accès."
    >
      <div className="flex flex-col gap-3">
        <Alert tone="success" title="Événement publié">
          Il est visible sur nexakabi.bj/e/yele-2026
        </Alert>

        <Alert tone="warning" title="Connexion instable">
          Tes 12 derniers scans sont enregistrés et seront synchronisés automatiquement.
        </Alert>

        <Alert
          tone="danger"
          title="Retrait refusé par l’opérateur"
          action={
            <a href="#" className="text-[12px] font-semibold underline">
              Modifier le numéro →
            </a>
          }
        >
          Le numéro 01 97 44 12 08 n’est pas un compte marchand.
        </Alert>

        <OfflineBanner description="Tes billets déjà téléchargés restent accessibles. Les nouveautés apparaîtront au retour du réseau." />
      </div>

      <Surface variant="panel" padding="none" className="max-w-[420px] shadow-lg">
        <div className="flex flex-col gap-3 p-4">
          <SurfaceTitle>Annuler l’événement ?</SurfaceTitle>
          <SurfaceSubtitle>
            128 billets ont été vendus pour 1 340 000 FCFA. Les participants seront remboursés sous
            5 jours ouvrés et notifiés immédiatement. Cette action est irréversible.
          </SurfaceSubtitle>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="compact">
              Retour
            </Button>
            <Button variant="destructive-solid" size="compact">
              Annuler et rembourser
            </Button>
          </div>
        </div>
      </Surface>

      <Surface variant="panel" padding="none" className="overflow-hidden">
        <SurfaceHeader>
          <div>
            <SurfaceTitle>Surfaces et en-têtes</SurfaceTitle>
            <SurfaceSubtitle>En-tête, corps, pied — la structure des panneaux pro</SurfaceSubtitle>
          </div>
        </SurfaceHeader>
        <div className="p-5 text-body text-text-2">
          Corps du panneau. Le pied reprend le fond papier et porte les totaux ou la pagination.
        </div>
        <SurfaceFooter>Pied de panneau</SurfaceFooter>
      </Surface>
    </Section>
  );
}
