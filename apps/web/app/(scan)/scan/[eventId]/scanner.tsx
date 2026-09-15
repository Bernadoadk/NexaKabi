'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  VERDICT_AUTO_DISMISS_MS,
  VERDICT_VIBRATION,
  admitsEntry,
  type CheckInDecision,
  type Manifest,
  type ManifestEntry,
} from '@nexakabi/contracts';
import { formatTimeSpaced } from '@nexakabi/utils';
import { cn } from '@nexakabi/ui';
import {
  enqueueScan,
  indexManifest,
  isLocallyScanned,
  loadManifest,
  saveManifest,
  pendingCount,
  type StoredManifest,
} from '@/lib/scan/db';
import { drainQueue } from '@/lib/scan/sync';
import { createDetector, openCamera, vibrate, type CameraStream } from '@/lib/scan/camera';
import { verifyOffline } from '@/lib/scan/verify';
import { Verdict } from './verdict';

/** Cadence de lecture. Dix images par seconde suffisent et ménagent la batterie. */
const SCAN_INTERVAL_MS = 100;

/** Un même code relu en boucle ne doit pas rejouer le verdict à l'infini. */
const SAME_CODE_COOLDOWN_MS = 2_000;

type Phase = 'loading' | 'ready' | 'error';

/**
 * Écrans C2 à C5 — le scanner et ses verdicts.
 *
 * ── Les règles non négociables du prototype ─────────────────────────────────
 *  · **Verdict en moins d'une seconde, zéro tap** si le billet est valide : le
 *    retour au scanner est automatique après 1,5 s.
 *  · **Le fond ENTIER change de couleur.** Un badge dans un coin ne se lit pas
 *    à bout de bras, dans la pénombre, avec une file derrière soi.
 *  · **Tout fonctionne hors ligne.** La vérification est locale, l'écriture
 *    aussi ; la synchronisation est un détail d'arrière-plan.
 *
 * Voir docs/PROJECT_ANALYSIS.md §6.4.
 */
