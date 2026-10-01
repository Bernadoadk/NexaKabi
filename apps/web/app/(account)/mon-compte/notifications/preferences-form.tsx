'use client';

import * as React from 'react';
import Link from 'next/link';
import type { PushStatus } from '@nexakabi/contracts';
import { Surface } from '@nexakabi/ui';
import type { NotificationPreferencesState } from '@/lib/notifications';
import {
  currentPushSubscription,
  detectPushSupport,
  setPushOptOut,
  subscribeThisDevice,
  unsubscribeThisDevice,
  type PushSupport,
} from '@/lib/push-client';
import { SettingsGroup, SettingsRow } from './settings-row';

/**
 * Réglages des alertes : ce que je reçois, et par où.
 *
 * ── Ce qui n'a pas d'interrupteur, et pourquoi on le dit quand même ────────
 * Les confirmations de paiement, les remboursements et les annulations ne se
 * désactivent pas : ils portent un billet, de l'argent, ou évitent un
 * déplacement pour rien. Pour une organisation, il en va de même des décisions
 * sur ses événements, de sa vérification et de ses retraits. Plutôt que de les
 * taire, l'écran les affiche comme toujours actifs.
 *
 * ── Les ventes ne s'affichent qu'à qui en a ──────────────────────────────────
 * « Ventes de mes événements » n'a de sens que pour une organisation. Le montrer
 * à un simple participant ajouterait une ligne qui ne fait rien.
 *
 * ── Enregistrement immédiat ────────────────────────────────────────────────
 * Pas de bouton « Enregistrer ». Un interrupteur qui bascule PUIS attend une
 * validation ment sur son état pendant l'attente, et sur mobile la moitié des
 * gens quittent la page avant. Chaque bascule part seule ; en cas d'échec,
 * l'interrupteur revient à sa position d'origine avec un message.
 */
