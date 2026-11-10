'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Search } from 'lucide-react';
import {
  SPOTLIGHT_VIDEO_MAX_LABEL,
  SPOTLIGHT_VIDEO_MAX_SECONDS,
  SPOTLIGHT_VIDEO_TYPES,
  type NewsletterEvent,
  type SpotlightAdmin,
  type SpotlightAdminOverview,
  type SpotlightSource,
  type SpotlightVideo,
} from '@nexakabi/contracts';
import { formatMoney } from '@nexakabi/utils';
import {
  Alert,
  Badge,
  Button,
  Field,
  Input,
  Surface,
  UploadDropzone,
  type UploadPhase,
} from '@nexakabi/ui';
import { uploadSpotlightImage, uploadSpotlightVideo } from '@/lib/upload-client';
import { formatPortoNovo, fromLocalInput, toLocalInput } from './dates';

/** L'événement retenu, tel que le formulaire en a besoin. */
interface PickedEvent {
  id: string;
  title: string;
  startsAt: string;
  organizationName: string;
  cityName: string | null;
  coverImageUrl: string | null;
}

interface ExternalFields {
  title: string;
  organizerName: string;
  url: string;
  startsAt: string;
  endsAt: string;
  venueName: string;
  cityName: string;
  priceLabel: string;
  categoryLabel: string;
}

const ACCEPTED_IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/** Libellés des champs, pour dire en clair ce que l'API a refusé. */
const FIELD_LABELS: Record<string, string> = {
  eventId: 'Événement',
  'external.title': 'Titre',
  'external.organizerName': 'Organisateur',
  'external.url': 'Lien de la billetterie',
  'external.startsAt': 'Date de l’événement',
  'external.endsAt': 'Fin de l’événement',
  startsAt: 'Début de la mise en avant',
  endsAt: 'Fin de la mise en avant',
  imageUrl: 'Visuel',
  countryCode: 'Pays',
};

/**
 * Mettre un événement à la une, ou modifier une mise en avant.
 *
 * ── Deux sortes, un seul formulaire ─────────────────────────────────────────
 * Un événement de la plateforme se choisit dans la liste : titre, date, lieu,
 * prix et affiche viennent de lui. Un événement externe se décrit à la main,
 * avec le lien de sa billetterie officielle et un visuel — la une n'a rien
 * d'autre à montrer.
 *
 * Les dates se saisissent à l'heure de Porto-Novo, quel que soit le fuseau
 * de l'ordinateur.
 */
