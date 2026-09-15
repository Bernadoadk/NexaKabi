/**
 * Lecture des QR par la caméra.
 *
 * ── Contraintes de terrain ──────────────────────────────────────────────────
 * Android d'entrée de gamme, de nuit, écran à 40 % de luminosité, file
 * d'attente. Trois décisions en découlent :
 *
 *  · **640 × 480**, pas 1080p. Un QR de 176 px se décode largement à cette
 *    résolution, qui consomme environ quatre fois moins de CPU — donc moins de
 *    batterie et moins de chauffe sur un appareil sans dissipation.
 *  · **`BarcodeDetector` natif quand il existe** : décodage matériel,
 *    quelques millisecondes, zéro octet téléchargé. Sinon ZXing en WASM,
 *    chargé dynamiquement — 250 Ko payés seulement par ceux qui en ont besoin.
 *  · **Caméra libérée dès que l'écran passe en arrière-plan.** Une caméra
 *    laissée ouverte pendant une pause vide une batterie en une heure.
 *
 * Voir docs/TECHNICAL_ARCHITECTURE.md §8.4.
 */

export type DetectorSource = 'native' | 'zxing';

export interface QrDetector {
  readonly source: DetectorSource;
  /** Lit une image vidéo. Renvoie le contenu du QR, ou `null`. */
  detect(video: HTMLVideoElement): Promise<string | null>;
  dispose(): void;
}

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

/**
 * Construit le meilleur détecteur disponible.
 *
 * La détection porte sur le SUPPORT DU FORMAT, pas sur la seule présence de
 * l'API : certains navigateurs exposent `BarcodeDetector` sans savoir lire les
 * QR — seulement des codes-barres linéaires.
 */
export async function createDetector(): Promise<QrDetector> {
  const Native = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;

  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? [];

      if (formats.includes('qr_code')) {
        const detector = new Native({ formats: ['qr_code'] });

        return {
          source: 'native',
          detect: async (video) => {
            const codes = await detector.detect(video);
            return codes[0]?.rawValue ?? null;
          },
          dispose: () => undefined,
        };
      }
    } catch {
      // API présente mais inutilisable : on bascule sans bruit.
    }
  }

  return createZxingDetector();
}

/** Repli logiciel, chargé uniquement quand le natif manque. */
async function createZxingDetector(): Promise<QrDetector> {
  const { BrowserQRCodeReader } = await import('@zxing/browser');
  const reader = new BrowserQRCodeReader();

  // Réutiliser un canvas évite d'en allouer un par image : à dix images par
  // seconde, cela ferait travailler le ramasse-miettes en continu.
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  return {
    source: 'zxing',
    detect: async (video) => {
      if (!context || video.videoWidth === 0) return null;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);

      try {
        return reader.decodeFromCanvas(canvas).getText();
      } catch {
        // Aucun code dans l'image : le cas nominal entre deux billets.
        return null;
      }
    },
    dispose: () => canvas.remove(),
  };
}

export interface CameraStream {
  readonly stream: MediaStream;
  /** La caméra sait-elle allumer sa torche ? */
  readonly hasTorch: boolean;
  setTorch(on: boolean): Promise<void>;
  stop(): void;
}

/**
 * Ouvre la caméra arrière.
 *
 * @throws une erreur dont le message est destiné au contrôleur, en français.
 */
export async function openCamera(): Promise<CameraStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Ce navigateur ne donne pas accès à la caméra. Ouvre le scanner depuis Chrome.',
    );
  }

  let stream: MediaStream;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
  } catch (error) {
    const name = (error as { name?: string }).name;

    if (name === 'NotAllowedError') {
      throw new Error(
        'La caméra a été refusée. Autorise-la dans les réglages du navigateur, puis recharge.',
      );
    }

    if (name === 'NotFoundError') {
      throw new Error('Aucune caméra détectée sur cet appareil.');
    }

    throw new Error('La caméra n’a pas pu démarrer. Ferme les autres applications et réessaie.');
  }

  const track = stream.getVideoTracks()[0];
  const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };

  return {
    stream,
    hasTorch: Boolean(capabilities.torch),
    setTorch: async (on: boolean) => {
      // `torch` ne figure pas dans le typage standard des contraintes média :
      // c'est une extension, largement implémentée sur Android mais absente de
      // la spécification. Le double transtypage l'assume explicitement plutôt
      // que d'élargir le type global de l'application.
      await track?.applyConstraints({
        advanced: [{ torch: on }],
      } as unknown as MediaTrackConstraints);
    },
    stop: () => {
      for (const t of stream.getTracks()) t.stop();
    },
  };
}

/** Vibration distincte par verdict. Ignorée quand l'appareil ne vibre pas. */
export function vibrate(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    // Certains navigateurs lèvent au lieu de renvoyer `false`.
  }
}