export function PreferencesForm({
  initial,
  push,
  hasEmail,
  isOrganizer,
}: {
  initial: NotificationPreferencesState;
  push: PushStatus;
  hasEmail: boolean;
  /** Membre d'au moins une organisation : les réglages de vente s'affichent. */
  isOrganizer: boolean;
}) {
  const [state, setState] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle(key: keyof NotificationPreferencesState) {
    const previous = state;
    const next = { ...state, [key]: !state[key] };

    setState(next);
    setError(null);

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Un seul champ : le serveur ne touche qu'à ce qui a bougé.
        body: JSON.stringify({ [key]: next[key] }),
      });

      if (!response.ok) throw new Error();
    } catch {
      // Remettre l'interrupteur là où il était : afficher un état qu'on n'a pas
      // réussi à enregistrer serait le pire des deux mondes.
      setState(previous);
      setError('Le réglage n’a pas pu être enregistré. Réessaie dans un instant.');
    }
  }

  return (
    <Surface variant="panel" padding="comfortable" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold">Réglages</h2>
        <p className="text-body-s text-text-2">
          Nexa‑Kabi ne t’envoie que ce que tu as demandé. Tout arrive aussi ici, dans tes alertes.
        </p>
      </div>

      <SettingsGroup legend="Ce que je reçois">
        <SettingsRow
          label="Rappels avant mes événements"
          hint="Une semaine avant, la veille, et quelques heures avant."
          checked={state.eventReminders}
          onToggle={() => void toggle('eventReminders')}
        />
        <SettingsRow
          label="Nouveaux événements des organisateurs que je suis"
          hint="Dès qu’ils publient. On suit un organisateur depuis sa page."
          checked={state.organizerPublications}
          onToggle={() => void toggle('organizerPublications')}
        />
        <SettingsRow
          label="Sélection selon mes goûts"
          hint="Les nouveautés qui te correspondent, une fois par semaine au maximum."
          checked={state.recommendations}
          onToggle={() => void toggle('recommendations')}
        >
          <Link
            href="/mon-compte/pour-toi"
            className="mt-1 self-start text-micro font-semibold text-coral hover:text-coral-hover"
          >
            Voir ma sélection →
          </Link>
        </SettingsRow>
        {isOrganizer ? (
          <SettingsRow
            label="Ventes de mes événements"
            hint="Une notification à chaque vente (regroupées sur dix minutes), et quand un événement ou une catégorie est complet."
            checked={state.salesAlerts}
            onToggle={() => void toggle('salesAlerts')}
          />
        ) : null}
        <SettingsRow
          label="Paiements, remboursements et annulations"
          hint="Toujours actif : ces messages portent ton billet, ton argent, ou t’évitent un déplacement."
          checked
          locked
        />
        {isOrganizer ? (
          <SettingsRow
            label="Décisions sur mes événements, vérification et retraits"
            hint="Toujours actif : ils conditionnent ton travail et ton argent."
            checked
            locked
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        legend="Par quel moyen"
        description="En plus de tes alertes ici, choisis où tu veux être prévenu."
      >
        <PushRow push={push} onError={setError} />
        <SettingsRow
          label="E-mail"
          hint={
            hasEmail
              ? 'À l’adresse de ton compte.'
              : 'Ajoute une adresse e-mail dans « Mon compte » pour l’activer.'
          }
          checked={state.email && hasEmail}
          disabled={!hasEmail}
          onToggle={() => void toggle('email')}
        />
        <SettingsRow
          label="WhatsApp"
          hint="Au numéro de ton compte."
          checked={state.whatsapp}
          onToggle={() => void toggle('whatsapp')}
        />
        <SettingsRow
          label="SMS de secours"
          hint="Seulement pour ton billet et une annulation, si WhatsApp est coupé."
          checked={state.sms}
          onToggle={() => void toggle('sms')}
        />
      </SettingsGroup>

      {error ? (
        <p role="alert" className="text-body-s font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </Surface>
  );
}

/**
 * Notifications sur CET appareil.
 *
 * Contrairement aux autres lignes, l'état ne vit pas sur le serveur seul : il
 * dépend d'une autorisation donnée au navigateur, appareil par appareil. Le
 * téléphone et l'ordinateur d'une même personne ont chacun leur interrupteur.
 */
function PushRow({ push, onError }: { push: PushStatus; onError: (message: string) => void }) {
  const [support, setSupport] = React.useState<PushSupport | null>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [denied, setDenied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const detected = detectPushSupport();
    setSupport(detected);

    if (detected !== 'supported') return;

    setDenied(Notification.permission === 'denied');
    void currentPushSubscription()
      .then((subscription) => setEnabled(subscription !== null))
      .catch(() => setEnabled(false));
  }, []);

  async function toggle() {
    if (!push.publicKey) return;
    setBusy(true);

    try {
      if (enabled) {
        // Couper l'interrupteur est un REFUS : on le mémorise, sinon la
        // resynchronisation (`PushSync`) réabonnerait l'appareil au chargement
        // suivant, l'autorisation du navigateur étant toujours donnée.
        setPushOptOut(true);
        await unsubscribeThisDevice();
        setEnabled(false);
        return;
      }

      const outcome = await subscribeThisDevice(push.publicKey);

      if (outcome === 'subscribed') setEnabled(true);
      if (outcome === 'denied') setDenied(true);
      if (outcome === 'failed') {
        onError('Les notifications n’ont pas pu être activées. Réessaie dans un instant.');
      }
    } catch {
      onError('Les notifications n’ont pas pu être activées sur cet appareil.');
    } finally {
      setBusy(false);
    }
  }

  const unavailable = !push.publicKey;
  const otherDevices = Math.max(0, push.devices - (enabled ? 1 : 0));

  const hint = unavailable
    ? 'Bientôt disponible.'
    : support === 'install-first'
      ? 'Sur iPhone : ajoute d’abord Nexa‑Kabi à l’écran d’accueil (Partager → Sur l’écran d’accueil).'
      : support === 'unsupported'
        ? 'Ce navigateur ne sait pas recevoir de notifications.'
        : denied
          ? 'Autorisation refusée : réactive-la dans les réglages du site de ton navigateur.'
          : otherDevices > 0
            ? `Une notification, même application fermée. Déjà active sur ${otherDevices} autre${otherDevices > 1 ? 's' : ''} appareil${otherDevices > 1 ? 's' : ''}.`
            : 'Une notification sur ce téléphone ou cet ordinateur, même application fermée.';

  return (
    <SettingsRow
      label="Notifications sur cet appareil"
      hint={hint}
      checked={enabled}
      disabled={unavailable || support !== 'supported' || (denied && !enabled)}
      busy={busy || support === null}
      onToggle={() => void toggle()}
    />
  );
}
