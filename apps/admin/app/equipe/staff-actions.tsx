'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff, KeyRound, Pencil, Plus, Trash2, UserX, UserCheck } from 'lucide-react';
import { ADMIN_HANDLE_PATTERN, type AdminAccess, type AdminStaffMember } from '@nexakabi/contracts';
import { Alert, Button, Dialog, Field, Input, cn } from '@nexakabi/ui';
import { AccessEditor } from './access-editor';

/**
 * Les gestes du propriétaire sur son équipe : ajouter, modifier, changer un
 * mot de passe, suspendre, supprimer.
 *
 * Chaque geste passe par le relais (`/api/admin/staff…`), qui porte le jeton
 * en cookie ; la page se rafraîchit ensuite pour relire l'équipe depuis
 * l'API — jamais d'état local qui pourrait mentir sur ce qui a été enregistré.
 *
 * Les mots de passe sont saisis par le propriétaire (choix produit) : douze
 * caractères au minimum, avec une confirmation et un œil pour vérifier la
 * frappe. Ils ne sont jamais réaffichés ensuite.
 */
const MIN_PASSWORD = 12;

async function call(path: string, method: string, body?: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) return { ok: true };

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: payload?.message ?? `L’API a répondu ${response.status}.` };
  } catch {
    return { ok: false, message: 'L’API n’est pas joignable.' };
  }
}

/** Nom d'identifiant proposé depuis le nom affiché : « Awa Dossou » → « awa ». */
function suggestHandle(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  const handle = first
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return ADMIN_HANDLE_PATTERN.test(handle) ? handle : '';
}

function PasswordFields({
  idPrefix,
  label = 'Mot de passe',
}: {
  idPrefix: string;
  label?: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <Field label={label} htmlFor={`${idPrefix}-password`} help={`${MIN_PASSWORD} caractères au minimum.`}>
        <div className="relative">
          <Input
            id={`${idPrefix}-password`}
            name="password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            className="pr-11"
          />
          <button
            type="button"
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            onClick={() => setVisible((current) => !current)}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-text-3 hover:text-text-strong"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Field label="Confirmation" htmlFor={`${idPrefix}-confirm`}>
        <Input
          id={`${idPrefix}-confirm`}
          name="confirm"
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
        />
      </Field>
    </div>
  );
}

