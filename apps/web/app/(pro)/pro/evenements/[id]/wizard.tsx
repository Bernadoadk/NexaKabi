'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Crosshair, ExternalLink, Eye, LocateFixed, MapPin } from 'lucide-react';
import {
  EVENT_TITLE_MAX_LENGTH,
  EVENT_WIZARD_STEPS,
  type EventDetail,
  type GeocodeResult,
  type PlaceDetails,
} from '@nexakabi/contracts';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Money,
  MoneyInput,
  Surface,
  SuccessDialog,
  Textarea,
} from '@nexakabi/ui';
import type { Category, City } from '@/lib/events';
import { LocationPicker } from '@/components/location-picker';
import type { LatLngLiteral } from '@/components/google-maps';
import { EventPageView } from '@/components/event-page-view';
import { PlaceSearch } from '../../place-search';
import {
  addTicketTypeAction,
  cancelEventAction,
  publishEventAction,
  removeTicketTypeAction,
  saveEventStepAction,
  updateTicketTypeAction,
} from '../../actions';

/**
 * Assistant de création d'événement — les huit étapes du prototype.
 *
 * Deux principes repris tels quels :
 *   · Le brouillon est enregistré à chaque étape et reprend exactement là où
 *     l'organisateur s'est arrêté. Fermer l'onglet ne fait rien perdre.
 *   · Les contrôles de cohérence ne s'appliquent qu'à la PUBLICATION : exiger
 *     un formulaire complet à chaque sauvegarde reviendrait à interdire les
 *     brouillons.
 */
export interface MapsConfig {
  /** Clé NAVIGATEUR Google Maps — publique par construction, vide si non configurée. */
  apiKey: string;
  /** Nonce de la politique de sécurité, pour la balise du SDK. */
  nonce?: string;
}

