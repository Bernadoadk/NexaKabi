'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { EVENT_TITLE_MAX_LENGTH, EVENT_WIZARD_STEPS } from '@nexakabi/contracts';
import { Alert, Button, Dialog, Field, Input, type ButtonProps } from '@nexakabi/ui';
import { createEventAction } from '../actions';

/**
 * Création d'un brouillon d'événement.
 *
 * Le titre suffit à démarrer : la création doit être simple et progressive,
 * conformément au cahier des charges §17. Le titre validé ouvre directement
 * l'assistant, à sa première étape : c'est lui l'accueil, avec ses huit
 * étapes et la liste de ce qu'il reste à compléter avant de publier.
 *
 * ── Pourquoi une boîte de dialogue, et plus une colonne ────────────────────
 * Le formulaire occupait une colonne permanente à côté de la liste : sur un
 * téléphone, il passait SOUS tous les événements, et sur un grand écran il
 * volait un tiers de la largeur à la seule chose qu'on vient consulter. Un
 * bouton « Nouvel événement » toujours visible, une boîte avec un seul champ :
 * même simplicité, aucune place prise.
 */
export function CreateEventButton({
  organizationId,
  variant = 'primary',
  size = 'compact',
  label = 'Nouvel événement',
  block,
}: {
  organizationId: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  label?: string;
  block?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState('');

  return (
    <>
      <Button variant={variant} size={size} block={block} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Nouvel événement"
        description="Donne-lui un titre : l’assistant t’accompagne ensuite, étape par étape — date, lieu, visuels, billets, publication."
      >
        <form
          className="flex flex-col gap-3.5"
          action={async (formData) => {
            setPending(true);
            setError(null);

            const result = await createEventAction(organizationId, formData);

            if (!result.ok) {
              setPending(false);
              setError(result.message);
              return;
            }

            // On laisse `pending` levé : le bouton reste occupé jusqu'à ce
            // que l'assistant ait pris la main. Le relâcher ici ferait
            // clignoter un formulaire prêt à créer un doublon.
            router.push(`/pro/evenements/${result.data.id}`);
          }}
        >
          {error ? (
            <Alert tone="danger" title="Création impossible">
              {error}
            </Alert>
          ) : null}

          <Field
            label="Titre de l’événement"
            htmlFor="new-event-title"
            help={`${title.length} / ${EVENT_TITLE_MAX_LENGTH} caractères · évite les majuscules complètes, elles sont tronquées sur mobile.`}
          >
            <Input
              id="new-event-title"
              name="title"
              required
              autoFocus
              minLength={3}
              maxLength={EVENT_TITLE_MAX_LENGTH}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Festival Yélé · 3e édition"
              className="text-[16px] font-semibold"
            />
          </Field>

          <ol className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-card bg-paper p-3 text-micro text-text-2 sm:grid-cols-4">
            {EVENT_WIZARD_STEPS.map((step) => (
              <li key={step.key} className="flex gap-1.5">
                <span className="tabular font-bold text-text-3">{step.step}</span>
                {step.label}
              </li>
            ))}
          </ol>

          <Button
            type="submit"
            variant="primary"
            size="mobile"
            block
            loading={pending}
            loadingLabel="Ouverture de l’assistant…"
          >
            Commencer →
          </Button>
        </form>
      </Dialog>
    </>
  );
}
