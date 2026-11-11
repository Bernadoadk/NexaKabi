import { getAudioData, getAudioDurationInSeconds } from '@remotion/media-utils';
import { staticFile } from 'remotion';
import { config } from '../../config';
import type { VideoConfig } from '../../config.types';

/** Une phrase de voix off trouvée dans `public/`. */
export interface VoiceClip {
  /** Chemin dans `public/`, extension comprise. */
  file: string;
  /** Début, en images depuis le début de la vidéo. */
  from: number;
  durationInFrames: number;
  /** Gain qui amène la phrase au niveau commun (1 = inchangé). */
  gain: number;
}

/** Formats acceptés pour la voix off. */
const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'opus', 'flac', 'webm'];

/**
 * Niveau commun des phrases : moyenne efficace des passages parlés, en dB
 * pleine échelle dans le mixage. La voix passe ainsi une dizaine de dB
 * au-dessus de la musique baissée.
 */
const SPEECH_LEVEL = -17;
/** Gain maximal (+18 dB) : au-delà, on remonterait surtout le bruit de fond. */
const MAX_GAIN = 8;
/** Crête maximale d'une phrase après gain (−3 dB) : jamais de saturation. */
const MAX_PEAK = 0.7;

/** Une phrase prévue dans une config (`voiceover.lines`). */
export type VoiceLine = VideoConfig['voiceover']['lines'][number];

/**
 * Les phrases de `config.voiceover.lines` dont le fichier existe, quelle que
 * soit son extension, avec leur durée et leur gain d'égalisation.
 *
 * `options` : les phrases d'une autre vidéo du projet, et le fichier de
 * config à citer dans les avertissements.
 */
export async function findVoices(
  files: string[],
  videoSeconds: number,
  options: { lines?: VoiceLine[]; normalize?: boolean; configFile?: string } = {},
): Promise<VoiceClip[]> {
  const {
    lines = config.voiceover.lines,
    normalize = config.voiceover.normalize,
    configFile = 'src/config.ts',
  } = options;
  const clips = await Promise.all(
    lines.map(async (line, index) => {
      const file = files.find((name) => {
        const dot = name.lastIndexOf('.');
        return (
          dot > 0 &&
          name.slice(0, dot) === line.file &&
          AUDIO_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
        );
      });
      if (!file) return null;

      const limit = Math.min(line.end ?? Infinity, lines[index + 1]?.at ?? videoSeconds);
      const { seconds, gain } = await inspect(file, limit - line.at, normalize);
      if (line.at + seconds > limit + 0.05) {
        console.warn(
          `Voix off : ${file} dure ${seconds.toFixed(1)} s, soit ${(line.at + seconds - limit).toFixed(1)} s de trop (à finir avant ${limit.toFixed(1)} s). Parlez un peu plus vite ou ajustez « at » dans ${configFile}.`,
        );
      }
      const clip: VoiceClip = {
        file,
        from: Math.round(line.at * config.fps),
        durationInFrames: Math.max(1, Math.ceil(seconds * config.fps)),
        gain,
      };
      return clip;
    }),
  );
  return clips.filter((clip): clip is VoiceClip => clip !== null);
}

/** Durée d'un fichier et gain qui l'amène au niveau commun. */
async function inspect(
  file: string,
  room: number,
  normalize: boolean,
): Promise<{ seconds: number; gain: number }> {
  const src = staticFile(file);
  try {
    const audio = await getAudioData(src);
    if (!normalize) return { seconds: audio.durationInSeconds, gain: 1 };
    const { level, peak } = measure(audio.channelWaveforms, audio.sampleRate);
    // Au rendu, une piste mono est répartie sur les deux canaux à −3 dB.
    const spread = audio.numberOfChannels === 1 ? Math.SQRT1_2 : 1;
    const gain = Math.min(
      10 ** ((SPEECH_LEVEL - level) / 20) / spread,
      MAX_PEAK / Math.max(peak * spread, 1e-4),
      MAX_GAIN,
    );
    return { seconds: audio.durationInSeconds, gain };
  } catch {
    // Décodage impossible : la phrase est jouée telle quelle.
    try {
      return { seconds: await getAudioDurationInSeconds(src), gain: 1 };
    } catch {
      const seconds = Math.max(0.5, room - 0.3);
      console.warn(`Voix off : ${file} illisible, ${seconds.toFixed(1)} s supposées.`);
      return { seconds, gain: 1 };
    }
  }
}

/**
 * Niveau des passages parlés (moyenne efficace en dB, silences et souffles
 * exclus) et crête d'un enregistrement.
 */
function measure(channels: Float32Array[], sampleRate: number) {
  const block = Math.round(sampleRate * 0.05);
  const energies: number[] = [];
  let peak = 0;
  for (let start = 0; start + block <= channels[0].length; start += block) {
    let sum = 0;
    for (const channel of channels) {
      for (let i = start; i < start + block; i++) {
        sum += channel[i] * channel[i];
        peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    energies.push(sum / (block * channels.length));
  }
  const loudest = energies.reduce((max, energy) => Math.max(max, energy), 0);
  // Parole : au-dessus de −50 dB et à moins de 25 dB du passage le plus fort.
  const spoken = energies.filter((energy) => energy > 1e-5 && energy > loudest / 316);
  const mean = spoken.reduce((total, energy) => total + energy, 0) / Math.max(1, spoken.length);
  return { level: 10 * Math.log10(mean || 1e-10), peak };
}
