'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  OTP_WHATSAPP_FALLBACK_SECONDS,
  type ApiError,
  type RequestOtpResponse,
  type SessionUser,
  type UserInterests,
} from '@nexakabi/contracts';
import { formatShortCountdown } from '@nexakabi/utils';
import {
  Alert,
  Button,
  Field,
  Input,
  OtpInput,
  PhoneInput,
  Surface,
  cn,
  startRouteProgress,
} from '@nexakabi/ui';
import { InterestPicker, type InterestOption } from '@/components/interest-picker';

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
  categories = [],
  cities = [],
}: {
  redirectTo: string;
  context?: LoginFlowContext | null;
  /** Référentiels proposés à l'étape 3, pour les goûts. */
  categories?: readonly InterestOption[];
  cities?: readonly InterestOption[];
}) {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>('phone');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [challenge, setChallenge] = React.useState<RequestOtpResponse | null>(null);
  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  function finish() {
    // La destination est souvent lourde — l'espace organisateur, le scanner,
    // « Mes billets » — et le bouton vient de rendre la main. Sans le filet,
    // l'écran resterait figé sur le formulaire, code validé, sans rien dire.
    startRouteProgress();

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
                  setError(
                    (payload as ApiError | null)?.message ?? 'Impossible d’envoyer le code.',
                  );
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
                  setError(
                    (payload as ApiError | null)?.message ?? 'Impossible de renvoyer le code.',
                  );
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
            categories={categories}
            cities={cities}
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
  // Le numéro, déjà normalisé en E.164 par le champ — pour le pays choisi.
  // Les utilisateurs ne sont pas forcément béninois : le sélecteur d'indicatif
  // est là, le Bénin en premier parce que c'est le pays par défaut.
  const [normalized, setNormalized] = React.useState<string | null>(null);

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
        <PhoneInput
          id="phone"
          autoFocus
          required
          selectableCountry
          onValueChange={(e164) => setNormalized(e164)}
        />
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

export interface ProfileStepValues {
  fullName: string;
  email?: string;
  interests: UserInterests;
  /** Sélection hebdomadaire selon les goûts. */
  recommendations: boolean;
  /** Newsletter par e-mail — part en attente de confirmation. */
  newsletter: boolean;
}

/**
 * Étape 3 — le nom, et ce que la personne veut bien nous dire de plus.
 *
 * ── Aucune case cochée d'avance ─────────────────────────────────────────────
 * La sélection hebdomadaire et la newsletter ne partent que vers qui les a
 * demandées. Une case précochée recueille l'inattention, pas un accord : elle
 * ne vaut rien comme consentement, et elle remplit une liste de gens qui se
 * désabonneront — ou nous signaleront comme indésirables — au premier envoi.
 *
 * Les goûts restent facultatifs : sans eux, la sélection propose de tout.
 */
function ProfileStep({
  pending,
  categories,
  cities,
  onSubmit,
}: {
  pending: boolean;
  categories: readonly InterestOption[];
  cities: readonly InterestOption[];
  onSubmit: (values: ProfileStepValues) => Promise<void>;
}) {
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [interests, setInterests] = React.useState<UserInterests>({
    categoryIds: [],
    cityIds: [],
  });
  const [recommendations, setRecommendations] = React.useState(false);
  const [newsletter, setNewsletter] = React.useState(false);

  // La newsletter part par e-mail : sans adresse valable, la case n'a pas
  // d'objet. Elle reste visible, grisée, pour que la personne sache où la
  // retrouver une fois l'adresse donnée.
  const hasEmail = EMAIL_PATTERN.test(email.trim());

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          fullName: fullName.trim(),
          email: email.trim() || undefined,
          interests,
          recommendations,
          newsletter: newsletter && hasEmail,
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

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-[12px] bg-paper p-3.5">
          <p className="text-body-s font-semibold text-text-strong">
            Ce qui t’intéresse <span className="font-normal text-text-3">· facultatif</span>
          </p>
          <InterestPicker
            compact
            categories={categories}
            cities={cities}
            value={interests}
            onChange={setInterests}
            disabled={pending}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <ConsentBox
          checked={recommendations}
          onChange={setRecommendations}
          label="M’envoyer une sélection d’événements selon mes goûts"
          hint="Une par semaine au maximum. Tu choisis ensuite par où : notification, e-mail ou WhatsApp."
        />
        <ConsentBox
          checked={newsletter && hasEmail}
          onChange={setNewsletter}
          disabled={!hasEmail}
          label="Recevoir la newsletter Nexa‑Kabi par e-mail"
          hint={
            hasEmail
              ? 'Un lien de confirmation t’est envoyé : rien ne part avant que tu l’aies ouvert.'
              : 'Renseigne ton e-mail ci-dessus pour pouvoir t’y abonner.'
          }
        />
      </div>

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

/** Assez pour savoir si une adresse est plausible ; le serveur tranche. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Une case de consentement, avec ce qu'elle engage écrit dessous. */
function ConsentBox({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 text-body-s leading-relaxed',
        disabled ? 'cursor-not-allowed text-text-3' : 'cursor-pointer text-text-strong',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-[19px] shrink-0 accent-[var(--color-coral)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="text-micro leading-snug text-text-3">{hint}</span>
      </span>
    </label>
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
