'use client';

import * as React from 'react';
import { ORG_ROLE_DEFINITIONS } from '@nexakabi/contracts';
import { Alert, Button, Field, Input, Select, Surface, useToast } from '@nexakabi/ui';
import { inviteMemberAction } from '../actions';

const ROLES = ['ADMIN', 'MANAGER', 'SCANNER', 'ANALYST'] as const;

/**
 * Invitation d'un membre.
 *
 * L'invitation part par WhatsApp avec un lien à usage unique valable 7 jours.
 * Pour un contrôleur, on choisit en plus l'événement et la porte ; il n'a alors
 * accès à rien d'autre.
 */
export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const { push } = useToast();
  const [role, setRole] = React.useState<(typeof ROLES)[number]>('MANAGER');
  const [error, setError] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Inviter quelqu’un</h2>
        <p className="text-body-s text-text-2">
          Un lien à usage unique, valable 7 jours, à transmettre par WhatsApp.
        </p>
      </div>

      <form
        className="flex flex-col gap-3.5"
        action={async (formData) => {
          setPending(true);
          setError(null);
          setLink(null);

          const result = await inviteMemberAction(organizationId, formData);
          setPending(false);

          if (!result.ok) {
            setError(result.message);
            return;
          }

          setLink(`${window.location.origin}/invitation/${result.data.token}`);
        }}
      >
        {error ? (
          <Alert tone="danger" title="Invitation impossible">
            {error}
          </Alert>
        ) : null}

        <Field
          label="Téléphone ou email"
          htmlFor="contact"
          help="Avec un numéro, la personne rejoint l’équipe dès qu’elle se connecte — aucun lien à cliquer. Le lien reste utile pour la prévenir."
        >
          <Input id="contact" name="contact" required placeholder="97 44 12 08" />
        </Field>

        <Field label="Rôle" htmlFor="role" help={ORG_ROLE_DEFINITIONS[role].description}>
          {/* Chaque rôle est décrit par une phrase, dans le menu même : on
              choisit en sachant, pas en devinant d'après un mot. */}
          <Select
            id="role"
            name="role"
            value={role}
            onValueChange={(value) => setRole(value as (typeof ROLES)[number])}
            options={ROLES.map((value) => ({
              value,
              label: ORG_ROLE_DEFINITIONS[value].label,
              description: ORG_ROLE_DEFINITIONS[value].description,
            }))}
          />
        </Field>

        {role === 'SCANNER' ? (
          <>
            <Field
              label="Événements autorisés"
              help="Le contrôleur n’aura accès à rien d’autre. Séparer par des virgules."
              htmlFor="scopedEventIds"
            >
              <Input
                id="scopedEventIds"
                name="scopedEventIds"
                required
                placeholder="identifiant de l’événement"
              />
            </Field>

            <Field label="Porte" hint="· facultatif" htmlFor="gate">
              <Input id="gate" name="gate" placeholder="Porte principale" />
            </Field>
          </>
        ) : null}

        <Button
          type="submit"
          variant="ink"
          size="mobile"
          block
          loading={pending}
          loadingLabel="Envoi…"
        >
          Envoyer l’invitation
        </Button>
      </form>

      {link ? (
        <Alert tone="success" title="Invitation créée">
          <span className="break-all">{link}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2.5 text-on-ink-2">
            Envoie-le par WhatsApp. Il expire dans 7 jours. Si tu as indiqué un numéro, la personne
            est ajoutée automatiquement dès sa connexion — le lien lui sert surtout de rappel.
            {/* `text-white` explicite, pas hérité du `text-on-ink-2` du parent :
                ce bouton est une action, il doit se détacher du texte de
                réassurance autour de lui — et surtout pas hériter d'un
                `text-ink` qui le rendrait illisible sur ce fond, lui-même encre. */}
            <button
              type="button"
              className="font-semibold text-white underline underline-offset-2"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  push('Lien copié');
                } catch {
                  push('Impossible de copier — sélectionne le lien à la main', 'danger');
                }
              }}
            >
              Copier le lien
            </button>
          </span>
        </Alert>
      ) : null}
    </Surface>
  );
}
