'use client';

import * as React from 'react';
import { Camera, CameraOff, RotateCcw, Smartphone } from 'lucide-react';
import { Alert, Button, ProgressRing, Spinner, cn } from '@nexakabi/ui';

/**
 * La photo du visage, prise en direct.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Pourquoi la galerie est fermée
 * ═══════════════════════════════════════════════════════════════════════════
 * Une photo choisie dans la pellicule ne prouve rien. Elle peut dater de trois
 * ans, venir d'un réseau social, appartenir à quelqu'un d'autre — c'est
 * exactement le geste qu'un usurpateur ferait. Tout l'intérêt de cette étape
 * tient à ce qu'elle soit prise MAINTENANT, par la personne qui tient le
 * téléphone.
 *
 * Techniquement : l'image sort du flux de la caméra, dessinée dans un canevas.
 * Aucun `<input type="file">` n'est jamais monté ici, donc aucun sélecteur de
 * fichiers ne peut s'ouvrir, même en bricolant le DOM.
 *
 * ── Le consentement vient AVANT l'appareil photo ──────────────────────────
 * La caméra ne s'allume pas tant que `allowed` est faux. Ce n'est pas une
 * précaution d'affichage : sous le Code du numérique béninois, l'image du
 * visage est une donnée biométrique, et son traitement demande un consentement
 * exprès. Un consentement recueilli après coup, une fois la photo prise, n'en
 * est pas un.
 *
 * La case elle-même vit un cran plus haut, dans `RequestedDocuments` : elle
 * couvre TOUTES les pièces personnelles du dossier — carte d'identité
 * comprise — et une seule décision vaut mieux que trois cases identiques
 * qu'on coche sans lire. Le texte exact est dans les contrats partagés, sous
 * `IDENTITY_CONSENT`, et la version acceptée part avec chaque fichier.
 *
 * ── Ce qu'on ne fait pas ──────────────────────────────────────────────────
 * Aucune détection de visage, aucun gabarit biométrique, aucun rapprochement
 * automatique avec la pièce d'identité. Un modérateur regarde les deux images
 * et décide. Un traitement d'identification automatisée ferait basculer toute
 * la plateforme sous le régime de l'autorisation préalable de l'APDP ; ce
 * n'est ni nécessaire ni souhaitable pour trancher quelques dossiers par
 * semaine.
 */

type Stage = 'idle' | 'starting' | 'live' | 'countdown' | 'review' | 'blocked';

/** Le temps qu'il faut pour poser son téléphone et se recadrer. */
const COUNTDOWN_SECONDS = 3;

/** Côté de l'image produite. Assez pour un visage, assez peu pour un forfait. */
const OUTPUT_SIZE = 960;