export function SpotlightForm({
  kind,
  initial,
  countries,
  showSponsoredLabel,
  nowIso,
}: {
  kind: 'EVENT' | 'EXTERNAL';
  initial: SpotlightAdmin | null;
  countries: SpotlightAdminOverview['countries'];
  showSponsoredLabel: boolean;
  /** L'instant du rendu serveur — la même valeur par défaut des deux côtés. */
  nowIso: string;
}) {
  const router = useRouter();
  const editing = initial !== null;

  const [event, setEvent] = React.useState<PickedEvent | null>(
    initial?.event
      ? {
          id: initial.event.id,
          title: initial.event.title,
          startsAt: initial.event.startsAt,
          organizationName: initial.event.organizationName,
          cityName: initial.event.cityName,
          coverImageUrl: initial.event.coverImageUrl,
        }
      : null,
  );

  const [external, setExternal] = React.useState<ExternalFields>(() => ({
    title: initial?.external?.title ?? '',
    organizerName: initial?.external?.organizerName ?? '',
    url: initial?.external?.url ?? '',
    startsAt: toLocalInput(initial?.external?.startsAt),
    endsAt: toLocalInput(initial?.external?.endsAt),
    venueName: initial?.external?.venueName ?? '',
    cityName: initial?.external?.cityName ?? '',
    priceLabel: initial?.external?.priceLabel ?? '',
    categoryLabel: initial?.external?.categoryLabel ?? '',
  }));

  const defaultCountry =
    initial?.countryCode ?? countries.find((country) => country.isDefault)?.code ?? 'BJ';

  const [countryCode, setCountryCode] = React.useState(defaultCountry);
  const [source, setSource] = React.useState<SpotlightSource>(initial?.source ?? 'EDITORIAL');
  const [startsAt, setStartsAt] = React.useState(toLocalInput(initial?.startsAt ?? nowIso));
  const [endsAt, setEndsAt] = React.useState(toLocalInput(initial?.endsAt));
  // La fin suit l'événement tant qu'on ne l'a pas réglée à la main.
  const [endsTouched, setEndsTouched] = React.useState(editing);

  const [imageUrl, setImageUrl] = React.useState<string | null>(initial?.imageUrl ?? null);
  const [uploadPhase, setUploadPhase] = React.useState<UploadPhase>('idle');
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const [video, setVideo] = React.useState<SpotlightVideo | null>(initial?.video ?? null);
  const [videoPhase, setVideoPhase] = React.useState<UploadPhase>('idle');
  const [videoProgress, setVideoProgress] = React.useState(0);
  const [videoError, setVideoError] = React.useState<string | null>(null);

  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; fields: string[] } | null>(null);

  const setExternalField = (key: keyof ExternalFields) => (value: string) => {
    setExternal((current) => ({ ...current, [key]: value }));
    if (key === 'startsAt' && !endsTouched) setEndsAt(value);
  };

  function pickEvent(picked: PickedEvent) {
    setEvent(picked);
    if (!endsTouched) setEndsAt(toLocalInput(picked.startsAt));
  }

  async function onSelectImage(file: File) {
    setUploadPhase('uploading');
    setUploadError(null);
    setFileName(file.name);

    const outcome = await uploadSpotlightImage(file, setUploadProgress);

    if (!outcome.ok) {
      setUploadPhase('error');
      setUploadError(outcome.message);
      return;
    }

    setImageUrl(outcome.data.url);
    setUploadPhase('done');
  }

  async function onSelectVideo(file: File) {
    setVideoPhase('uploading');
    setVideoError(null);
    setVideoProgress(0);

    const outcome = await uploadSpotlightVideo(file, setVideoProgress);

    if (!outcome.ok) {
      setVideoPhase('error');
      setVideoError(outcome.message);
      return;
    }

    setVideo(outcome.data);
    setVideoPhase('done');
  }

  const displayImage =
    imageUrl ??
    (kind === 'EVENT' ? (event?.coverImageUrl ?? null) : null) ??
    video?.posterUrl ??
    null;
  const previewTitle = kind === 'EVENT' ? (event?.title ?? 'Choisis un événement') : external.title;
  const previewDate =
    kind === 'EVENT'
      ? event
        ? formatPortoNovo(event.startsAt)
        : null
      : fromLocalInput(external.startsAt)
        ? formatPortoNovo(fromLocalInput(external.startsAt) as string)
        : null;

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);

    const start = fromLocalInput(startsAt);
    const end = fromLocalInput(endsAt);

    if (!start || !end) {
      setError({ message: 'Indique le début et la fin de la mise en avant.', fields: [] });
      return;
    }

    if (kind === 'EVENT' && !event) {
      setError({ message: 'Choisis l’événement à mettre à la une.', fields: [] });
      return;
    }

    if (kind === 'EXTERNAL' && !imageUrl) {
      setError({ message: 'Un événement externe a besoin de son visuel.', fields: [] });
      return;
    }

    const externalPayload =
      kind === 'EXTERNAL'
        ? {
            title: external.title,
            organizerName: external.organizerName,
            url: external.url,
            startsAt: fromLocalInput(external.startsAt),
            endsAt: fromLocalInput(external.endsAt),
            venueName: external.venueName || null,
            cityName: external.cityName || null,
            priceLabel: external.priceLabel || null,
            categoryLabel: external.categoryLabel || null,
          }
        : undefined;

    const common = { source, countryCode, startsAt: start, endsAt: end, imageUrl, video };

    const body = editing
      ? {
          ...common,
          ...(kind === 'EVENT' ? { eventId: event?.id } : { external: externalPayload }),
        }
      : kind === 'EVENT'
        ? { kind, eventId: event?.id, ...common }
        : { kind, external: externalPayload, ...common };

    setPending(true);

    try {
      const response = await fetch(
        editing
          ? `/api/admin/spotlights/${encodeURIComponent(initial.id)}`
          : '/api/admin/spotlights',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        fields?: Record<string, string[]>;
      } | null;

      if (!response.ok) {
        const fields = Object.entries(payload?.fields ?? {}).map(
          ([path, messages]) => `${FIELD_LABELS[path] ?? path} : ${messages.join(', ')}`,
        );
        setError({
          message: payload?.message ?? 'La mise en avant n’a pas pu être enregistrée.',
          fields,
        });
        return;
      }

      router.push('/a-la-une');
      router.refresh();
    } catch {
      setError({ message: 'L’API n’est pas joignable.', fields: [] });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(formEvent) => void submit(formEvent)} className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {kind === 'EVENT' ? (
            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
              <h2 className="text-h3 font-bold">Événement</h2>
              <EventChooser value={event} onChange={pickEvent} disabled={pending} />
            </Surface>
          ) : (
            <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-h3 font-bold">Événement externe</h2>
                <p className="text-body-s text-text-2">
                  Ses billets se vendent ailleurs. La une le dit, et le clic ouvre sa billetterie
                  officielle dans un nouvel onglet.
                </p>
              </div>

              <Field label="Titre" htmlFor="ext-title">
                <Input
                  id="ext-title"
                  required
                  minLength={3}
                  maxLength={80}
                  value={external.title}
                  onChange={(e) => setExternalField('title')(e.target.value)}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Organisateur"
                  help="Celui qui vend les billets."
                  htmlFor="ext-organizer"
                >
                  <Input
                    id="ext-organizer"
                    required
                    minLength={2}
                    maxLength={120}
                    value={external.organizerName}
                    onChange={(e) => setExternalField('organizerName')(e.target.value)}
                  />
                </Field>
                <Field
                  label="Lien de la billetterie officielle"
                  help="En https uniquement."
                  htmlFor="ext-url"
                >
                  <Input
                    id="ext-url"
                    type="url"
                    required
                    pattern="https://.+"
                    placeholder="https://"
                    maxLength={500}
                    value={external.url}
                    onChange={(e) => setExternalField('url')(e.target.value)}
                  />
                </Field>
                <Field label="Début de l’événement" htmlFor="ext-starts">
                  <Input
                    id="ext-starts"
                    type="datetime-local"
                    required
                    value={external.startsAt}
                    onChange={(e) => setExternalField('startsAt')(e.target.value)}
                  />
                </Field>
                <Field label="Fin de l’événement" hint="· facultatif" htmlFor="ext-ends">
                  <Input
                    id="ext-ends"
                    type="datetime-local"
                    value={external.endsAt}
                    onChange={(e) => setExternalField('endsAt')(e.target.value)}
                  />
                </Field>
                <Field label="Lieu" hint="· facultatif" htmlFor="ext-venue">
                  <Input
                    id="ext-venue"
                    maxLength={120}
                    value={external.venueName}
                    onChange={(e) => setExternalField('venueName')(e.target.value)}
                  />
                </Field>
                <Field label="Ville" hint="· facultatif" htmlFor="ext-city">
                  <Input
                    id="ext-city"
                    maxLength={80}
                    value={external.cityName}
                    onChange={(e) => setExternalField('cityName')(e.target.value)}
                  />
                </Field>
                <Field
                  label="Prix affiché"
                  hint="· facultatif"
                  help="« Dès 10 000 F », « Prix sur le site officiel »."
                  htmlFor="ext-price"
                >
                  <Input
                    id="ext-price"
                    maxLength={60}
                    value={external.priceLabel}
                    onChange={(e) => setExternalField('priceLabel')(e.target.value)}
                  />
                </Field>
                <Field
                  label="Catégorie affichée"
                  hint="· facultatif"
                  help="« Festival », « Concert »."
                  htmlFor="ext-category"
                >
                  <Input
                    id="ext-category"
                    maxLength={40}
                    value={external.categoryLabel}
                    onChange={(e) => setExternalField('categoryLabel')(e.target.value)}
                  />
                </Field>
              </div>
            </Surface>
          )}

          <Surface variant="panel" padding="comfortable" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 font-bold">Visuel</h2>
              <p className="text-body-s text-text-2">
                {kind === 'EVENT'
                  ? 'Par défaut, l’affiche de l’événement. Un visuel large le remplace sur la une seulement.'
                  : 'Obligatoire. Un visuel large, sans texte important sur les bords : il est recadré en 16:9.'}
              </p>
            </div>

            <UploadDropzone
              label={imageUrl ? 'Remplacer le visuel' : 'Déposer un visuel'}
              help="JPEG, PNG, WebP ou AVIF · 1600 × 900 idéalement"
              accept={ACCEPTED_IMAGES}
              phase={uploadPhase}
              progress={uploadProgress}
              fileName={fileName}
              error={uploadError}
              disabled={pending}
              onSelect={(file) => void onSelectImage(file)}
            />

            {imageUrl && kind === 'EVENT' ? (
              <div>
                <Button
                  type="button"
                  variant="tertiary"
                  size="compact"
                  onClick={() => {
                    setImageUrl(null);
                    setUploadPhase('idle');
                    setFileName(null);
                  }}
                >
                  Revenir à l’affiche de l’événement
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
              <p className="text-body-s font-semibold">Vidéo (facultatif)</p>
              <p className="text-micro text-text-3">
                Lue muette sur la diapositive affichée, seulement sur une bonne connexion. Coupée à{' '}
                {SPOTLIGHT_VIDEO_MAX_SECONDS} s ; le visuel reste l’affiche.
              </p>
              <UploadDropzone
                label={video ? 'Remplacer la vidéo' : 'Déposer une vidéo'}
                help={`MP4, MOV ou WebM · ${SPOTLIGHT_VIDEO_MAX_LABEL} au plus · 720p suffit`}
                accept={SPOTLIGHT_VIDEO_TYPES}
                phase={videoPhase}
                progress={videoProgress}
                error={videoError}
                disabled={pending}
                onSelect={(file) => void onSelectVideo(file)}
              />
              {video ? (
                <div className="flex flex-wrap items-center gap-2">
                  <video
                    src={video.url}
                    poster={video.posterUrl}
                    muted
                    playsInline
                    controls
                    className="h-24 rounded-[10px] bg-ink"
                  />
                  <Button
                    type="button"
                    variant="tertiary"
                    size="compact"
                    onClick={() => {
                      setVideo(null);
                      setVideoPhase('idle');
                    }}
                  >
                    Retirer la vidéo
                  </Button>
                </div>
              ) : null}
            </div>
          </Surface>

          <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-h3 font-bold">Diffusion</h2>
              <p className="text-body-s text-text-2">
                À l’heure de Porto-Novo. La une s’efface d’elle-même si l’événement est annulé,
                complet ou passé.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="À la une à partir du" htmlFor="spot-starts">
                <Input
                  id="spot-starts"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </Field>
              <Field
                label="Jusqu’au"
                help={endsTouched ? undefined : 'Par défaut : le début de l’événement.'}
                htmlFor="spot-ends"
              >
                <Input
                  id="spot-ends"
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => {
                    setEndsTouched(true);
                    setEndsAt(e.target.value);
                  }}
                />
              </Field>
              <Field label="Pays" help="La une de quel pays la montre." htmlFor="spot-country">
                <select
                  id="spot-country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-body-s"
                >
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.flag} {country.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body-s font-semibold">Origine</legend>
              <SourceOption
                checked={source === 'EDITORIAL'}
                onSelect={() => setSource('EDITORIAL')}
                label="Choix de l’équipe"
                hint="Aucune mention particulière."
              />
              <SourceOption
                checked={source === 'PAID'}
                onSelect={() => setSource('PAID')}
                label="Place payée"
                hint={
                  showSponsoredLabel
                    ? 'Par l’organisateur ou un partenaire. La une affiche « Sponsorisé ».'
                    : 'Par l’organisateur ou un partenaire. La mention « Sponsorisé » est coupée dans les réglages.'
                }
              />
            </fieldset>
          </Surface>
        </div>

        <aside className="flex flex-col gap-2 lg:sticky lg:top-6">
          <p className="text-micro font-bold uppercase tracking-wide text-text-3">Aperçu</p>
          <Preview
            imageUrl={displayImage}
            title={previewTitle || 'Titre de l’événement'}
            date={previewDate}
            external={kind === 'EXTERNAL'}
            sponsored={source === 'PAID' && showSponsoredLabel}
          />
          <p className="text-micro text-text-3">
            Sur le site, la diapositive occupe toute la largeur de la une.
          </p>
        </aside>
      </div>

      {error ? (
        <Alert tone="danger" title={error.message}>
          {error.fields.length > 0 ? (
            <ul className="list-disc pl-4">
              {error.fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="ink"
          loading={pending}
          disabled={uploadPhase === 'uploading'}
        >
          {editing ? 'Enregistrer' : 'Mettre à la une'}
        </Button>
        <Button asChild variant="tertiary">
          <Link href="/a-la-une">Annuler</Link>
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Un événement publié à venir, choisi par recherche — comme dans la newsletter. */
function EventChooser({
  value,
  onChange,
  disabled,
}: {
  value: PickedEvent | null;
  onChange: (event: PickedEvent) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(value === null);
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<NewsletterEvent[] | null>(null);

  React.useEffect(() => {
    if (!open) return;

    // Une requête par pause de frappe, pas par lettre.
    const timer = window.setTimeout(() => {
      const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';

      fetch(`/api/admin/spotlights/events${query}`)
        .then((response) => (response.ok ? (response.json() as Promise<NewsletterEvent[]>) : []))
        .then(setResults)
        .catch(() => setResults([]));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, search]);

  if (value && !open) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-s font-bold">{value.title}</span>
          <span className="truncate text-micro text-text-3">
            {[formatPortoNovo(value.startsAt), value.cityName, value.organizationName]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Changer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-3"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher un événement publié, ou un organisateur…"
          aria-label="Chercher un événement"
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {results === null ? (
        <p className="text-micro text-text-3">Recherche…</p>
      ) : results.length === 0 ? (
        <p className="text-micro text-text-3">Aucun événement publié à venir ne correspond.</p>
      ) : (
        <ul className="flex max-h-[300px] flex-col overflow-y-auto rounded-card border border-border-subtle">
          {results.map((result) => {
            const soldOut = result.status === 'SOLD_OUT';
            const price =
              result.fromPrice === null
                ? null
                : result.fromPrice === 0
                  ? 'Gratuit'
                  : `dès ${formatMoney(result.fromPrice, result.currency)}`;

            return (
              <li
                key={result.id}
                className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 last:border-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-s font-bold">{result.title}</span>
                  <span className="truncate text-micro text-text-3">
                    {[
                      formatPortoNovo(result.startsAt),
                      result.cityName,
                      result.organizationName,
                      price,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {soldOut ? (
                  <Badge tone="neutral">Complet</Badge>
                ) : (
                  <Button
                    type="button"
                    size="compact"
                    variant={value?.id === result.id ? 'ink' : 'secondary'}
                    disabled={disabled}
                    onClick={() => {
                      onChange({
                        id: result.id,
                        title: result.title,
                        startsAt: result.startsAt,
                        organizationName: result.organizationName,
                        cityName: result.cityName,
                        coverImageUrl: result.coverImageUrl,
                      });
                      setOpen(false);
                    }}
                  >
                    Choisir
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SourceOption({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-card border border-border p-3 has-[:checked]:border-text-strong">
      <input
        type="radio"
        name="spotlight-source"
        checked={checked}
        onChange={onSelect}
        className="mt-1 accent-[var(--color-coral)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-s font-semibold">{label}</span>
        <span className="text-micro text-text-3">{hint}</span>
      </span>
    </label>
  );
}

/** La diapositive en réduction : le même voile, la même hiérarchie que sur le site. */
function Preview({
  imageUrl,
  title,
  date,
  external,
  sponsored,
}: {
  imageUrl: string | null;
  title: string;
  date: string | null;
  external: boolean;
  sponsored: boolean;
}) {
  return (
    <div className="relative h-[200px] overflow-hidden rounded-panel bg-ink text-white">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <div aria-hidden className="ink-scrim absolute inset-0" />
      {sponsored ? (
        <span className="absolute left-3 top-3 rounded-chip bg-black/45 px-2 py-1 text-micro font-semibold text-white/90">
          Sponsorisé
        </span>
      ) : null}
      <div className="absolute inset-x-3 bottom-3 flex flex-col gap-1">
        {external ? (
          <Badge tone="overlay-accent" className="self-start">
            Billetterie externe
            <ArrowUpRight className="size-3" aria-hidden />
          </Badge>
        ) : null}
        {date ? <p className="eyebrow text-coral-200">{date}</p> : null}
        <p className="line-clamp-2 font-display text-[20px] font-bold leading-[1.05]">{title}</p>
      </div>
    </div>
  );
}
