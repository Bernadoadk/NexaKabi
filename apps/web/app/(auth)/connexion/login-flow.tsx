'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  OTP_WHATSAPP_FALLBACK_SECONDS,
  type ApiError,
  type RequestOtpResponse,
  type SessionUser,
} from '@nexakabi/contracts';
import { formatShortCountdown, tryNormalizePhone } from '@nexakabi/utils';
import { Alert, Button, Field, Input, OtpInput, PhoneInput, Surface } from '@nexakabi/ui';

/**
 * Connexion et inscription — le même parcours.
 *
 * Trois étapes, reprises du prototype :
 *   1. Entrer   — le numéro de téléphone suffit ; on reconnaît le compte ou on
 *                 le crée, sans formulaire supplémentaire.
 *   2. Vérifier — code à 6 chiffres, avec compte à rebours et repli WhatsApp.
 *   3. Compléter — nom et e-mail facultatif, uniquement pour un nouveau compte.
 *
 * Aucun mot de passe : « le mot de passe est un obstacle réel ».
 */

type Step = 'phone' | 'code' | 'profile';

export interface LoginFlowContext {
  title: string;
  subtitle: string;
}

export function LoginFlow({
  redirectTo,
  context,
}: {
  redirectTo: string;
  context?: LoginFlowContext | null;
}) {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>('phone');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [challenge, setChallenge] = React.useState<RequestOtpResponse | null>(null);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function finish() {
    // `refresh()` force les composants serveur à relire le cookie de session.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <Surface variant="panel" padding="none" className="overflow-hidden shadow-lg">
      <StepHeader step={step} />

      <div className="flex flex-col gap-4 px-6 py-7">
        {error ? (
          <Alert tone="danger" title="Impossible de continuer">
            {error}
          </Alert>
        ) : null}

        {step === 'phone' ? (
          <PhoneStep
            context={context}
            pending={pending}
            onSubmit={async (value) => {
              setPending(true);
              setError(null);

              try {
                const response = await fetch('/api/auth/request-code', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone: value }),
                });

                // Une 404/500 en mode développement répond parfois en HTML, pas
                // en JSON : `.json()` planterait alors sans jamais rendre la
                // main au bouton, qui tournerait indéfiniment.
                const payload: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                  setError((payload as ApiError | null)?.message ?? 'Impossible d’envoyer le code.');
                  return;
                }

                setPhone(value);
                setChallenge(payload as RequestOtpResponse);
                setCode('');
                setStep('code');
              } catch {
                setError('L’API n’est pas joignable.');
              } finally {
                setPending(false);
              }
            }}
          />
        ) : null}

        {step === 'code' && phone && challenge ? (
          <CodeStep
            phone={phone}
            challenge={challenge}
            code={code}
            pending={pending}
            onCodeChange={setCode}
            onBack={() => {
              setStep('phone');
              setError(null);
            }}
            onResend={async () => {
              setError(null);
              try {
                const response = await fetch('/api/auth/request-code', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone, channel: 'WHATSAPP' }),
                });
                const payload: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                  setError((payload as ApiError | null)?.message ?? 'Impossible de renvoyer le code.');
                  return;
                }
                setChallenge(payload as RequestOtpResponse);
                setCode('');
              } catch {
                setError('L’API n’est pas joignable.');
              }
            }}
            onSubmit={async (value) => {
              setPending(true);
              setError(null);

              try {
                const response = await fetch('/api/auth/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ phone, code: value }),
                });

                const payload: unknown = await response.json().catch(() => null);

                if (!response.ok) {
                  setError((payload as ApiError | null)?.message ?? 'Code invalide.');
                  setCode('');
                  return;
                }

                const session = payload as { user: SessionUser };

                if (session.user.needsProfileCompletion) {
                  setStep('profile');
                  return;
                }

                finish();
              } catch {
                setError('L’API n’est pas joignable.');
              } finally {
                setPending(false);
              }
            }}
          />
        ) : null}

        {step === 'profile' ? (
          <ProfileStep
            pending={pending}
            onSubmit={async (values) => {
              setPending(true);
              setError(null);

              try {
                const response = await fetch('/api/auth/complete-profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(values),
                });

                if (!response.ok) {
                  const payload: unknown = await response.json().catch(() => null);
                  setError((payload as ApiError | null)?.message ?? 'Impossible d’enregistrer.');
                  return;
                }

                finish();
              } catch {
                setError('L’API n’est pas joignable.');
              } finally {
                setPending(false);
              }
            }}
          />
        ) : null}
      </div>
    </Surface>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StepHeader({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    phone: 'Étape 1 · Entrer',
    code: 'Étape 2 · Vérifier',
    profile: 'Étape 3 · Compléter',
  };

  return (
    <div className="eyebrow border-b border-border bg-paper px-4 py-3 text-text-3">
      {labels[step]}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PhoneStep({
  context,
  pending,
  onSubmit,
}: {
  context?: LoginFlowContext | null;
  pending: boolean;
  onSubmit: (phone: string) => Promise<void>;
}) {
  const [value, setValue] = React.useState('');
  const normalized = tryNormalizePhone(value);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (normalized) void onSubmit(normalized);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[23px] font-bold tracking-[-0.025em]">
          {context?.title ?? 'Bienvenue sur Nexa‑Kabi'}
        </h1>
        <p className="text-body text-text-2">
          {context?.subtitle ??
            'Entre ton numéro : on te reconnaît ou on crée ton compte, sans formulaire supplémentaire.'}
        </p>
      </div>

      <Field label="Numéro de téléphone" htmlFor="phone">
        <PhoneInput id="phone" autoFocus required onValueChange={(_e164, raw) => setValue(raw)} />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="primary"
        block
        loading={pending}
        loadingLabel="Envoi du code…"
        disabled={!normalized}
      >
        Recevoir mon code
      </Button>

      <p className="text-center text-micro leading-relaxed text-text-3">
        En continuant, tu acceptes les <a href="/cgu">conditions</a> et la{' '}
        <a href="/confidentialite">politique de confidentialité</a>.
      </p>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CodeStep({
  phone,
  challenge,
  code,
  pending,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: {
  phone: string;
  challenge: RequestOtpResponse;
  code: string;
  pending: boolean;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}) {
  const secondsLeft = useCountdown(challenge.resendAt);
  const canResend = secondsLeft <= 0;

  // Le repli WhatsApp n'est proposé qu'après un délai : le SMS a le temps
  // d'arriver, et on n'affole pas l'utilisateur dès la première seconde.
  const showWhatsApp = secondsLeft <= Math.max(0, 60 - OTP_WHATSAPP_FALLBACK_SECONDS) || canResend;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6) void onSubmit(code);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[23px] font-bold tracking-[-0.025em]">
          Ton code à 6 chiffres
        </h1>
        <p className="text-body text-text-2">
          Envoyé par {challenge.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'} au{' '}
          <b className="text-text-strong">{challenge.maskedPhone}</b>.
        </p>
      </div>

      <OtpInput
        value={code}
        onValueChange={onCodeChange}
        onComplete={(value) => void onSubmit(value)}
        autoFocus
        aria-label="Code de vérification reçu par SMS"
      />

      <div className="flex items-center justify-between text-body-s">
        <span className="text-text-2">
          {canResend ? (
            'Tu peux demander un nouveau code'
          ) : (
            <>
              Nouveau code dans{' '}
              <b className="tabular text-text-strong">{formatShortCountdown(secondsLeft * 1000)}</b>
            </>
          )}
        </span>

        {showWhatsApp ? (
          <button
            type="button"
            className="font-semibold text-coral hover:text-coral-hover"
            onClick={() => void onResend()}
          >
            Recevoir sur WhatsApp
          </button>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="primary"
        size="primary"
        block
        loading={pending}
        loadingLabel="Vérification…"
        disabled={code.length < 6}
      >
        Vérifier
      </Button>

      {challenge.devCode ? (
        <Alert tone="info" title="Mode développement">
          Le fournisseur SMS est simulé. Code : <b className="tabular">{challenge.devCode}</b>
        </Alert>
      ) : null}

      <div className="rounded-[12px] bg-paper p-3.5 text-body-s leading-relaxed text-text-2">
        Le code est collé automatiquement depuis le SMS sur Android. Aucun mot de passe n’est créé :
        la session dure 90 jours sur cet appareil.
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-body-s font-semibold text-text-2 hover:text-text-strong"
      >
        ← Changer de numéro ({phone.slice(-4)})
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProfileStep({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (values: {
    fullName: string;
    email?: string;
    marketingOptIn: boolean;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [marketingOptIn, setMarketingOptIn] = React.useState(true);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          marketingOptIn,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[23px] font-bold tracking-[-0.025em]">
          Comment t’appelles-tu ?
        </h1>
        <p className="text-body text-text-2">
          Ce nom figurera sur tes billets. Deux champs, c’est tout — le reste peut attendre.
        </p>
      </div>

      <Field label="Nom complet" htmlFor="fullName">
        <Input
          id="fullName"
          autoFocus
          required
          minLength={2}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Adjovi Kponou"
        />
      </Field>

      <Field label="Email" hint="· facultatif, pour recevoir une copie du billet" htmlFor="email">
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="adjovi@exemple.bj"
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 text-body-s leading-relaxed text-text-strong">
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(event) => setMarketingOptIn(event.target.checked)}
          className="mt-0.5 size-[19px] shrink-0 accent-[var(--color-coral)]"
        />
        Me prévenir des événements qui correspondent à mes goûts (max. 1 message par semaine)
      </label>

      <Button
        type="submit"
        variant="primary"
        size="primary"
        block
        loading={pending}
        loadingLabel="Enregistrement…"
        disabled={fullName.trim().length < 2}
      >
        Terminer
      </Button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/** Secondes restantes avant l'instant donné, mises à jour chaque seconde. */
function useCountdown(target: string): number {
  const compute = React.useCallback(
    () => Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1000)),
    [target],
  );

  const [seconds, setSeconds] = React.useState(compute);

  React.useEffect(() => {
    setSeconds(compute());
    const timer = setInterval(() => setSeconds(compute()), 1000);
    return () => clearInterval(timer);
  }, [compute]);

  return seconds;
}
