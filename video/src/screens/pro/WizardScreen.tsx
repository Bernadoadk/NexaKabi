import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { config } from '../../config';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EventCover } from '../../components/ui/EventCover';
import { Money } from '../../components/ui/Money';
import { heroEvent } from '../../lib/format';
import { cn } from '../../lib/layout';
import { ConsoleShell, EventHeader, FieldMock, type ConsoleLayout } from './Console';

/** Les huit étapes de l'assistant (`packages/contracts/src/events.ts`). */
export const WIZARD_STEPS = [
  'Informations générales',
  'Date et heure',
  'Lieu',
  'Visuels',
  'Billets',
  'Paramètres',
  'Aperçu',
  'Publication',
] as const;

/**
 * Assistant de création d'un événement (`pro/evenements/[id]/wizard.tsx`),
 * puis la fenêtre « Événement publié ».
 */
export const WizardScreen: React.FC<{
  layout: ConsoleLayout;
  step: number;
  publishPress?: number;
  publishing?: boolean;
  /** Fenêtre de succès (0 → 1). */
  dialog?: number;
  scroll?: number;
}> = ({ layout, step, publishPress = 0, publishing = false, dialog = 0, scroll = 0 }) => {
  const mobile = layout === 'mobile';

  return (
    <div className="relative h-full">
      <ConsoleShell layout={layout} section="Événements" scroll={scroll}>
        <div className="flex flex-col gap-4">
          <EventHeader layout={layout} published={false} tab="Configuration" />

          <div className={cn('flex gap-5', mobile ? 'flex-col gap-4' : 'items-start')}>
            {mobile ? <MobileStepper step={step} /> : <StepColumn step={step} />}

            <div className="min-w-0 flex-1 rounded-panel border border-border bg-surface p-4 sm:p-6">
              <div className="flex flex-col gap-5">
                <StepContent
                  step={step}
                  publishPress={publishPress}
                  publishing={publishing}
                  mobile={mobile}
                />
                {step < 8 && !mobile ? (
                  <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
                    <Button variant="secondary" size="mobile">
                      ← Précédent
                    </Button>
                    <span className="flex-1 text-micro text-text-3">
                      Brouillon enregistré à {config.data.clock}
                    </span>
                    <Button variant="ink" size="mobile">
                      Continuer →
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </ConsoleShell>

      {dialog > 0 ? <SuccessDialog progress={dialog} /> : null}
    </div>
  );
};

const StepColumn: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex w-[240px] shrink-0 flex-col gap-1 rounded-panel border border-border bg-surface p-6">
    <p className="eyebrow m-0 mb-1 text-text-3">Étape {step} sur 8</p>
    {WIZARD_STEPS.map((label, index) => {
      const number = index + 1;
      return (
        <div
          key={label}
          className={cn(
            'flex items-center gap-2.5 rounded-field px-2.5 py-2 text-body',
            number === step ? 'bg-paper font-semibold' : 'text-text-2',
          )}
        >
          <span
            className={cn(
              'flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px]',
              number < step && 'bg-mint font-bold text-white',
              number === step && 'bg-coral font-extrabold text-ink',
              number > step && 'bg-fill-muted font-bold text-text-3',
            )}
          >
            {number < step ? <Check className="size-3" strokeWidth={3} /> : number}
          </span>
          {label}
        </div>
      );
    })}
    <p className="m-0 mt-3 rounded-[12px] border border-blue-200 bg-blue-50 p-3 text-micro leading-relaxed text-blue-700">
      Tu peux quitter à tout moment : le brouillon est conservé et reprend exactement à cette étape.
    </p>
  </div>
);

/** Rangée de pastilles des petits écrans, l'étape courante ramenée au centre. */
const MobileStepper: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between">
      <p className="eyebrow m-0 text-text-3">Étape {step} sur 8</p>
      <p className="m-0 text-body-s font-semibold text-text-strong">{WIZARD_STEPS[step - 1]}</p>
    </div>
    <div className="-mx-4 overflow-hidden px-4">
      <ol
        className="m-0 flex list-none gap-2 p-0"
        style={{ transform: `translateX(${-Math.max(0, step - 2) * 118}px)` }}
      >
        {WIZARD_STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const active = number === step;
          return (
            <li key={label} className="shrink-0">
              <span
                className={cn(
                  'flex min-h-[40px] items-center gap-2 rounded-full pl-1.5 pr-3.5 text-body-s',
                  active && 'bg-ink font-bold text-white',
                  done && 'border border-mint-200 bg-mint-50 font-semibold text-mint-700',
                  !active && !done && 'border border-border bg-surface font-semibold text-text-2',
                )}
              >
                <span
                  className={cn(
                    'flex size-[26px] items-center justify-center rounded-full text-[11px]',
                    active && 'bg-coral font-extrabold text-ink',
                    done && 'bg-mint text-white',
                    !active && !done && 'bg-fill-muted font-bold text-text-3',
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : number}
                </span>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  </div>
);

const Heading: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <div className="flex flex-col gap-1">
    <h2 className="m-0 font-display text-h2 font-bold">{title}</h2>
    <p className="m-0 text-body text-text-2">{hint}</p>
  </div>
);

const StepContent: React.FC<{
  step: number;
  publishPress: number;
  publishing: boolean;
  mobile: boolean;
}> = ({ step, publishPress, publishing, mobile }) => {
  const event = heroEvent();
  const grid = mobile ? 'grid gap-3.5' : 'grid grid-cols-2 gap-3.5';

  switch (step) {
    case 1:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="De quoi s’agit-il ?"
            hint="Le titre et la catégorie déterminent où ton événement apparaîtra dans la découverte."
          />
          <FieldMock label="Titre de l’événement" value={event.title} />
          <FieldMock
            label="Catégorie"
            value={
              <span className="flex items-center justify-between">
                {config.categories[event.category].name}
                <ChevronDown className="size-4 text-text-3" />
              </span>
            }
          />
          <FieldMock label="Description" value={config.data.heroEventDescription} multiline />
        </div>
      );
    case 2:
      return (
        <div className="flex flex-col gap-4">
          <Heading title="Quand ?" hint="La date apparaît sur la carte, le billet et le rappel." />
          <div className={grid}>
            <FieldMock label="Début" value="19/12/2026 · 18:00" />
            <FieldMock label="Fin" value="20/12/2026 · 23:00" />
          </div>
          <FieldMock label="Ouverture des portes" hint="· facultatif" value="17:00" />
        </div>
      );
    case 3:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Où ?"
            hint="Le lieu conditionne le filtrage par ville, et l’épingle sur la carte des participants."
          />
          <FieldMock label="Nom du lieu" value={event.venue} />
          <FieldMock
            label="Ville"
            value={
              <span className="flex items-center justify-between">
                {event.city}
                <ChevronDown className="size-4 text-text-3" />
              </span>
            }
          />
        </div>
      );
    case 4:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Visuels"
            hint="Photo réelle, cadrée large. Sans image, l’événement reçoit une plaque colorée dérivée de sa catégorie."
          />
          <div className="relative h-[190px] overflow-hidden rounded-card border border-border bg-ink">
            <EventCover event={event} />
          </div>
        </div>
      );
    case 5:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Billets"
            hint="Crée une catégorie par tarif. Un prix à 0 rend l’inscription gratuite."
          />
          <ul className="m-0 list-none overflow-hidden rounded-card border border-border p-0">
            {config.data.tickets.map((ticket) => (
              <li
                key={ticket.name}
                className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0"
              >
                <div className="min-w-[140px] flex-1">
                  <div className="text-body font-semibold">{ticket.name}</div>
                  <div className="text-micro text-text-3">0 vendus · {ticket.total} restants</div>
                </div>
                <Money amount={ticket.price} size="small" />
                <Badge tone="success">En vente</Badge>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3.5 border-t border-border-subtle pt-4">
            <p className="eyebrow m-0 text-text-3">Nouvelle catégorie</p>
            <div className={grid}>
              <FieldMock
                label="Nom"
                value={<span className="text-text-3">Pass 1 jour · Standard</span>}
              />
              <FieldMock label="Prix" value="0" suffix="FCFA" />
            </div>
          </div>
        </div>
      );
    case 6:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Paramètres"
            hint="Ces règles s’affichent telles quelles aux participants, dans la section « Bon à savoir »."
          />
          <div className={grid}>
            {[
              { label: 'Public', description: 'Référencé dans la découverte', on: true },
              { label: 'Privé', description: 'Accessible par lien uniquement', on: false },
            ].map((option) => (
              <div
                key={option.label}
                className={cn(
                  'flex flex-col gap-0.5 rounded-card border p-3.5',
                  option.on ? 'border-text-strong bg-paper' : 'border-border-field bg-surface',
                )}
              >
                <span className="text-body font-semibold">{option.label}</span>
                <span className="text-micro text-text-2">{option.description}</span>
              </div>
            ))}
          </div>
          <FieldMock label="Remboursement" value={config.data.refundPolicy} />
        </div>
      );
    case 7:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Aperçu"
            hint="Exactement ce que verront les participants — vérifie, puis corrige l’étape concernée."
          />
          <div className="relative h-[170px] overflow-hidden rounded-card bg-ink">
            <EventCover event={event} />
            <div className="ink-scrim absolute inset-0" />
            <div className="absolute inset-x-4 bottom-4 text-white">
              <Badge tone="overlay-accent">{config.categories[event.category].name}</Badge>
              <p className="m-0 mt-2 font-display text-[24px] font-bold tracking-[-0.03em]">
                {event.title}
              </p>
            </div>
          </div>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-4">
          <Heading
            title="Publier"
            hint="Une fois publié, l’événement est visible et la billetterie ouvre."
          />
          <div className="flex flex-col gap-3 rounded-block bg-ink p-6 text-white">
            <h3 className="m-0 text-[15px] font-bold">Ce qui se passe à la publication</h3>
            <p className="m-0 text-body-s leading-relaxed text-on-ink-2">
              Les catégories de billets passent en vente. Un organisateur vérifié qui a déjà publié
              met son événement en ligne immédiatement.
            </p>
          </div>
          <Button
            variant="primary"
            size="primary"
            block
            press={publishPress}
            loading={publishing}
            loadingLabel="Publication…"
          >
            Publier maintenant
          </Button>
        </div>
      );
  }
};

/** Fenêtre de succès (`SuccessDialog`) : rond menthe, message, suite logique. */
const SuccessDialog: React.FC<{ progress: number }> = ({ progress }) => (
  <div
    className="absolute inset-0 z-50 flex items-center justify-center px-5"
    style={{ background: `rgba(18,16,43,${0.4 * Math.min(1, progress * 1.5)})` }}
  >
    <div
      className="relative w-full max-w-[440px] rounded-panel bg-surface p-6 shadow-lg"
      style={{
        transform: `translateY(${(1 - progress) * 30}px) scale(${0.94 + progress * 0.06})`,
        opacity: Math.min(1, progress * 1.4),
      }}
    >
      <p className="m-0 pr-6 font-display text-h3 font-bold">Événement publié</p>
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-16 items-center justify-center rounded-full bg-mint text-mint-950"
            style={{ transform: `scale(${0.5 + progress * 0.5})` }}
          >
            <Check className="size-8" strokeWidth={3} />
          </div>
          <p className="m-0 text-body text-text-2">
            Il est désormais visible dans la découverte, et la billetterie est ouverte.
          </p>
        </div>
        <Button variant="primary" size="mobile" block>
          Voir mes événements →
        </Button>
      </div>
    </div>
  </div>
);