export function Scanner({ eventId }: { eventId: string }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const cameraRef = React.useRef<CameraStream | null>(null);
  const manifestRef = React.useRef<ReadonlyMap<string, ManifestEntry>>(new Map());
  const storedRef = React.useRef<StoredManifest | null>(null);
  const lastCodeRef = React.useRef<{ code: string; at: number } | null>(null);
  const busyRef = React.useRef(false);

  const [phase, setPhase] = React.useState<Phase>('loading');
  const [error, setError] = React.useState<string | null>(null);
  const [manifest, setManifest] = React.useState<Manifest | null>(null);
  const [decision, setDecision] = React.useState<CheckInDecision | null>(null);
  const [scannedCount, setScannedCount] = React.useState(0);
  const [pending, setPending] = React.useState(0);
  const [online, setOnline] = React.useState(true);
  const [torchOn, setTorchOn] = React.useState(false);
  const [hasTorch, setHasTorch] = React.useState(false);

  // ── Carnet ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    void (async () => {
      let stored = await loadManifest(eventId);

      /**
       * Pas de carnet local, mais du réseau : on le télécharge ici plutôt que
       * de renvoyer à la liste. Un organisateur qui arrive par le bouton
       * « Ouvrir le scanner » de son espace n'est jamais passé par l'écran de
       * téléchargement — et n'a aucune raison d'y être envoyé.
       *
       * Hors ligne, le message reste : sans réseau, seul un carnet chargé
       * d'avance permet de scanner, et c'est ce qu'il faut dire.
       */
      if (!stored && navigator.onLine) {
        try {
          const response = await fetch(`/api/scan/${encodeURIComponent(eventId)}/manifest`);

          if (response.ok) {
            stored = await saveManifest((await response.json()) as Manifest);
          } else {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            setError(body?.message ?? 'Le carnet n’a pas pu être téléchargé.');
            setPhase('error');
            return;
          }
        } catch {
          // Réseau tombé entre-temps : le message hors ligne ci-dessous convient.
        }
      }

      if (!stored) {
        setError(
          'Aucun carnet pour cet événement. Reviens en arrière et télécharge-le pendant que tu as du réseau.',
        );
        setPhase('error');
        return;
      }

      storedRef.current = stored;
      manifestRef.current = indexManifest(stored.manifest);
      setManifest(stored.manifest);
      setPending(await pendingCount(eventId));
      setPhase('ready');
    })();
  }, [eventId]);

  // ── Caméra ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (phase !== 'ready') return;

    let cancelled = false;
    let timer: number | undefined;

    void (async () => {
      let camera: CameraStream;

      try {
        camera = await openCamera();
      } catch (cameraError) {
        if (!cancelled) {
          setError((cameraError as Error).message);
          setPhase('error');
        }
        return;
      }

      if (cancelled) {
        camera.stop();
        return;
      }

      cameraRef.current = camera;
      setHasTorch(camera.hasTorch);

      const video = videoRef.current;
      if (video) {
        video.srcObject = camera.stream;
        await video.play().catch(() => undefined);
      }

      const detector = await createDetector();

      const tick = async () => {
        if (cancelled || !videoRef.current || busyRef.current) return;

        const code = await detector.detect(videoRef.current).catch(() => null);
        if (!code || cancelled) return;

        // Un QR reste dans le champ pendant plusieurs images : sans ce délai,
        // le même billet déclencherait dix verdicts par seconde.
        const last = lastCodeRef.current;
        if (last && last.code === code && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) return;

        lastCodeRef.current = { code, at: Date.now() };
        await handleCode(code);
      };

      timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      cameraRef.current?.stop();
      cameraRef.current = null;
    };
    // `handleCode` lit des refs : le réinclure relancerait la caméra à chaque
    // scan, ce qui la ferait clignoter entre deux billets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /**
   * Libère la caméra dès que l'écran passe en arrière-plan.
   *
   * Une caméra laissée ouverte pendant une pause vide une batterie en une
   * heure — sur un événement qui en dure six.
   */
  React.useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        cameraRef.current?.stop();
        cameraRef.current = null;
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ── Réseau et synchronisation ─────────────────────────────────────────────
  React.useEffect(() => {
    setOnline(navigator.onLine);

    async function flush() {
      const report = await drainQueue(eventId);
      if (report.attempted > 0) setPending(report.remaining);
    }

    function goOnline() {
      setOnline(true);
      void flush();
    }

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', () => setOnline(false));

    // Tentative périodique : `online` ne se déclenche pas quand le réseau
    // revient sans changement d'interface, ce qui est fréquent en 3G.
    const timer = window.setInterval(() => {
      if (navigator.onLine) void flush();
    }, 20_000);

    void flush();

    return () => {
      window.removeEventListener('online', goOnline);
      window.clearInterval(timer);
    };
  }, [eventId]);

  /**
   * Traite un code lu.
   *
   * L'écriture locale précède TOUJOURS la synchronisation : le verdict ne
   * dépend jamais du réseau.
   */
  async function handleCode(code: string) {
    const stored = storedRef.current;
    if (!stored) return;

    busyRef.current = true;

    try {
      const parsedId = await verifyOffline({
        token: code,
        publicKey: stored.manifest.publicKey,
        eventShortCode: stored.manifest.eventShortCode,
        manifest: manifestRef.current,
        // Horloge corrigée : l'appareil peut être déréglé de plusieurs minutes.
        now: new Date(Date.now() + stored.clockOffsetMs),
        locallyScanned: false,
      });

      // Le contrôle « déjà scanné sur cet appareil » exige une lecture en base :
      // on ne le fait qu'une fois l'identifiant connu, pour ne pas ralentir les
      // codes illisibles.
      const verdict =
        parsedId.ticketPublicId && admitsEntry(parsedId.verdict)
          ? await withLocalDuplicate(parsedId, eventId, manifestRef.current)
          : parsedId;

      vibrate(VERDICT_VIBRATION[verdict.tone]);
      setDecision(verdict);

      if (admitsEntry(verdict.verdict) && verdict.ticketPublicId) {
        await enqueueScan({
          nonce: crypto.randomUUID(),
          eventId,
          ticketPublicId: verdict.ticketPublicId,
          // Le jeton signé part avec le scan : le serveur revérifie la
          // signature avant d'écrire. Le verdict affiché ici reste rendu hors
          // ligne — c'est ce qui le rend instantané — mais il ne fait pas
          // autorité sur ce qui est enregistré.
          qrToken: code,
          manualEntry: false,
          scannedAt: new Date(Date.now() + stored.clockOffsetMs).toISOString(),
          wasOffline: !navigator.onLine,
          overridden: false,
          attendeeName: verdict.entry?.n ?? 'Billet hors carnet',
          ticketSuffix: verdict.entry?.s ?? '',
          attempts: 0,
          createdAt: Date.now(),
        });

        setScannedCount((count) => count + 1);
        setPending(await pendingCount(eventId));

        if (navigator.onLine) {
          void drainQueue(eventId).then((report) => setPending(report.remaining));
        }
      }
    } finally {
      busyRef.current = false;
    }
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center gap-5 px-6">
        <h1 className="font-display text-h2 font-bold">Scanner indisponible</h1>
        <p className="text-body text-white/70">{error}</p>
        <Link
          href="/scan"
          className="rounded-button bg-white/12 px-5 py-3.5 text-center font-semibold"
        >
          Retour aux événements
        </Link>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh">
      {/* Flux caméra, plein écran. */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 size-full object-cover"
        aria-label="Vue de la caméra"
      />

      <div className="absolute inset-0 bg-ink/35" aria-hidden />

      {/* Cadre de visée. Le contrôleur y place le QR sans réfléchir. */}
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <div className="relative size-[62vw] max-w-[280px]">
          <Corner className="left-0 top-0 border-l-4 border-t-4" />
          <Corner className="right-0 top-0 border-r-4 border-t-4" />
          <Corner className="bottom-0 left-0 border-b-4 border-l-4" />
          <Corner className="bottom-0 right-0 border-b-4 border-r-4" />
          <span className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-coral" />
        </div>
      </div>

      {/* Barre haute : identité et état du réseau. */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <Link
          href="/scan"
          className="rounded-chip bg-ink/70 px-3 py-2 text-body-s font-semibold backdrop-blur"
        >
          ← Événements
        </Link>

        {!online ? (
          // Non bloquant, et c'est délibéré : le scanner fonctionne hors ligne.
          // Le bandeau informe, il n'alarme pas.
          <span className="rounded-chip bg-amber-400 px-3 py-2 text-micro font-bold text-ink">
            Hors ligne · le scan continue
          </span>
        ) : null}
      </div>

      {/* Barre basse : compteurs et outils. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-ink to-transparent p-4 pt-10">
        <div className="flex items-center justify-between gap-3">
          <Counter label="Entrées" value={scannedCount} />
          <Counter label="En attente" value={pending} tone={pending > 0 ? 'amber' : 'neutral'} />
          <Counter label="Carnet" value={manifest?.entries.length ?? 0} tone="neutral" />
        </div>

        <div className="flex gap-2">
          {hasTorch ? (
            <button
              type="button"
              onClick={() => {
                const next = !torchOn;
                setTorchOn(next);
                void cameraRef.current?.setTorch(next);
              }}
              className={cn(
                'min-h-[var(--tap-primary)] flex-1 rounded-button font-bold transition',
                torchOn ? 'bg-white text-ink' : 'bg-white/12 text-white',
              )}
            >
              {torchOn ? 'Éteindre' : 'Torche'}
            </button>
          ) : null}

          <Link
            href={`/scan/${eventId}/recherche`}
            className="grid min-h-[var(--tap-primary)] flex-1 place-items-center rounded-button bg-white/12 font-bold"
          >
            Recherche
          </Link>

          <Link
            href={`/scan/${eventId}/historique`}
            className="grid min-h-[var(--tap-primary)] flex-1 place-items-center rounded-button bg-white/12 font-bold"
          >
            Historique
          </Link>
        </div>
      </div>

      {decision ? (
        <Verdict
          decision={decision}
          onDismiss={() => setDecision(null)}
          autoDismissMs={decision.tone === 'green' ? VERDICT_AUTO_DISMISS_MS : undefined}
          firstSeenLabel={decision.firstSeenAt ? formatTimeSpaced(decision.firstSeenAt) : undefined}
        />
      ) : null}
    </main>
  );
}

/**
 * Requalifie un billet déjà scanné sur CET appareil.
 *
 * Le carnet ne le sait pas : il date d'avant. Sans ce contrôle, deux scans
 * successifs du même billet passeraient tous deux hors ligne.
 */
async function withLocalDuplicate(
  decision: CheckInDecision,
  eventId: string,
  index: ReadonlyMap<string, ManifestEntry>,
): Promise<CheckInDecision> {
  if (!decision.ticketPublicId) return decision;
  if (!(await isLocallyScanned(eventId, decision.ticketPublicId))) return decision;

  const { decideCheckIn } = await import('@nexakabi/contracts');

  return decideCheckIn({
    signature: 'valid',
    ticketPublicId: decision.ticketPublicId,
    entry: index.get(decision.ticketPublicId),
    locallyScanned: true,
  });
}

function Corner({ className }: { className: string }) {
  return <span className={cn('absolute size-8 border-white/90', className)} />;
}

function Counter({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'amber';
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span
        className={cn(
          'tabular font-display text-[24px] font-bold',
          tone === 'amber' ? 'text-amber-400' : 'text-white',
        )}
      >
        {value}
      </span>
      <span className="text-micro text-white/50">{label}</span>
    </div>
  );
}