function readPassword(formData: FormData): { password: string } | { error: string } {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < MIN_PASSWORD) {
    return { error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.` };
  }
  if (password !== confirm) return { error: 'Les deux saisies ne correspondent pas.' };

  return { password };
}

// ─────────────────────────────────────────────────────────────────────────────

export function CreateStaffButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullName, setFullName] = React.useState('');
  const [handle, setHandle] = React.useState('');
  const [handleTouched, setHandleTouched] = React.useState(false);
  const [rights, setRights] = React.useState<{ access: AdminAccess; canMoveMoney: boolean }>({
    access: {},
    canMoveMoney: false,
  });
  const [created, setCreated] = React.useState<AdminStaffMember | null>(null);

  function reset() {
    setFullName('');
    setHandle('');
    setHandleTouched(false);
    setRights({ access: {}, canMoveMoney: false });
    setError(null);
    setCreated(null);
  }

  return (
    <>
      <Button variant="primary" size="compact" className={className} onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Ajouter un employé
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) reset();
        }}
        title={created ? 'Employé ajouté' : 'Nouvel employé'}
        description={
          created
            ? undefined
            : 'Un identifiant est généré à partir du nom. Tu choisis le mot de passe et les espaces auxquels il a accès.'
        }
        className="max-w-[640px]"
      >
        {created ? (
          <CreatedPanel member={created} onClose={() => setOpen(false)} />
        ) : (
          <form
            className="flex flex-col gap-4"
            action={async (formData) => {
              const password = readPassword(formData);
              if ('error' in password) {
                setError(password.error);
                return;
              }

              setPending(true);
              setError(null);

              const response = await fetch('/api/admin/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fullName: fullName.trim(),
                  handle: handle.trim().toLowerCase(),
                  password: password.password,
                  access: rights.access,
                  canMoveMoney: rights.canMoveMoney,
                }),
              }).catch(() => null);

              setPending(false);

              if (!response) {
                setError('L’API n’est pas joignable.');
                return;
              }

              const payload = (await response.json().catch(() => null)) as
                | (AdminStaffMember & { message?: string })
                | null;

              if (!response.ok || !payload) {
                setError(payload?.message ?? 'Création impossible.');
                return;
              }

              setCreated(payload);
              router.refresh();
            }}
          >
            {error ? (
              <Alert tone="danger" title="Création impossible">
                {error}
              </Alert>
            ) : null}

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Nom affiché" htmlFor="staff-fullName">
                <Input
                  id="staff-fullName"
                  value={fullName}
                  required
                  minLength={2}
                  placeholder="Awa Dossou"
                  onChange={(event) => {
                    setFullName(event.target.value);
                    if (!handleTouched) setHandle(suggestHandle(event.target.value));
                  }}
                />
              </Field>
              <Field
                label="Nom d’identifiant"
                htmlFor="staff-handle"
                help={handle ? `Identifiant : ${handle}.staff@xxxx (suffixe généré)` : 'Minuscules, chiffres, tirets.'}
              >
                <Input
                  id="staff-handle"
                  value={handle}
                  required
                  pattern="[a-z][a-z0-9-]{1,23}"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="awa"
                  onChange={(event) => {
                    setHandleTouched(true);
                    setHandle(event.target.value.toLowerCase());
                  }}
                />
              </Field>
            </div>

            <PasswordFields idPrefix="staff" />

            <div className="flex flex-col gap-1.5">
              <p className="text-body-s font-semibold">Espaces et droits</p>
              <AccessEditor
                access={rights.access}
                canMoveMoney={rights.canMoveMoney}
                onChange={setRights}
                disabled={pending}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="mobile"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="mobile"
                loading={pending}
                loadingLabel="Création…"
              >
                Créer le compte
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

function CreatedPanel({ member, onClose }: { member: AdminStaffMember; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="success" title={`${member.fullName} fait partie de l’équipe`}>
        Transmets-lui son identifiant et le mot de passe que tu viens de choisir — par un canal
        sûr, jamais dans un groupe. Il pourra changer son mot de passe une fois connecté.
      </Alert>

      <div className="flex items-center gap-2 rounded-card border border-border bg-paper px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-micro text-text-3">Identifiant</p>
          <p className="tabular truncate font-display text-[17px] font-bold text-text-strong">
            {member.username}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(member.username);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Presse-papiers indisponible : l'identifiant reste lisible à l'écran.
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copié' : 'Copier'}
        </Button>
      </div>

      <Button variant="ink" size="mobile" block onClick={onClose}>
        Fermer
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function StaffActions({ member }: { member: AdminStaffMember }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<'edit' | 'password' | 'status' | 'delete' | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fullName, setFullName] = React.useState(member.fullName);
  const [rights, setRights] = React.useState<{ access: AdminAccess; canMoveMoney: boolean }>({
    access: member.access,
    canMoveMoney: member.canMoveMoney,
  });

  const suspended = member.status === 'SUSPENDED';

  function close() {
    if (pending) return;
    setDialog(null);
    setError(null);
    setFullName(member.fullName);
    setRights({ access: member.access, canMoveMoney: member.canMoveMoney });
  }

  async function run(request: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setPending(true);
    setError(null);
    const result = await request();
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    setDialog(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <ActionButton icon={<Pencil />} label="Modifier" onClick={() => setDialog('edit')} />
        <ActionButton icon={<KeyRound />} label="Mot de passe" onClick={() => setDialog('password')} />
        <ActionButton
          icon={suspended ? <UserCheck /> : <UserX />}
          label={suspended ? 'Réactiver' : 'Suspendre'}
          onClick={() => setDialog('status')}
        />
        <ActionButton icon={<Trash2 />} label="Supprimer" tone="danger" onClick={() => setDialog('delete')} />
      </div>

      {/* ── Modifier ─────────────────────────────────────────────────────── */}
      <Dialog
        open={dialog === 'edit'}
        onOpenChange={(open) => !open && close()}
        title={`Modifier ${member.fullName}`}
        description={member.username}
        className="max-w-[640px]"
      >
        <form
          className="flex flex-col gap-4"
          action={() =>
            run(() =>
              call(`/api/admin/staff/${member.id}`, 'PATCH', {
                fullName: fullName.trim(),
                access: rights.access,
                canMoveMoney: rights.canMoveMoney,
              }),
            )
          }
        >
          {error ? (
            <Alert tone="danger" title="Enregistrement impossible">
              {error}
            </Alert>
          ) : null}

          <Field label="Nom affiché" htmlFor={`edit-${member.id}-name`}>
            <Input
              id={`edit-${member.id}-name`}
              value={fullName}
              required
              minLength={2}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <p className="text-body-s font-semibold">Espaces et droits</p>
            <AccessEditor
              access={rights.access}
              canMoveMoney={rights.canMoveMoney}
              onChange={setRights}
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="mobile" disabled={pending} onClick={close}>
              Annuler
            </Button>
            <Button type="submit" variant="ink" size="mobile" loading={pending} loadingLabel="Enregistrement…">
              Enregistrer
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Mot de passe ─────────────────────────────────────────────────── */}
      <Dialog
        open={dialog === 'password'}
        onOpenChange={(open) => !open && close()}
        title={`Nouveau mot de passe pour ${member.fullName}`}
        description="Ses sessions ouvertes seront fermées : il devra se reconnecter avec ce mot de passe."
      >
        <form
          className="flex flex-col gap-4"
          action={(formData) => {
            const password = readPassword(formData);
            if ('error' in password) {
              setError(password.error);
              return;
            }
            return run(() =>
              call(`/api/admin/staff/${member.id}/password`, 'POST', { password: password.password }),
            );
          }}
        >
          {error ? (
            <Alert tone="danger" title="Réinitialisation impossible">
              {error}
            </Alert>
          ) : null}

          <PasswordFields idPrefix={`reset-${member.id}`} label="Nouveau mot de passe" />

          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="mobile" disabled={pending} onClick={close}>
              Annuler
            </Button>
            <Button type="submit" variant="ink" size="mobile" loading={pending} loadingLabel="Un instant…">
              Réinitialiser
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── Suspendre / réactiver ────────────────────────────────────────── */}
      <Dialog
        open={dialog === 'status'}
        onOpenChange={(open) => !open && close()}
        title={suspended ? `Réactiver ${member.fullName} ?` : `Suspendre ${member.fullName} ?`}
        description={
          suspended
            ? 'Le compte retrouve ses droits tels qu’ils étaient. Le mot de passe n’a pas changé.'
            : 'Ses sessions sont fermées immédiatement et la connexion lui est refusée jusqu’à réactivation. Ses droits sont conservés.'
        }
      >
        {error ? (
          <Alert tone="danger" title="Action impossible">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" size="mobile" disabled={pending} onClick={close}>
            Revenir
          </Button>
          <Button
            type="button"
            variant={suspended ? 'ink' : 'destructive-solid'}
            size="mobile"
            loading={pending}
            loadingLabel="Un instant…"
            onClick={() =>
              void run(() =>
                call(`/api/admin/staff/${member.id}/status`, 'POST', {
                  status: suspended ? 'ACTIVE' : 'SUSPENDED',
                }),
              )
            }
          >
            {suspended ? 'Réactiver' : 'Suspendre'}
          </Button>
        </div>
      </Dialog>

      {/* ── Supprimer ────────────────────────────────────────────────────── */}
      <Dialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && close()}
        title={`Retirer ${member.fullName} de l’équipe ?`}
        description={`L’identifiant ${member.username} cesse de fonctionner sur-le-champ. Ce qu’il a fait reste dans le journal d’audit, à son nom. Cette action est irréversible.`}
      >
        {error ? (
          <Alert tone="danger" title="Suppression impossible">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" size="mobile" disabled={pending} onClick={close}>
            Revenir
          </Button>
          <Button
            type="button"
            variant="destructive-solid"
            size="mobile"
            loading={pending}
            loadingLabel="Suppression…"
            onClick={() => void run(() => call(`/api/admin/staff/${member.id}`, 'DELETE'))}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function ActionButton({
  icon,
  label,
  tone = 'default',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'default' | 'danger';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-[9px] px-2.5 text-body-s font-semibold transition-colors [&>svg]:size-4',
        tone === 'danger'
          ? 'text-text-3 hover:bg-red-50 hover:text-red-700'
          : 'text-text-2 hover:bg-paper hover:text-text-strong',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
