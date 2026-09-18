'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Field,
  Input,
  PhoneInput,
  Surface,
  Textarea,
  startRouteProgress,
} from '@nexakabi/ui';
import { PlaceSearch } from './place-search';
import { createOrganizationAction } from './actions';

const TYPES = [
  ['INDIVIDUAL', 'Personne physique'],
  ['COMPANY', 'Entreprise'],
  ['ASSOCIATION', 'Association'],
  ['INSTITUTION', 'Institution'],
] as const;

/**
 * Création d'une organisation — première étape du parcours organisateur.
 *
 * ── Ce que ce formulaire a corrigé ──────────────────────────────────────────
 * Il ne demandait que le nom, le type, la ville et le WhatsApp — trois champs
 * (téléphone, e-mail, description) que l'API accepte déjà à la création
 * n'avaient tout simplement aucun input pour les porter. La recherche de lieu
 * était, elle, absente : la ville se tapait à la main, sans l'aide que
 * l'assistant d'événement offre déjà pour un lieu.
 *
 * ── Pourquoi pas TOUT ce qu'un profil d'organisateur peut porter ────────────
 * Une revue des formulaires d'Eventbrite, Shotgun et HelloAsso confirme la
 * même chose que le prototype dit déjà pour un événement : « le titre suffit
 * à démarrer ». Logo, couverture, site web et réseaux sociaux s'y remplissent
 * APRÈS la création, progressivement — jamais à l'inscription. Ces champs
 * restent donc dans les Paramètres (`organization-settings-form.tsx`), qui
 * les portait déjà ; ici, seul ce qui aide à démarrer vite est ajouté.
 */
export function CreateOrganizationForm() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [cityName, setCityName] = React.useState('');
  const [address, setAddress] = React.useState('');

  return (
    <Surface variant="panel" padding="comfortable">
      <form
        className="flex flex-col gap-5"
        action={async (formData) => {
          setPending(true);
          setError(null);

          const result = await createOrganizationAction(formData);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          // L'espace organisateur se monte pour la première fois : tableau de
          // bord, chiffres, navigation. C'est long, et le bouton est déjà
          // relâché.
          startRouteProgress();
          router.replace('/pro');
          router.refresh();
        }}
      >
        {error ? (
          <Alert tone="danger" title="Création impossible">
            {error}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4">
          <Field label="Nom de l’organisation" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              autoFocus
              placeholder="Yélé Productions"
            />
          </Field>

          <Field label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue="INDIVIDUAL"
              className="min-h-[var(--tap-min)] w-full rounded-field border border-border-field bg-surface px-3 text-[14px]"
            >
              {TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Description"
            hint="· facultatif"
            help="Deux phrases sur qui tu es ou le type d’événements que tu organises — affichées sur ta page publique."
            htmlFor="description"
          >
            <Textarea id="description" name="description" rows={3} maxLength={2000} />
          </Field>
        </div>

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
          <h2 className="text-h3 font-bold">Où et comment te joindre</h2>

          <PlaceSearch
            basePath="/api/places"
            label="Rechercher ta ville ou ton adresse"
            placeholder="Cotonou, Akpakpa…"
            disabled={pending}
            onSelect={(place) => {
              if (place.cityName) setCityName(place.cityName);
              setAddress(place.address ?? place.name);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ville" htmlFor="cityName">
              <Input
                id="cityName"
                name="cityName"
                value={cityName}
                onChange={(event) => setCityName(event.target.value)}
                placeholder="Cotonou"
              />
            </Field>
            <Field label="Adresse" hint="· facultatif" htmlFor="address">
              <Input
                id="address"
                name="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" hint="· facultatif" htmlFor="phone">
              <PhoneInput id="phone" name="phone" />
            </Field>
            <Field
              label="WhatsApp"
              hint="· facultatif"
              help="Canal de contact affiché aux participants."
              htmlFor="whatsapp"
            >
              <PhoneInput id="whatsapp" name="whatsapp" />
            </Field>
          </div>

          <Field label="E-mail" hint="· facultatif" htmlFor="email">
            <Input id="email" name="email" type="email" placeholder="contact@yele.bj" />
          </Field>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="primary"
          block
          loading={pending}
          loadingLabel="Création…"
        >
          Créer mon organisation
        </Button>
      </form>
    </Surface>
  );
}