export function SelfieCapture({
  allowed,
  onCapture,
  uploading = false,
  progress,
  error,
}: {
  /** Le consentement a été donné. Faux : l'appareil photo reste éteint. */
  allowed: boolean;
  onCapture: (file: File) => void;
  uploading?: boolean;
  progress?: number;
  error?: string | null;
}) {
  const [stage, setStage] = React.useState<Stage>('idle');
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [remaining, setRemaining] = React.useState(COUNTDOWN_SECONDS);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const stopCamera = React.useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
  }, []);

  // Une caméra laissée ouverte vide une batterie en une heure, et la diode
  // reste allumée : partir de l'écran doit l'éteindre, sans exception.
  React.useEffect(() => stopCamera, [stopCamera]);

  async function startCamera() {
    setCameraError(null);
    setStage('starting');

    const media = navigator.mediaDevices;

    if (!media?.getUserMedia) {
      setCameraError(
        'Ce navigateur ne donne pas accès à l’appareil photo. Ouvre cette page depuis Chrome, ' +
          'ou termine cette étape depuis ton téléphone.',
      );
      setStage('blocked');
      return;
    }

    try {
      const stream = await media.getUserMedia({
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 1280 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      setStage('live');
    } catch (cause) {
      const name = (cause as { name?: string }).name;

      setCameraError(
        name === 'NotAllowedError'
          ? 'L’accès à l’appareil photo a été refusé. Autorise-le dans les réglages du navigateur, puis recharge la page.'
          : name === 'NotFoundError'
            ? 'Aucun appareil photo n’a été détecté. Reprends cette étape depuis ton téléphone.'
            : 'L’appareil photo n’a pas pu démarrer. Ferme les autres applications qui l’utilisent, puis réessaie.',
      );
      setStage('blocked');
    }
  }

  /** Compte à rebours : le temps de poser le téléphone et de se recadrer. */
  function beginCountdown() {
    setRemaining(COUNTDOWN_SECONDS);
    setStage('countdown');
  }

  React.useEffect(() => {
    if (stage !== 'countdown') return;

    if (remaining <= 0) {
      capture();
      return;
    }

    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
    // `capture` lit des références, pas de l'état : la réinclure ferait
    // repartir le compte à rebours à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, remaining]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const side = Math.min(video.videoWidth, video.videoHeight);
    if (side === 0) return;

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;

    const context = canvas.getContext('2d');
    if (!context) return;

    // Carré centré : le cadre ovale affiché à l'écran promet un portrait, une
    // image en 16/9 en livrerait un autre.
    context.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    // L'aperçu est en miroir — c'est ce qu'on attend d'un selfie — mais
    // l'image envoyée ne l'est PAS : le modérateur la compare à une pièce
    // d'identité, et un visage retourné complique cette lecture pour rien.
    stopCamera();
    setStage('review');
  }

  function retake() {
    setStage('idle');
    void startCamera();
  }

  function send() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.9,
    );
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3.5">
      {/* Le canevas porte l'image capturée : il EST l'aperçu, ce qui évite de
          fabriquer une URL `blob:` pour une image qu'on ne garde pas. */}
      <div
        className={cn(
          'relative aspect-square w-full max-w-[380px] overflow-hidden rounded-card bg-ink-900',
          stage === 'idle' && 'hidden',
        )}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn(
            'size-full object-cover -scale-x-100',
            stage !== 'live' && stage !== 'countdown' && stage !== 'starting' && 'hidden',
          )}
        />

        <canvas
          ref={canvasRef}
          className={cn('size-full object-cover', stage !== 'review' && 'hidden')}
        />

        {stage === 'starting' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900">
            <Spinner size={30} tone="on-ink" />
            <p className="text-body-s font-semibold text-white/80">Ouverture de l’appareil…</p>
          </div>
        ) : null}

        {stage === 'blocked' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <CameraOff size={30} className="text-white/60" aria-hidden />
            <p className="text-body-s text-white/80">
              L’appareil photo n’est pas disponible sur cet appareil.
            </p>
          </div>
        ) : null}

        {/* Le guide ovale : un trou dans un voile sombre. C'est ce qui obtient
            un visage centré et assez grand, sans avoir à l'expliquer. */}
        {stage === 'live' || stage === 'countdown' ? (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-[46%] size-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-white/70"
              style={{ boxShadow: '0 0 0 9999px rgb(11 9 24 / 0.55)' }}
            />
            <p className="absolute inset-x-0 bottom-3 text-center text-micro font-semibold text-white/85">
              {stage === 'countdown'
                ? 'Ne bouge plus.'
                : 'Place ton visage dans l’ovale, en pleine lumière.'}
            </p>
          </>
        ) : null}

        {stage === 'countdown' ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <ProgressRing
              value={(COUNTDOWN_SECONDS - remaining) / COUNTDOWN_SECONDS}
              size={86}
              thickness={4}
            >
              <span className="tabular font-display text-[34px] font-extrabold text-white">
                {remaining}
              </span>
            </ProgressRing>
          </div>
        ) : null}

        {uploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink-900/80">
            <ProgressRing value={progress} size={72} thickness={4}>
              <span className="tabular text-body-s font-bold text-white">
                {progress === undefined ? '' : `${Math.round(progress * 100)} %`}
              </span>
            </ProgressRing>
            <p className="text-body-s font-semibold text-white/85">Envoi de la photo…</p>
          </div>
        ) : null}
      </div>

      {/* ── L'appareil photo, une fois l'accord donné plus haut ───────────── */}
      {stage === 'idle' ? (
        <Button
          type="button"
          variant="ink"
          size="mobile"
          disabled={!allowed}
          onClick={() => void startCamera()}
          className="self-start"
        >
          <Camera size={17} aria-hidden />
          Allumer l’appareil photo
        </Button>
      ) : null}

      {/* ── Prise ──────────────────────────────────────────────────────────── */}
      {stage === 'live' ? (
        <Button
          type="button"
          variant="primary"
          size="primary"
          block
          className="max-w-[380px]"
          onClick={beginCountdown}
        >
          <Camera size={18} aria-hidden />
          Prendre la photo
        </Button>
      ) : null}

      {stage === 'countdown' ? (
        <Button
          type="button"
          variant="secondary"
          size="mobile"
          className="max-w-[380px]"
          block
          onClick={() => setStage('live')}
        >
          Annuler
        </Button>
      ) : null}

      {/* ── Relecture ──────────────────────────────────────────────────────── */}
      {stage === 'review' ? (
        <div className="flex max-w-[380px] flex-col gap-2">
          <p className="text-micro text-text-2">
            Ton visage est-il net, entier, et bien éclairé ? Si tu hésites, reprends : une photo
            floue fait repartir le dossier pour deux heures de plus.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" size="mobile" onClick={retake}>
              <RotateCcw size={16} aria-hidden />
              Reprendre
            </Button>
            <Button
              type="button"
              variant="primary"
              size="mobile"
              loading={uploading}
              loadingLabel="Envoi…"
              onClick={send}
            >
              Envoyer
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Impasse ────────────────────────────────────────────────────────── */}
      {stage === 'blocked' ? (
        <div className="flex max-w-[380px] flex-col gap-2.5">
          <Alert tone="warning" title="Appareil photo indisponible">
            {cameraError}
          </Alert>
          <p className="flex items-start gap-2 text-micro text-text-2">
            <Smartphone size={14} className="mt-px shrink-0" aria-hidden />
            <span>
              Cette photo doit être prise en direct : il n’est pas possible d’en choisir une dans
              la galerie. Ouvre cette page sur ton téléphone pour la terminer.
            </span>
          </p>
          <Button
            type="button"
            variant="secondary"
            size="mobile"
            className="self-start"
            onClick={() => void startCamera()}
          >
            <RotateCcw size={16} aria-hidden />
            Réessayer
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" title="Envoi impossible">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
