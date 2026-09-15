'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Organization } from '@nexakabi/contracts';
import { Alert, Button, Field, Input, PhoneInput, Surface, Textarea } from '@nexakabi/ui';
import { ImageUploader } from '@/components/image-uploader';
import { PlaceSearch } from '../place-search';
import {
  updateOrganizationAction,
  updateOrganizationCoverAction,
  updateOrganizationLogoAction,
} from '../actions';

/**
 * Identité et coordonnées de l'organisation.
 *
 * Le type d'organisation n'est volontairement pas modifiable ici : c'est un
 * choix structurant fait à la création, pas un champ de profil — le changer
 * après coup n'a pas d'effet documenté côté API.
 *
 * Ville et adresse sont contrôlées : la recherche Google Maps — la même qu'à
 * la création de l'organisation et dans l'assistant d'événement — les remplit
 * d'un coup, et elles restent éditables ensuite.
 */
export function OrganizationSettingsForm({
  organizationId,
  organization,
}: {
  organizationId: string;
  organization: Organization;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [cityName, setCityName] = React.useState(organization.cityName ?? '');
  const [address, setAddress] = React.useState(organization.address ?? '');

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <form
        className="flex flex-col gap-5"
        action={async (formData) => {
          setPending(true);
          setError(null);
          setSuccess(false);

          const result = await updateOrganizationAction(organizationId, formData);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          setSuccess(true);
          router.refresh();
        }}
      >
        {error ? (
          <Alert tone="danger" title="Enregistrement impossible">
            {error}
          </Alert>
        ) : null}
        {success ? <Alert tone="success" title="Paramètres enregistrés" /> : null}

        <div className="flex flex-col gap-4">
          <h2 className="text-h3 font-bold">Identité</h2>

          <ImageUploader
            uploadUrl="/api/media/organization-logo"
            currentUrl={organization.logoUrl}
            shape="square"
            label="Logo"
            hint="Carré · 200×200 minimum"
            disabled={pending}
            onChange={async (url) => {
              const result = await updateOrganizationLogoAction(organizationId, url);
              if (result.ok) router.refresh();
            }}
          />

          <ImageUploader
            uploadUrl="/api/media/organization-cover"
            currentUrl={organization.coverUrl}
            shape="video"
            label="Bannière"
            hint="16:9 · 1600×900 minimum · affichée sur la page publique"
            disabled={pending}
            onChange={async (url) => {
              const result = await updateOrganizationCoverAction(organizationId, url);
              if (result.ok) router.refresh();
            }}
          />

          <Field label="Nom de l’organisation" htmlFor="name">
            <Input id="name" name="name" required minLength={2} defaultValue={organization.name} />
          </Field>

          <Field
            label="Raison sociale"
            hint="· facultatif"
            help="Pour une entreprise ou une association — utilisée sur les documents officiels."
            htmlFor="legalName"
          >
            <Input id="legalName" name="legalName" defaultValue={organization.legalName ?? ''} />
          </Field>

          <Field
            label="Description"
            hint="· facultatif"
            help="Affichée sur la page publique de l’organisation."
            htmlFor="description"
          >
            <Textarea
              id="description"
              name="description"
              rows={4}
              maxLength={2000}
              defaultValue={organization.description ?? ''}
            />
          </Field>

          <PlaceSearch
            basePath="/api/places"
            label="Rechercher ta ville ou ton adresse"
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
        </div>

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
          <h2 className="text-h3 font-bold">Coordonnées</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" hint="· facultatif" htmlFor="phone">
              <PhoneInput id="phone" name="phone" defaultValue={organization.phone ?? undefined} />
            </Field>
            <Field label="WhatsApp" hint="· facultatif" htmlFor="whatsapp">
              <PhoneInput
                id="whatsapp"
                name="whatsapp"
                defaultValue={organization.whatsapp ?? undefined}
              />
            </Field>
          </div>

          <Field label="E-mail" hint="· facultatif" htmlFor="email">
            <Input id="email" name="email" type="email" defaultValue={organization.email ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site web" hint="· facultatif" htmlFor="website">
              <Input
                id="website"
                name="website"
                placeholder="https://…"
                defaultValue={organization.website ?? ''}
              />
            </Field>
            <Field label="Facebook" hint="· facultatif" htmlFor="facebook">
              <Input
                id="facebook"
                name="facebook"
                placeholder="https://…"
                defaultValue={organization.facebook ?? ''}
              />
            </Field>
            <Field label="Instagram" hint="· facultatif" htmlFor="instagram">
              <Input
                id="instagram"
                name="instagram"
                placeholder="https://…"
                defaultValue={organization.instagram ?? ''}
              />
            </Field>
            <Field label="TikTok" hint="· facultatif" htmlFor="tiktok">
              <Input
                id="tiktok"
                name="tiktok"
                placeholder="https://…"
                defaultValue={organization.tiktok ?? ''}
              />
            </Field>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="mobile"
          loading={pending}
          loadingLabel="Enregistrement…"
          className="self-start"
        >
          Enregistrer
        </Button>
      </form>
    </Surface>
  );
}