export function EventWizard({
  organizationId,
  event,
  categories,
  cities,
  initialMissing,
  maps,
}: {
  organizationId: string;
  event: EventDetail;
  categories: Category[];
  cities: City[];
  maps: MapsConfig;
  /**
   * Complétude au chargement, lue via `GET .../readiness` par la page
   * serveur. Avant, `missing` ne se remplissait qu'après une TENTATIVE de
   * publication échouée — un organisateur qui remplissait son événement sur
   * plusieurs jours ne savait ce qu'il manquait qu'au moment de publier.
   */
  initialMissing: string[] | null;
}) {
  const router = useRouter();

  const isPublished = event.status !== 'DRAFT' && event.status !== 'REJECTED';

  /**
   * Un brouillon rouvre à l'étape où il a été laissé — c'est ce que l'encart
   * de la colonne promet depuis le début, et `draftStep` était bien enregistré
   * à chaque sauvegarde ; il n'était simplement jamais relu. Un événement en
   * ligne, lui, s'ouvre au début : on vient y corriger, pas y reprendre.
   */
  const [step, setStep] = React.useState(() =>
    isPublished ? 1 : Math.min(8, Math.max(1, event.draftStep ?? 1)),
  );
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [missing, setMissing] = React.useState<string[] | null>(initialMissing);
  // Ouvre la confirmation de publication — voir `onPublish` plus bas. Séparé
  // de `isPublished` : celui-ci reste vrai pour toujours, la modale ne doit
  // s'ouvrir qu'à l'INSTANT où la publication réussit, pas à chaque revisite
  // d'un événement déjà en ligne.
  const [showPublishSuccess, setShowPublishSuccess] = React.useState(false);

  // Chaque sauvegarde rafraîchit la page serveur, donc la complétude. Sans
  // ceci, la liste de ce qui manque restait figée à son état d'ouverture :
  // « Ajoute une description » survivait à la description ajoutée.
  React.useEffect(() => {
    setMissing(initialMissing);
  }, [initialMissing]);

  // Un brouillon qui n'a encore que son titre : l'organisateur arrive de la
  // création, il faut lui dire où il est et ce qui l'attend.
  const isFreshDraft = !isPublished && (event.draftStep ?? 1) === 1 && !event.description;

  // Les étapes 1, 2, 3 et 6 sont des formulaires : leur bouton enregistre ET
  // passe à la suite. Le bouton de navigation, lui, n'enregistre rien, et doit
  // le dire — sinon une saisie se perd sans qu'on comprenne pourquoi.
  const stepHasForm = [1, 2, 3, 6].includes(step);

  async function save(payload: Record<string, unknown>, nextStep?: number) {
    setPending(true);
    setError(null);

    const result = await saveEventStepAction(organizationId, event.id, {
      ...payload,
      draftStep: nextStep ?? step,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return false;
    }

    setSaved(new Date().toLocaleTimeString('fr-FR'));
    if (nextStep) setStep(nextStep);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
      {/* Sous le palier lg, la colonne d'étapes deviendrait une pile de huit
          lignes AVANT le contenu : l'organisateur ferait défiler un menu pour
          atteindre son formulaire. Elle se replie en une rangée de pastilles
          qui défile, l'étape courante ramenée dans le champ. */}
      <MobileStepper step={step} onSelect={setStep} />

      {/* Colonne d'étapes : navigation libre, pour revenir corriger sans
          repasser par tout le parcours. */}
      <Surface
        variant="panel"
        padding="comfortable"
        className="hidden shrink-0 flex-col gap-1 lg:flex lg:w-[240px]"
      >
        <p className="eyebrow mb-1 text-text-3">Étape {step} sur 8</p>

        {EVENT_WIZARD_STEPS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setStep(entry.step)}
            className={
              entry.step === step
                ? 'flex items-center gap-2.5 rounded-field bg-paper px-2.5 py-2 text-left text-body font-semibold'
                : 'flex items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-body text-text-2 hover:bg-paper'
            }
          >
            <span
              className={
                entry.step < step
                  ? 'flex size-[22px] shrink-0 items-center justify-center rounded-full bg-mint text-[11px] font-bold text-white'
                  : entry.step === step
                    ? 'flex size-[22px] shrink-0 items-center justify-center rounded-full bg-coral text-[11px] font-extrabold text-ink'
                    : 'flex size-[22px] shrink-0 items-center justify-center rounded-full bg-fill-muted text-[11px] font-bold text-text-3'
              }
            >
              {entry.step < step ? <Check className="size-3" strokeWidth={3} /> : entry.step}
            </span>
            {entry.label}
          </button>
        ))}

        <p className="mt-3 rounded-[12px] border border-blue-200 bg-blue-50 p-3 text-micro leading-relaxed text-blue-700">
          Tu peux quitter à tout moment : le brouillon est conservé et reprend exactement à cette
          étape.
        </p>
      </Surface>

      <div className="min-w-0 flex-1">
        <Surface variant="panel" padding="none" className="flex flex-col gap-5 p-4 sm:p-6">
          {error ? (
            <Alert tone="danger" title="Enregistrement impossible">
              {error}
            </Alert>
          ) : null}

          {/* Visible sur toutes les étapes sauf la dernière, qui affiche déjà
              la même liste : un brouillon rempli sur plusieurs jours doit
              pouvoir dire ce qu'il manque sans attendre une tentative de
              publication ratée. */}
          {isFreshDraft && step === 1 ? (
            <Alert tone="info" title="Ton brouillon est créé">
              Huit étapes, cinq minutes. Chaque étape s’enregistre : tu peux fermer l’onglet et
              revenir, l’assistant reprend là où tu t’es arrêté. Une description, une date, la ville
              et une catégorie de billet suffisent pour publier — le reste peut attendre.
            </Alert>
          ) : null}

          {!isPublished && step !== 8 && missing && missing.length > 0 ? (
            <Alert tone="warning" title="Avant de publier, il restera à compléter">
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {step === 1 ? (
            <GeneralStep event={event} categories={categories} onSave={save} pending={pending} />
          ) : null}
          {step === 2 ? <ScheduleStep event={event} onSave={save} pending={pending} /> : null}
          {step === 3 ? (
            <LocationStep
              event={event}
              cities={cities}
              onSave={save}
              pending={pending}
              maps={maps}
            />
          ) : null}
          {step === 4 ? <MediaStep event={event} onSave={save} pending={pending} /> : null}
          {step === 5 ? (
            <TicketsStep
              organizationId={organizationId}
              event={event}
              onChanged={() => router.refresh()}
            />
          ) : null}
          {step === 6 ? <SettingsStep event={event} onSave={save} pending={pending} /> : null}
          {step === 7 ? <PreviewStep event={event} onEdit={setStep} /> : null}
          {step === 8 ? (
            <PublishStep
              organizationId={organizationId}
              event={event}
              missing={missing}
              onPublish={async () => {
                setPending(true);
                setError(null);

                const result = await publishEventAction(organizationId, event.id);
                setPending(false);

                if (!result.ok) {
                  setError(result.message);
                  return;
                }

                setMissing(result.data.missing);
                router.refresh();
                // La publication a réussi côté serveur, mais rien ne le disait
                // à l'écran jusqu'ici : `router.refresh()` relit bien l'état
                // (le bouton passe à « Déjà publié »), mais silencieusement —
                // ça tournait, puis plus rien, sans confirmation ni retour à
                // la liste. La modale porte les deux.
                setShowPublishSuccess(true);
              }}
              pending={pending}
              published={isPublished}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
            <Button
              variant="secondary"
              size="mobile"
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
            >
              ← Précédent
            </Button>

            <span className="order-last w-full text-micro text-text-3 sm:order-none sm:w-auto sm:flex-1">
              {saved ? `Brouillon enregistré à ${saved}` : 'Chaque étape s’enregistre séparément'}
            </span>

            <Button
              variant={stepHasForm ? 'secondary' : 'ink'}
              size="mobile"
              disabled={step === 8}
              onClick={() => setStep((current) => Math.min(8, current + 1))}
            >
              {stepHasForm ? 'Passer sans enregistrer →' : 'Continuer →'}
            </Button>
          </div>
        </Surface>
      </div>

      <SuccessDialog
        open={showPublishSuccess}
        onOpenChange={setShowPublishSuccess}
        title="Événement publié"
        description="Il est désormais visible dans la découverte, et la billetterie est ouverte."
      >
        <Button
          variant="primary"
          size="mobile"
          block
          onClick={() => router.push('/pro/evenements')}
        >
          Voir mes événements →
        </Button>
      </SuccessDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type SaveFn = (payload: Record<string, unknown>, nextStep?: number) => Promise<boolean>;

/** Numéro de chaque étape, par sa clé : `STEP.schedule` plutôt qu'un 2 à deviner. */
const STEP = Object.fromEntries(
  EVENT_WIZARD_STEPS.map((entry) => [entry.key, entry.step]),
) as Record<(typeof EVENT_WIZARD_STEPS)[number]['key'], number>;

/** « Abomey-Calavi », « Abomey Calavi » et « abomey calavi » sont la même ville. */
function normalizeCityName(name: string): string {
  return (
    name
      .normalize('NFD')
      // Retire les accents décomposés par NFD : « é » → « e » + accent → « e ».
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-h2 font-bold">{title}</h2>
      <p className="text-body text-text-2">{hint}</p>
    </div>
  );
}

function GeneralStep({
  event,
  categories,
  onSave,
  pending,
}: {
  event: EventDetail;
  categories: Category[];
  onSave: SaveFn;
  pending: boolean;
}) {
  const [title, setTitle] = React.useState(event.title);

  return (
    <form
      className="flex flex-col gap-4"
      action={async (formData) => {
        await onSave(
          {
            general: {
              title: String(formData.get('title')),
              subtitle: emptyToUndefined(formData.get('subtitle')),
              description: emptyToUndefined(formData.get('description')),
              categoryId: String(formData.get('categoryId')),
            },
          },
          STEP.schedule,
        );
      }}
    >
      <StepHeading
        title="De quoi s’agit-il ?"
        hint="Le titre et la catégorie déterminent où ton événement apparaîtra dans la découverte."
      />

      <Field
        label="Titre de l’événement"
        htmlFor="title"
        help={`${title.length} / ${EVENT_TITLE_MAX_LENGTH} caractères · évite les majuscules complètes, elles sont tronquées sur mobile`}
      >
        <Input
          id="title"
          name="title"
          required
          maxLength={EVENT_TITLE_MAX_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-[17px] font-semibold"
        />
      </Field>

      <Field label="Sous-titre" hint="· facultatif" htmlFor="subtitle">
        <Input id="subtitle" name="subtitle" defaultValue={event.subtitle ?? ''} />
      </Field>

      <Field label="Catégorie" htmlFor="categoryId">
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={categories.find((c) => c.name === event.categoryName)?.id}
          className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-[14px]"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={6}
          defaultValue={event.description ?? ''}
          placeholder="Programme, artistes, informations pratiques…"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="mobile"
        loading={pending}
        loadingLabel="Enregistrement…"
      >
        Enregistrer et continuer →
      </Button>
    </form>
  );
}

function ScheduleStep({
  event,
  onSave,
  pending,
}: {
  event: EventDetail;
  onSave: SaveFn;
  pending: boolean;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      action={async (formData) => {
        const startsAt = toIso(formData.get('startsAt'));
        const endsAt = toIso(formData.get('endsAt'));
        const doorsOpenAt = toIso(formData.get('doorsOpenAt'));

        if (!startsAt || !endsAt) return;

        await onSave({ schedule: { startsAt, endsAt, doorsOpenAt } }, STEP.location);
      }}
    >
      <StepHeading title="Quand ?" hint="La date apparaît sur la carte, le billet et le rappel." />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début" htmlFor="startsAt">
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toLocalInput(event.startsAt)}
          />
        </Field>

        <Field label="Fin" htmlFor="endsAt">
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={toLocalInput(event.endsAt)}
          />
        </Field>

        <Field
          label="Ouverture des portes"
          hint="· facultatif"
          help="Figure sur le billet."
          htmlFor="doorsOpenAt"
        >
          <Input
            id="doorsOpenAt"
            name="doorsOpenAt"
            type="datetime-local"
            defaultValue={event.doorsOpenAt ? toLocalInput(event.doorsOpenAt) : ''}
          />
        </Field>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="mobile"
        loading={pending}
        loadingLabel="Enregistrement…"
      >
        Enregistrer et continuer →
      </Button>
    </form>
  );
}

/**
 * Barre d'étapes des petits écrans : huit pastilles qui défilent, l'étape
 * courante toujours ramenée dans le champ. Le même état que la colonne, dans
 * une forme qui ne pousse pas le formulaire hors de l'écran.
 */
function MobileStepper({ step, onSelect }: { step: number; onSelect: (step: number) => void }) {
  const activeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [step]);

  const current = EVENT_WIZARD_STEPS.find((entry) => entry.step === step);

  return (
    <div className="flex flex-col gap-2 lg:hidden">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow text-text-3">Étape {step} sur 8</p>
        <p className="text-body-s font-semibold text-text-strong">{current?.label}</p>
      </div>
      <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {EVENT_WIZARD_STEPS.map((entry) => {
          const done = entry.step < step;
          const active = entry.step === step;

          return (
            <li key={entry.key} className="shrink-0">
              <button
                ref={active ? activeRef : undefined}
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => onSelect(entry.step)}
                className={
                  active
                    ? 'flex min-h-[40px] items-center gap-2 rounded-full bg-ink pl-1.5 pr-3.5 text-body-s font-bold text-white'
                    : done
                      ? 'flex min-h-[40px] items-center gap-2 rounded-full border border-mint-200 bg-mint-50 pl-1.5 pr-3.5 text-body-s font-semibold text-mint-700'
                      : 'flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-surface pl-1.5 pr-3.5 text-body-s font-semibold text-text-2'
                }
              >
                <span
                  className={
                    active
                      ? 'flex size-[26px] items-center justify-center rounded-full bg-coral text-[11px] font-extrabold text-ink'
                      : done
                        ? 'flex size-[26px] items-center justify-center rounded-full bg-mint text-white'
                        : 'flex size-[26px] items-center justify-center rounded-full bg-fill-muted text-[11px] font-bold text-text-3'
                  }
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : entry.step}
                </span>
                {entry.label}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LocationStep({
  event,
  cities,
  onSave,
  pending,
  maps,
}: {
  event: EventDetail;
  cities: City[];
  onSave: SaveFn;
  pending: boolean;
  maps: MapsConfig;
}) {
  const [format, setFormat] = React.useState(event.format);

  /**
   * Les champs du lieu sont contrôlés : la recherche Google les remplit d'un
   * coup, et l'organisateur peut ensuite les ajuster. Les coordonnées, elles,
   * se VOIENT : l'épingle sur la carte est la seule preuve que l'événement
   * apparaîtra au bon endroit chez les participants.
   */
  const [venueName, setVenueName] = React.useState(event.venueName ?? '');
  const [address, setAddress] = React.useState(event.address ?? '');
  const [cityId, setCityId] = React.useState(
    cities.find((c) => c.name === event.cityName)?.id ?? '',
  );
  const [coordinates, setCoordinates] = React.useState<LatLngLiteral | null>(
    event.latitude !== null && event.longitude !== null
      ? { lat: event.latitude, lng: event.longitude }
      : null,
  );
  const [googlePlaceId, setGooglePlaceId] = React.useState('');
  const [selectedPlace, setSelectedPlace] = React.useState<PlaceDetails | null>(
    event.venueName && event.latitude !== null && event.longitude !== null
      ? {
          placeId: '',
          name: event.venueName,
          address: event.address,
          latitude: event.latitude,
          longitude: event.longitude,
          cityName: event.cityName,
        }
      : null,
  );
  const [approximate, setApproximate] = React.useState(false);
  const [geocoding, setGeocoding] = React.useState(false);
  const [geocodeError, setGeocodeError] = React.useState<string | null>(null);
  // Vrai quand l'organisateur a demandé à placer l'épingle lui-même, sans
  // adresse localisable : la carte s'ouvre sur la ville choisie.
  const [manualPin, setManualPin] = React.useState(false);

  const cityName = cities.find((c) => c.id === cityId)?.name ?? '';
  const showPicker = coordinates !== null || manualPin;

  /** « Abomey Calavi » chez Google, « Abomey-Calavi » chez nous. */
  function matchCity(name: string | null | undefined) {
    const wanted = name ? normalizeCityName(name) : '';
    return wanted ? cities.find((c) => normalizeCityName(c.name) === wanted) : undefined;
  }

  async function geocode() {
    const query = [venueName, address, cityName, 'Bénin'].filter(Boolean).join(', ');
    if (query.length < 3) return;

    setGeocoding(true);
    setGeocodeError(null);

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/pro/places/geocode?${params.toString()}`);

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'Cette adresse n’a pas pu être localisée.');
      }

      const result = (await response.json()) as GeocodeResult;
      setCoordinates({ lat: result.latitude, lng: result.longitude });
      setApproximate(result.approximate);
      setGooglePlaceId('');
      setManualPin(false);

      const match = matchCity(result.cityName);
      if (match && !cityId) setCityId(match.id);
    } catch (cause) {
      setGeocodeError(
        cause instanceof Error ? cause.message : 'Cette adresse n’a pas pu être localisée.',
      );
    } finally {
      setGeocoding(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      action={async (formData) => {
        await onSave(
          {
            location: {
              format,
              venueName: emptyToUndefined(formData.get('venueName')),
              address: emptyToUndefined(formData.get('address')),
              cityId: emptyToUndefined(formData.get('cityId')),
              ...(coordinates
                ? {
                    latitude: coordinates.lat,
                    longitude: coordinates.lng,
                    ...(googlePlaceId ? { googlePlaceId } : {}),
                  }
                : {}),
              onlineUrl: emptyToUndefined(formData.get('onlineUrl')),
              onlinePlatform: emptyToUndefined(formData.get('onlinePlatform')),
            },
          },
          STEP.media,
        );
      }}
    >
      <StepHeading
        title="Où ?"
        hint="Le lieu conditionne le filtrage par ville, et l’épingle sur la carte des participants."
      />

      <div className="flex gap-1.5 rounded-field bg-paper p-1">
        {(['PHYSICAL', 'ONLINE', 'HYBRID'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFormat(value)}
            className={
              format === value
                ? 'min-h-[40px] flex-1 rounded-[8px] bg-ink px-3 py-2 text-body-s font-bold text-white'
                : 'min-h-[40px] flex-1 rounded-[8px] px-3 py-2 text-body-s font-semibold text-text-2'
            }
          >
            {value === 'PHYSICAL' ? 'Sur place' : value === 'ONLINE' ? 'En ligne' : 'Les deux'}
          </button>
        ))}
      </div>

      {format !== 'ONLINE' ? (
        <>
          <PlaceSearch
            disabled={pending}
            label={selectedPlace ? 'Chercher un autre lieu' : 'Rechercher le lieu'}
            selected={selectedPlace}
            onClear={() => {
              setSelectedPlace(null);
              setVenueName('');
              setAddress('');
              setCoordinates(null);
              setGooglePlaceId('');
              setApproximate(false);
              setManualPin(false);
            }}
            onSelect={(place) => {
              setSelectedPlace(place);
              setVenueName(place.name);
              setAddress(place.address ?? '');
              setCoordinates({ lat: place.latitude, lng: place.longitude });
              setGooglePlaceId(place.placeId);
              setApproximate(false);
              setGeocodeError(null);
              setManualPin(false);

              // La ville de Google rapprochée de nos villes de lancement, par
              // le nom. Sans correspondance, le choix reste à l'organisateur.
              const match = matchCity(place.cityName);
              if (match) setCityId(match.id);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du lieu" htmlFor="venueName" className="sm:col-span-2">
              <Input
                id="venueName"
                name="venueName"
                value={venueName}
                onChange={(e) => {
                  setVenueName(e.target.value);
                  // Un autre nom, c'est peut-être un autre lieu : la fiche
                  // Google ne vaut plus, l'épingle reste visible pour être
                  // vérifiée — ou replacée.
                  setSelectedPlace(null);
                  setGooglePlaceId('');
                }}
                placeholder="Plage de Fidjrossè"
              />
            </Field>

            <Field label="Adresse" hint="· facultatif" htmlFor="address">
              <Input
                id="address"
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Quartier, rue, repère"
              />
            </Field>

            <Field label="Ville" htmlFor="cityId">
              <select
                id="cityId"
                name="cityId"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-[14px]"
              >
                <option value="">Choisir…</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <section className="flex flex-col gap-3 rounded-card border border-border bg-surface-alt p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="flex items-center gap-2 text-body font-bold">
                  <MapPin className="size-4 text-coral" aria-hidden />
                  Position sur la carte
                </h3>
                <p className="text-body-s text-text-2">
                  {coordinates
                    ? 'C’est ici que les participants trouveront l’événement. Déplace la carte si l’épingle n’est pas au bon endroit.'
                    : 'Sans position, l’événement n’apparaît pas sur la carte des participants.'}
                </p>
              </div>

              {venueName.trim().length >= 3 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  loading={geocoding}
                  loadingLabel="Localisation…"
                  disabled={pending}
                  onClick={() => void geocode()}
                >
                  <LocateFixed className="size-4" aria-hidden />
                  {coordinates ? 'Relocaliser depuis l’adresse' : 'Localiser cette adresse'}
                </Button>
              ) : null}
            </div>

            {geocodeError ? (
              <Alert tone="warning" title="Adresse introuvable">
                {geocodeError}
              </Alert>
            ) : null}

            {showPicker ? (
              <LocationPicker
                apiKey={maps.apiKey}
                nonce={maps.nonce}
                value={coordinates}
                approximate={approximate}
                disabled={pending}
                onChange={(next) => {
                  setCoordinates(next);
                  // Une épingle déplacée n'est plus la fiche Google : les
                  // coordonnées sont celles de l'organisateur, et elles priment.
                  setGooglePlaceId('');
                  setApproximate(false);
                }}
              />
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-border-field bg-surface p-4 sm:flex-row sm:items-center">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-fill-neutral text-text-3">
                  <Crosshair className="size-5" aria-hidden />
                </span>
                <p className="flex-1 text-body-s text-text-2">
                  Choisis un lieu dans la recherche, localise l’adresse saisie, ou place l’épingle
                  toi-même sur la carte.
                </p>
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  disabled={pending || !maps.apiKey}
                  onClick={() => setManualPin(true)}
                >
                  Placer l’épingle à la main
                </Button>
              </div>
            )}
          </section>
        </>
      ) : null}

      {format !== 'PHYSICAL' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Lien de connexion" htmlFor="onlineUrl">
            <Input id="onlineUrl" name="onlineUrl" type="url" placeholder="https://…" />
          </Field>

          <Field label="Plateforme" hint="· facultatif" htmlFor="onlinePlatform">
            <Input
              id="onlinePlatform"
              name="onlinePlatform"
              defaultValue={event.onlinePlatform ?? ''}
              placeholder="Zoom, YouTube, Google Meet…"
            />
          </Field>
        </div>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="mobile"
        loading={pending}
        loadingLabel="Enregistrement…"
      >
        Enregistrer et continuer →
      </Button>
    </form>
  );
}

function MediaStep({
  event,
  onSave,
  pending,
}: {
  event: EventDetail;
  onSave: SaveFn;
  pending: boolean;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState(event.coverImageUrl);

  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        title="Visuels"
        hint="Photo réelle, cadrée large. Sans image, l’événement reçoit une plaque colorée dérivée de sa catégorie — jamais un rectangle gris."
      />

      {uploadError ? (
        <Alert tone="danger" title="Dépôt impossible">
          {uploadError}
        </Alert>
      ) : null}

      {preview ? (
        <div className="overflow-hidden rounded-card border border-border">
          {/* Aperçu du visuel déposé. */}
          <img src={preview} alt="" className="aspect-video w-full object-cover" />
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center gap-3.5 rounded-card border-[1.5px] border-dashed border-border-field bg-surface-alt p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-coral-50 text-[18px] text-coral">
          ↑
        </span>
        <span className="flex-1">
          <span className="block text-body font-semibold">Image de couverture</span>
          <span className="block text-[12px] text-text-2">
            JPG ou PNG · 1600×900 minimum · convertie automatiquement en AVIF
          </span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          disabled={uploading}
          onChange={async (changeEvent) => {
            const file = changeEvent.target.files?.[0];
            if (!file) return;

            setUploading(true);
            setUploadError(null);

            const body = new FormData();
            body.append('file', file);

            const response = await fetch(`/api/media/event-cover?eventId=${event.id}`, {
              method: 'POST',
              body,
            });

            setUploading(false);

            if (!response.ok) {
              const payload: unknown = await response.json().catch(() => null);
              setUploadError(
                (payload as { message?: string } | null)?.message ?? 'Dépôt impossible.',
              );
              return;
            }

            const { url } = (await response.json()) as { url: string };
            setPreview(url);
            await onSave({ coverImageUrl: url });
          }}
        />
        <span className="rounded-button border border-border-field bg-surface px-3.5 py-2 text-body-s font-semibold">
          {uploading ? 'Envoi…' : 'Parcourir'}
        </span>
      </label>

      <Button
        variant="secondary"
        size="mobile"
        disabled={pending || !preview}
        onClick={() => {
          setPreview(null);
          void onSave({ coverImageUrl: null });
        }}
      >
        Retirer l’image
      </Button>

      <FloorPlans event={event} onSave={onSave} pending={pending} />
    </div>
  );
}

/**
 * Plans du lieu — facultatifs.
 *
 * ── Ce que c'est, et ce que ce n'est pas ────────────────────────────────────
 * Le plan des stands d'un festival, la disposition d'une salle, les entrées
 * d'un stade : ce qu'un participant regarde pour se repérer une fois sur
 * place. Ce n'est pas une galerie photo. Une conférence n'en a pas, et c'est
 * normal : la page publique dira « aucun plan disponible ».
 *
 * Jusqu'à cinq plans, dans l'ordre de dépôt. Chaque dépôt enregistre aussitôt.
 */
function FloorPlans({
  event,
  onSave,
  pending,
}: {
  event: EventDetail;
  onSave: SaveFn;
  pending: boolean;
}) {
  const [plans, setPlans] = React.useState<string[]>(event.floorPlanUrls);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function persist(next: string[]) {
    setPlans(next);
    await onSave({ floorPlanUrls: next });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-bold">
          Plan du lieu <span className="font-normal text-text-3">· facultatif</span>
        </h3>
        <p className="text-[12px] text-text-2">
          Stands, scènes, entrées : ce que les participants regardent pour se repérer sur place.
          Affiché tel quel, sans recadrage.
        </p>
      </div>

      {error ? (
        <Alert tone="danger" title="Dépôt impossible">
          {error}
        </Alert>
      ) : null}

      {plans.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((url, index) => (
            <li
              key={url}
              className="flex flex-col gap-2 overflow-hidden rounded-card border border-border"
            >
              <img src={url} alt={`Plan ${index + 1}`} className="w-full bg-paper object-contain" />
              <button
                type="button"
                disabled={pending}
                onClick={() => void persist(plans.filter((entry) => entry !== url))}
                className="px-3 pb-2.5 text-left text-body-s font-semibold text-text-2 hover:text-red"
              >
                Retirer ce plan
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {plans.length < 5 ? (
        <label className="flex cursor-pointer items-center gap-3.5 rounded-card border-[1.5px] border-dashed border-border-field bg-surface-alt p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-coral-50 text-[18px] text-coral">
            ↑
          </span>
          <span className="flex-1">
            <span className="block text-body font-semibold">
              {plans.length === 0 ? 'Ajouter un plan' : 'Ajouter un autre plan'}
            </span>
            <span className="block text-[12px] text-text-2">
              JPG, PNG ou WebP · 8 Mo au plus · {5 - plans.length} restant
              {5 - plans.length > 1 ? 's' : ''}
            </span>
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="hidden"
            disabled={uploading || pending}
            onChange={async (changeEvent) => {
              const file = changeEvent.target.files?.[0];
              if (!file) return;

              setUploading(true);
              setError(null);

              const body = new FormData();
              body.append('file', file);

              const response = await fetch(`/api/media/event-floor-plan?eventId=${event.id}`, {
                method: 'POST',
                body,
              });

              setUploading(false);
              changeEvent.target.value = '';

              if (!response.ok) {
                const payload: unknown = await response.json().catch(() => null);
                setError((payload as { message?: string } | null)?.message ?? 'Dépôt impossible.');
                return;
              }

              const { url } = (await response.json()) as { url: string };
              await persist([...plans, url]);
            }}
          />
          <span className="rounded-button border border-border-field bg-surface px-3.5 py-2 text-body-s font-semibold">
            {uploading ? 'Envoi…' : 'Parcourir'}
          </span>
        </label>
      ) : null}
    </section>
  );
}

function TicketsStep({
  organizationId,
  event,
  onChanged,
}: {
  organizationId: string;
  event: EventDetail;
  onChanged: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [price, setPrice] = React.useState<number | null>(5_000);
  const [editing, setEditing] = React.useState<EventDetail['ticketTypes'][number] | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        title="Billets"
        hint="Crée une catégorie par tarif. Un prix à 0 rend l’inscription gratuite."
      />

      {error ? (
        <Alert tone="danger" title="Action impossible">
          {error}
        </Alert>
      ) : null}

      {event.ticketTypes.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-border">
          {event.ticketTypes.map((ticket) => (
            <li
              key={ticket.id}
              className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0"
            >
              <div className="min-w-[160px] flex-1">
                <div className="text-body font-semibold">{ticket.name}</div>
                <div className="text-micro text-text-3">
                  {ticket.quantitySold} vendus · {ticket.remaining} restants
                </div>
              </div>

              {ticket.price === 0 ? (
                <Badge tone="accent">Gratuit</Badge>
              ) : (
                <Money amount={ticket.price} size="small" />
              )}

              <Badge tone={ticket.available ? 'success' : 'neutral'}>
                {ticket.availabilityLabel}
              </Badge>

              <button
                type="button"
                onClick={() => setEditing(ticket)}
                className="text-body-s font-semibold text-text-2 hover:text-text-strong"
              >
                Modifier
              </button>

              <button
                type="button"
                disabled={ticket.quantitySold > 0}
                title={
                  ticket.quantitySold > 0
                    ? 'Des billets ont été vendus : cette catégorie peut être clôturée, pas supprimée.'
                    : undefined
                }
                onClick={async () => {
                  setError(null);
                  const result = await removeTicketTypeAction(organizationId, event.id, ticket.id);
                  if (!result.ok) setError(result.message);
                  else onChanged();
                }}
                className="text-body-s font-semibold text-text-3 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] bg-paper p-3.5 text-body text-text-2">
          Aucune catégorie pour l’instant. Il en faut au moins une pour publier.
        </p>
      )}

      <form
        className="flex flex-col gap-3.5 border-t border-border-subtle pt-4"
        action={async (formData) => {
          setPending(true);
          setError(null);

          const result = await addTicketTypeAction(organizationId, event.id, {
            name: String(formData.get('name')),
            description: emptyToUndefined(formData.get('description')),
            price: price ?? 0,
            quantityTotal: Number(formData.get('quantityTotal')),
            minPerOrder: 1,
            maxPerOrder: Number(formData.get('maxPerOrder')) || undefined,
          });

          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          onChanged();
        }}
      >
        <p className="eyebrow text-text-3">Nouvelle catégorie</p>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Nom" htmlFor="name">
            <Input id="name" name="name" required placeholder="Pass 1 jour · Standard" />
          </Field>

          <Field label="Prix" help="0 pour une inscription gratuite" htmlFor="price">
            <MoneyInput id="price" value={price} onValueChange={setPrice} />
          </Field>

          <Field label="Nombre de places" htmlFor="quantityTotal">
            <Input
              id="quantityTotal"
              name="quantityTotal"
              type="number"
              min={1}
              required
              defaultValue={100}
            />
          </Field>

          <Field label="Maximum par commande" hint="· facultatif" htmlFor="maxPerOrder">
            <Input id="maxPerOrder" name="maxPerOrder" type="number" min={1} max={50} />
          </Field>

          <Field
            label="Avantages inclus"
            hint="· facultatif"
            htmlFor="description"
            className="sm:col-span-2"
          >
            <Input
              id="description"
              name="description"
              placeholder="Accès aux deux scènes, boisson offerte"
            />
          </Field>
        </div>

        <Button type="submit" variant="ink" size="mobile" loading={pending} loadingLabel="Ajout…">
          Ajouter la catégorie
        </Button>
      </form>

      {editing ? (
        <EditTicketTypeDialog
          organizationId={organizationId}
          eventId={event.id}
          ticket={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Édition d'un type de billet.
 *
 * `PATCH .../ticket-types/:id` existait déjà côté API — l'assistant ne
 * proposait jusqu'ici que créer et supprimer. Tous les champs sont renvoyés à
 * chaque enregistrement : la route attend l'objet complet, pas une différence
 * (elle recalcule aussi la contrainte « le quota ne descend pas sous ce qui
 * est déjà vendu »).
 */
function EditTicketTypeDialog({
  organizationId,
  eventId,
  ticket,
  onClose,
  onSaved,
}: {
  organizationId: string;
  eventId: string;
  ticket: EventDetail['ticketTypes'][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [price, setPrice] = React.useState<number | null>(ticket.price);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Modifier la catégorie"
      description={
        ticket.quantitySold > 0
          ? `${ticket.quantitySold} billet(s) déjà vendu(s) : le nombre de places ne peut pas descendre en dessous.`
          : undefined
      }
    >
      {error ? (
        <Alert tone="danger" title="Enregistrement impossible">
          {error}
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-3.5"
        action={async (formData) => {
          setPending(true);
          setError(null);

          const result = await updateTicketTypeAction(organizationId, eventId, ticket.id, {
            name: String(formData.get('name')),
            description: emptyToUndefined(formData.get('description')),
            price: price ?? 0,
            quantityTotal: Number(formData.get('quantityTotal')),
            minPerOrder: ticket.minPerOrder,
            maxPerOrder: Number(formData.get('maxPerOrder')) || undefined,
          });

          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          onSaved();
        }}
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Nom" htmlFor="edit-name">
            <Input id="edit-name" name="name" required defaultValue={ticket.name} />
          </Field>

          <Field label="Prix" help="0 pour une inscription gratuite" htmlFor="edit-price">
            <MoneyInput id="edit-price" value={price} onValueChange={setPrice} />
          </Field>

          <Field label="Nombre de places" htmlFor="edit-quantityTotal">
            <Input
              id="edit-quantityTotal"
              name="quantityTotal"
              type="number"
              min={ticket.quantitySold}
              required
              defaultValue={ticket.quantityTotal}
            />
          </Field>

          <Field label="Maximum par commande" hint="· facultatif" htmlFor="edit-maxPerOrder">
            <Input
              id="edit-maxPerOrder"
              name="maxPerOrder"
              type="number"
              min={1}
              max={50}
              defaultValue={ticket.maxPerOrder ?? undefined}
            />
          </Field>

          <Field
            label="Avantages inclus"
            hint="· facultatif"
            htmlFor="edit-description"
            className="sm:col-span-2"
          >
            <Input
              id="edit-description"
              name="description"
              defaultValue={ticket.description ?? ''}
            />
          </Field>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" size="mobile" onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="ink"
            size="mobile"
            loading={pending}
            loadingLabel="Enregistrement…"
          >
            Enregistrer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SettingsStep({
  event,
  onSave,
  pending,
}: {
  event: EventDetail;
  onSave: SaveFn;
  pending: boolean;
}) {
  const [refundPolicy, setRefundPolicy] = React.useState(event.refundPolicy);

  return (
    <form
      className="flex flex-col gap-4"
      action={async (formData) => {
        await onSave(
          {
            settings: {
              visibility: String(formData.get('visibility')),
              refundPolicy,
              refundDeadlineDays: Number(formData.get('refundDeadlineDays')) || undefined,
              minimumAge: Number(formData.get('minimumAge')) || undefined,
              requiresAttendeeName: formData.get('requiresAttendeeName') === 'on',
              accessInstructions: emptyToUndefined(formData.get('accessInstructions')),
            },
          },
          STEP.preview,
        );
      }}
    >
      <StepHeading
        title="Paramètres"
        hint="Ces règles s’affichent telles quelles aux participants, dans la section « Bon à savoir »."
      />

      <Field label="Visibilité" htmlFor="visibility">
        <select
          id="visibility"
          name="visibility"
          defaultValue={event.visibility}
          className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-[14px]"
        >
          <option value="PUBLIC">Public · référencé dans la découverte</option>
          <option value="PRIVATE">Privé · accessible par lien uniquement</option>
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2.5 rounded-card border border-border p-4">
        <legend className="px-1 text-body font-bold">Politique de remboursement</legend>

        {(
          [
            [
              'UNTIL_DAYS_BEFORE',
              'Remboursement jusqu’à N jours avant',
              'Frais de service non remboursés · traitement automatique',
            ],
            [
              'NONE',
              'Aucun remboursement',
              'À afficher clairement : réduit la conversion de 8 à 12 %',
            ],
            [
              'CASE_BY_CASE',
              'Au cas par cas, sur demande',
              'Les demandes arrivent dans ton espace, à traiter en 72 h',
            ],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="refundPolicy"
              value={value}
              checked={refundPolicy === value}
              onChange={() => setRefundPolicy(value)}
              className="mt-1 accent-[var(--color-coral)]"
            />
            <span>
              <span className="block text-body font-semibold">{label}</span>
              <span className="block text-body-s text-text-2">{hint}</span>
            </span>
          </label>
        ))}

        {refundPolicy === 'UNTIL_DAYS_BEFORE' ? (
          <Field label="Jours avant l’événement" htmlFor="refundDeadlineDays">
            <Input
              id="refundDeadlineDays"
              name="refundDeadlineDays"
              type="number"
              min={0}
              max={90}
              defaultValue={event.refundDeadlineDays ?? 7}
            />
          </Field>
        ) : null}
      </fieldset>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Âge minimum" hint="· 0 pour tout public" htmlFor="minimumAge">
          <Input
            id="minimumAge"
            name="minimumAge"
            type="number"
            min={0}
            max={21}
            defaultValue={event.minimumAge ?? 0}
          />
        </Field>

        <label className="flex cursor-pointer items-center gap-2.5 self-end pb-2 text-body">
          <input
            type="checkbox"
            name="requiresAttendeeName"
            defaultChecked={event.requiresAttendeeName}
            className="size-[19px] accent-[var(--color-coral)]"
          />
          Nom requis par billet
        </label>
      </div>

      <Field
        label="Consignes affichées au participant"
        hint="· facultatif"
        htmlFor="accessInstructions"
      >
        <Input
          id="accessInstructions"
          name="accessInstructions"
          defaultValue={event.accessInstructions ?? ''}
          placeholder="Fouille à l’entrée · boissons extérieures interdites"
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="mobile"
        loading={pending}
        loadingLabel="Enregistrement…"
      >
        Enregistrer et continuer →
      </Button>
    </form>
  );
}

/**
 * Aperçu — la page publique, telle quelle, dans l'assistant.
 *
 * ── Ce que ce fichier a corrigé ────────────────────────────────────────────
 * L'étape s'appelait « Aperçu » et montrait un encart de quatre lignes.
 * L'organisateur ne voyait la vraie page qu'après publication — trop tard
 * pour corriger un visuel mal cadré ou une description tronquée. La page est
 * désormais rendue ici par le même composant que `/e/[slug]`, billetterie
 * désarmée, avec un accès à l'aperçu plein écran et un retour direct vers
 * l'étape à corriger.
 */
function PreviewStep({ event, onEdit }: { event: EventDetail; onEdit: (step: number) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <StepHeading
          title="Aperçu"
          hint="Exactement ce que verront les participants — vérifie, puis corrige l’étape concernée."
        />
        <Button asChild variant="secondary" size="compact">
          <Link href={`/pro/evenements/${event.id}/apercu`}>
            <ExternalLink className="size-4" aria-hidden />
            Aperçu plein écran
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            [STEP.general, 'Titre & description'],
            [STEP.schedule, 'Date'],
            [STEP.location, 'Lieu'],
            [STEP.media, 'Visuels'],
            [STEP.tickets, 'Billets'],
            [STEP.settings, 'Paramètres'],
          ] as const
        ).map(([target, label]) => (
          <button
            key={target}
            type="button"
            onClick={() => onEdit(target)}
            className="rounded-full border border-border-field bg-surface px-3 py-1.5 text-body-s font-semibold text-text-2 transition hover:bg-paper hover:text-text-strong"
          >
            Modifier · {label}
          </button>
        ))}
      </div>

      <div className="-mx-4 overflow-hidden border-y border-border bg-paper sm:mx-0 sm:rounded-card sm:border">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2 text-micro font-semibold text-text-2">
          <Eye className="size-3.5" aria-hidden />
          Aperçu · la billetterie est désactivée tant que l’événement n’est pas publié
        </div>
        <EventPageView event={event} mode="preview" />
      </div>
    </div>
  );
}

function PublishStep({
  organizationId,
  event,
  missing,
  onPublish,
  pending,
  published,
}: {
  organizationId: string;
  event: EventDetail;
  missing: string[] | null;
  onPublish: () => Promise<void>;
  pending: boolean;
  published: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepHeading
        title="Publier"
        hint="Une fois publié, l’événement est visible et la billetterie ouvre."
      />

      {missing && missing.length > 0 ? (
        <Alert tone="warning" title="Il reste des points à compléter">
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {published ? (
        <Alert tone="success" title="Événement publié">
          Il est visible sur nexakabi.bj/e/{event.slug}
        </Alert>
      ) : null}

      <Surface variant="ink" padding="comfortable" className="flex flex-col gap-3">
        <h3 className="text-[15px] font-bold">Ce qui se passe à la publication</h3>
        <p className="text-body-s leading-relaxed text-on-ink-2">
          Les catégories de billets passent en vente. Un organisateur vérifié qui a déjà publié met
          son événement en ligne immédiatement ; pour un premier événement, la plateforme vérifie
          d’abord, sous 2 heures ouvrées.
        </p>
        <p className="text-body-s leading-relaxed text-on-ink-2">
          Le <b className="text-white">retrait des fonds</b> reste bloqué tant que l’identité de
          l’organisation n’est pas vérifiée. On ne freine pas la vente, on sécurise l’argent.
        </p>
      </Surface>

      <Button
        variant="primary"
        size="primary"
        block
        loading={pending}
        loadingLabel="Publication…"
        disabled={published}
        onClick={() => void onPublish()}
      >
        {published ? 'Déjà publié' : 'Publier maintenant'}
      </Button>

      {published && event.status !== 'CANCELLED' && event.status !== 'COMPLETED' ? (
        <CancelEventZone organizationId={organizationId} event={event} />
      ) : null}
    </div>
  );
}

/**
 * Zone sensible — annulation d'un événement publié.
 *
 * `POST .../cancel` existait déjà côté API, notification aux détenteurs de
 * billets comprise (« tu seras remboursé »). Le design system mockait même
 * déjà cette confirmation dans sa page de démonstration, sans qu'aucun écran
 * réel ne la déclenche : c'était une fonctionnalité conçue, jamais branchée.
 */
function CancelEventZone({
  organizationId,
  event,
}: {
  organizationId: string;
  event: EventDetail;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <>
      <Surface
        variant="panel"
        padding="comfortable"
        className="flex flex-col gap-3 border-red-200 bg-red-50/40"
      >
        <h3 className="text-h3 font-bold text-red-700">Zone sensible</h3>
        <p className="text-body-s leading-relaxed text-text-2">
          Annuler prévient chaque détenteur de billet et déclenche son remboursement intégral, frais
          compris. Cette action est irréversible.
        </p>
        <Button
          type="button"
          variant="destructive"
          size="mobile"
          className="self-start"
          onClick={() => setOpen(true)}
        >
          Annuler l’événement
        </Button>
      </Surface>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Annuler cet événement ?"
        description={`« ${event.title} » sera marqué annulé et chaque détenteur de billet recevra un remboursement intégral, frais compris.`}
      >
        {error ? (
          <Alert tone="danger" title="Annulation impossible">
            {error}
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            size="mobile"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Revenir
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            size="mobile"
            loading={pending}
            loadingLabel="Annulation…"
            onClick={async () => {
              setPending(true);
              setError(null);

              const result = await cancelEventAction(organizationId, event.id);
              setPending(false);

              if (!result.ok) {
                setError(result.message);
                return;
              }

              setOpen(false);
              router.push('/pro/evenements');
              router.refresh();
            }}
          >
            Confirmer l’annulation
          </Button>
        </div>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim();
  return text === '' ? undefined : text;
}

/** `datetime-local` ne porte pas de fuseau : on le convertit en ISO complet. */
function toIso(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? '').trim();
  if (text === '') return undefined;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO → valeur d'un champ `datetime-local`, en heure locale. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
