'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@nexakabi/contracts';
import { formatPhone } from '@nexakabi/utils';
import { Alert, Button, Field, Input } from '@nexakabi/ui';
import { ImageUploader } from '@/components/image-uploader';

/**
 * Édition du profil — écran qui n'existait pas.
 *
 * ── Ce que ce chantier corrige ─────────────────────────────────────────────
 * Le nom et l'e-mail s'affichaient en lecture seule, sans aucun moyen de
 * corriger une coquille après l'inscription. `PATCH /auth/me/profile`
 * existait déjà — c'est la même route que l'étape 3 de l'inscription
 * (`api/auth/complete-profile`), rappelée ici sans aucun changement côté API :
 * la réutiliser après coup pour corriger son nom est exactement le même
 * geste que la renseigner la première fois.
 *
 * ── Pourquoi le téléphone n'est pas modifiable ────────────────────────────
 * C'est l'identifiant de connexion — le changer exigerait de revérifier le
 * nouveau numéro par code, un parcours à part qui n'existe pas encore.
 *
 * ── Pourquoi la photo envoie TOUJOURS le nom et l'e-mail avec elle ─────────
 * `PATCH /auth/me/profile` remplace le profil avec ce que porte le corps de
 * la requête — un champ absent n'est pas « laissé tel quel », il est
 * réinitialisé (`email ?? null`, coté API). Le dépôt de la photo, séparé du
 * bouton Enregistrer, doit donc renvoyer le nom et l'e-mail COURANTS avec la
 * nouvelle URL, sous peine d'effacer l'e-mail au passage.
 */
export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function save(payload: { fullName: string; email: string; avatarUrl?: string | null }) {
    try {
      const response = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          // Préservé tel quel : ni la photo ni une correction de nom ne
          // redemandent un consentement déjà donné.
          marketingOptIn: user.marketingOptIn,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? 'Impossible d’enregistrer.');
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setError('L’API n’est pas joignable.');
      return false;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Alert tone="danger" title="Enregistrement impossible">
          {error}
        </Alert>
      ) : null}
      {success ? <Alert tone="success" title="Profil mis à jour" /> : null}

      <ImageUploader
        uploadUrl="/api/media/avatar"
        currentUrl={user.avatarUrl}
        shape="square"
        label="Photo de profil"
        hint="Carré · 200×200 minimum"
        disabled={pending}
        onChange={async (url) => {
          setError(null);
          setSuccess(false);
          const ok = await save({ fullName: user.fullName, email: user.email ?? '', avatarUrl: url });
          if (ok) setSuccess(true);
        }}
      />

      <form
        className="flex flex-col gap-3.5"
        action={async (formData) => {
          setPending(true);
          setError(null);
          setSuccess(false);

          const ok = await save({
            fullName: String(formData.get('fullName') ?? '').trim(),
            email: String(formData.get('email') ?? '').trim(),
          });

          setPending(false);
          if (ok) setSuccess(true);
        }}
      >
        <Field label="Nom" htmlFor="fullName">
          <Input id="fullName" name="fullName" required minLength={2} defaultValue={user.fullName} />
        </Field>

        <Field
          label="Téléphone"
          htmlFor="phone"
          help="Ton identifiant de connexion : il ne se modifie pas ici."
        >
          <Input id="phone" value={formatPhone(user.phone)} disabled readOnly />
        </Field>

        <Field label="E-mail" hint="· facultatif" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={user.email ?? ''} />
        </Field>

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
    </div>
  );
}
