/**
 * Mastering du son d'une vidéo rendue : le volume est ramené à la norme des
 * plateformes (−14 LUFS intégrés, YouTube, Reels, TikTok) et les crêtes sont
 * tenues sous −1,5 dBTP. L'image est copiée telle quelle.
 *
 * Deux passes du filtre loudnorm (EBU R128) de l'ffmpeg fourni avec Remotion :
 * mesure, puis correction. Lancé tout seul par `npm run render` ; à la main :
 *
 *   npm run master -- out/nexakabi-16x9.mp4 [autre.mp4…]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';

const TARGET = 'I=-14:TP=-1.5:LRA=11';

/** Lance l'ffmpeg de Remotion (`npx remotion ffmpeg`), sur tous les systèmes. */
function ffmpeg(args) {
  const quote = (arg) => (/[\s"'&|<>^]/.test(arg) ? `"${arg}"` : arg);
  const command = ['npx', 'remotion', 'ffmpeg', '-hide_banner', '-nostats', ...args].map(quote);
  const result = spawnSync(command.join(' '), { encoding: 'utf8', shell: true });
  return { ok: result.status === 0, log: `${result.stderr ?? ''}${result.stdout ?? ''}` };
}

/** Dernier rapport JSON imprimé par loudnorm. */
function report(log) {
  const start = log.lastIndexOf('{');
  const end = log.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`rapport loudnorm introuvable :\n${log}`);
  return JSON.parse(log.slice(start, end + 1));
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage : npm run master -- out/video.mp4 [autre.mp4…]');
  process.exit(1);
}

for (const file of files) {
  if (!existsSync(file)) {
    console.error(`${file} : fichier introuvable.`);
    process.exitCode = 1;
    continue;
  }

  const measure = ffmpeg([
    '-i',
    file,
    '-map',
    '0:a:0',
    '-af',
    `loudnorm=${TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  if (!measure.ok) {
    console.log(`${file} : pas de piste son, rien à faire.`);
    continue;
  }
  const m = report(measure.log);

  const temp = file.replace(/\.mp4$/i, '.master.tmp.mp4');
  const filter = [
    `loudnorm=${TARGET}`,
    `measured_I=${m.input_i}`,
    `measured_TP=${m.input_tp}`,
    `measured_LRA=${m.input_lra}`,
    `measured_thresh=${m.input_thresh}`,
    `offset=${m.target_offset}`,
    'linear=true',
    'print_format=json',
  ].join(':');
  const apply = ffmpeg([
    '-y',
    '-i',
    file,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'copy',
    '-af',
    `${filter},aresample=48000`,
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-movflags',
    '+faststart',
    temp,
  ]);
  if (!apply.ok) {
    rmSync(temp, { force: true });
    console.error(`${file} : le mastering a échoué.\n${apply.log}`);
    process.exitCode = 1;
    continue;
  }
  const out = report(apply.log);
  renameSync(temp, file);
  console.log(
    `${file} : ${m.input_i} → ${out.output_i} LUFS, crête ${out.output_tp} dBTP` +
      (out.normalization_type === 'dynamic' ? ' (crêtes limitées)' : ''),
  );
}
