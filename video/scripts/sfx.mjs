/**
 * Effets sonores de la vidéo, synthétisés de toutes pièces.
 *
 * Aucun échantillon externe : chaque son est calculé (bruit filtré, sinus,
 * enveloppes), puis écrit en WAV 48 kHz dans `public/audio/sfx/`. Les sons
 * sont donc originaux, libres de droits, et se régénèrent à l'identique :
 *
 *   npm run sfx
 *
 * Les volumes de chaque utilisation se règlent dans les scènes (`<Sfx>`), le
 * volume général dans `src/config.ts` (`sfx.volume`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio', 'sfx');
const TAU = Math.PI * 2;

// ─────────────────────────────────────────────────────────────────────────────
// Outils
// ─────────────────────────────────────────────────────────────────────────────

/** Bruit blanc déterministe (xorshift) : même graine, même son. */
function noise(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 4294967296) * 2 - 1;
  };
}

const samples = (seconds) => new Float32Array(Math.round(seconds * SR));

/** Filtre biquadratique (formules RBJ), réglable en cours de route. */
class Biquad {
  constructor() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.b0 = 1;
    this.b1 = this.b2 = this.a1 = this.a2 = 0;
  }

  set(type, frequency, q = 0.707) {
    const w = (TAU * Math.min(frequency, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      // Passe-bande, gain de crête de 0 dB.
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }

  run(x) {
    const y =
      this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Réverbération de Schroeder : quatre peignes amortis, deux passe-tout. */
function reverb(input, { mix = 0.2, feedback = 0.6, tail = 0.6 } = {}) {
  const out = new Float32Array(input.length + Math.round(tail * SR));
  const scale = SR / 44100;
  const combs = [1557, 1617, 1491, 1422].map((delay) => ({
    buffer: new Float32Array(Math.round(delay * scale)),
    index: 0,
    store: 0,
  }));
  const allpasses = [225, 556].map((delay) => ({
    buffer: new Float32Array(Math.round(delay * scale)),
    index: 0,
  }));
  for (let n = 0; n < out.length; n++) {
    const x = n < input.length ? input[n] : 0;
    let wet = 0;
    for (const comb of combs) {
      const y = comb.buffer[comb.index];
      comb.store = y * 0.75 + comb.store * 0.25;
      comb.buffer[comb.index] = x + comb.store * feedback;
      comb.index = (comb.index + 1) % comb.buffer.length;
      wet += y;
    }
    wet /= combs.length;
    for (const pass of allpasses) {
      const delayed = pass.buffer[pass.index];
      const y = -0.5 * wet + delayed;
      pass.buffer[pass.index] = wet + 0.5 * y;
      pass.index = (pass.index + 1) % pass.buffer.length;
      wet = y;
    }
    out[n] = x * (1 - mix) + wet * mix * 2.5;
  }
  return out;
}

/** Ramène la crête à `peak`, adoucit les bords (pas de clic au début ni à la fin). */
function finish(buffer, { peak = 0.8, fadeIn = 0.001, fadeOut = 0.012 } = {}) {
  let max = 0;
  for (const value of buffer) max = Math.max(max, Math.abs(value));
  const gain = max > 0 ? peak / max : 1;
  const inLength = Math.round(fadeIn * SR);
  const outLength = Math.round(fadeOut * SR);
  for (let n = 0; n < buffer.length; n++) {
    let edge = 1;
    if (n < inLength) edge = n / inLength;
    const fromEnd = buffer.length - 1 - n;
    if (fromEnd < outLength) edge = Math.min(edge, fromEnd / outLength);
    buffer[n] *= gain * edge;
  }
  return buffer;
}

function write(name, buffer) {
  const data = Buffer.alloc(buffer.length * 2);
  for (let n = 0; n < buffer.length; n++) {
    const value = Math.max(-1, Math.min(1, buffer[n]));
    data.writeInt16LE(Math.round(value * 32767), n * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(join(OUT, `${name}.wav`), Buffer.concat([header, data]));
  console.log(`  ${name}.wav  ${(buffer.length / SR).toFixed(2)} s`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Les sons
// ─────────────────────────────────────────────────────────────────────────────

/** Souffle : bruit dont la bande monte puis redescend. Transitions de scène. */
function whoosh({ seconds = 0.65, low = 320, high = 4200, apex = 0.45, seed = 7 } = {}) {
  const out = samples(seconds);
  const random = noise(seed);
  const band = new Biquad();
  const air = new Biquad().set('lowpass', 520, 0.7);
  for (let n = 0; n < out.length; n++) {
    const t = n / out.length;
    const rise = t < apex ? t / apex : 1 - (t - apex) / (1 - apex);
    if (n % 16 === 0)
      band.set('bandpass', low * Math.pow(high / low, Math.sin((rise * Math.PI) / 2)), 0.85);
    const level =
      t < apex
        ? Math.pow(Math.sin(((t / apex) * Math.PI) / 2), 2)
        : Math.pow(Math.cos((((t - apex) / (1 - apex)) * Math.PI) / 2), 1.5);
    const x = random();
    out[n] = (band.run(x) + air.run(x) * 0.22) * level;
  }
  return finish(out, { peak: 0.75 });
}

/** Clic d'interface : petite attaque nette, corps bref. */
function tap() {
  const out = samples(0.09);
  const random = noise(3);
  const high = new Biquad().set('highpass', 2600, 0.7);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const click = high.run(random()) * Math.exp(-t / 0.0018);
    const tone =
      Math.sin(TAU * 2100 * t) * Math.exp(-t / 0.013) * 0.6 +
      Math.sin(TAU * 3150 * t) * Math.exp(-t / 0.008) * 0.22;
    const body = Math.sin(TAU * 420 * t) * Math.exp(-t / 0.018) * 0.35;
    out[n] = click * 0.6 + tone + body;
  }
  return finish(out, { peak: 0.7 });
}

/** « Pop » : sinus qui chute vite. Badges, épingles, logos qui apparaissent. */
function pop({ base = 360, sweep = 760 } = {}) {
  const out = samples(0.18);
  let phase = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const frequency = base + sweep * Math.exp(-t / 0.018);
    phase += (TAU * frequency) / SR;
    const level = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / 0.042);
    out[n] = (Math.sin(phase) + Math.sin(2 * phase) * 0.18) * level;
  }
  return finish(out, { peak: 0.75 });
}

/** « Tic » : coche d'une liste, étape franchie. */
function tick() {
  const out = samples(0.06);
  const random = noise(29);
  const high = new Biquad().set('highpass', 4000, 0.7);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    out[n] =
      Math.sin(TAU * 2900 * t) * Math.exp(-t / 0.006) +
      Math.sin(TAU * 5200 * t) * Math.exp(-t / 0.0035) * 0.3 +
      high.run(random()) * Math.exp(-t / 0.0012) * 0.3;
  }
  return finish(out, { peak: 0.65 });
}

/** Note de carillon : quelques partiels, déclin exponentiel. */
function bell(out, start, frequency, { decay = 0.32, level = 1 } = {}) {
  const partials = [
    [1, 1, 1],
    [2.01, 0.24, 0.6],
    [3.03, 0.08, 0.4],
  ];
  const first = Math.round(start * SR);
  for (let n = first; n < out.length; n++) {
    const t = (n - first) / SR;
    const attack = 1 - Math.exp(-t / 0.002);
    let value = 0;
    for (const [ratio, amplitude, speed] of partials) {
      value += Math.sin(TAU * frequency * ratio * t) * amplitude * Math.exp(-t / (decay * speed));
    }
    out[n] += value * attack * level;
  }
}

/** « Ding » de réussite : deux notes montantes (do, sol) et une queue de réverbération. */
function ding() {
  const out = samples(1.2);
  bell(out, 0, 1046.5);
  bell(out, 0.085, 1567.98, { level: 0.9 });
  return finish(reverb(out, { mix: 0.22, feedback: 0.62, tail: 0.6 }), {
    peak: 0.72,
    fadeOut: 0.2,
  });
}

/** Bip de lecteur de code, franc et court. */
function beep() {
  const out = samples(0.16);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const level = Math.min(1, t / 0.004) * Math.min(1, Math.max(0, (0.15 - t) / 0.03));
    const phase = TAU * 1800 * t;
    out[n] = (Math.sin(phase) + Math.sin(3 * phase) * 0.16) * level;
  }
  return finish(out, { peak: 0.6 });
}

/** Validation : deux notes vives (mi, la), plus brèves que le « ding ». */
function valid() {
  const out = samples(0.45);
  bell(out, 0, 1318.5, { decay: 0.11 });
  bell(out, 0.07, 1760, { decay: 0.13, level: 0.95 });
  return finish(reverb(out, { mix: 0.15, feedback: 0.5, tail: 0.3 }), { peak: 0.7, fadeOut: 0.12 });
}

/** Impact grave : l'arrivée du logo. */
function impact() {
  const out = samples(1.1);
  const random = noise(41);
  const low = new Biquad().set('lowpass', 1100, 0.7);
  let phase = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const frequency = 44 + 80 * Math.exp(-t / 0.075);
    phase += (TAU * frequency) / SR;
    const sub = Math.sin(phase) * Math.exp(-t / 0.42);
    const thud = Math.sin(TAU * 170 * t) * Math.exp(-t / 0.05) * 0.4;
    const punch = low.run(random()) * Math.exp(-t / 0.011) * 0.9;
    out[n] = Math.tanh(1.5 * (sub + thud + punch)) / Math.tanh(1.5);
  }
  return finish(reverb(out, { mix: 0.16, feedback: 0.55, tail: 0.5 }), {
    peak: 0.85,
    fadeOut: 0.25,
  });
}

/** Montée : bruit et sinus qui grimpent jusqu'à l'impact. */
function riser() {
  const seconds = 1.5;
  const out = samples(seconds);
  const random = noise(53);
  const band = new Biquad();
  let phase = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / out.length;
    if (n % 16 === 0) band.set('bandpass', 400 * Math.pow(7000 / 400, Math.pow(t, 1.4)), 1.1);
    phase += (TAU * (180 * Math.pow(1100 / 180, t))) / SR;
    const level = t * t;
    out[n] = (band.run(random()) + Math.sin(phase) * 0.18) * level;
  }
  return finish(out, { peak: 0.7, fadeOut: 0.004 });
}

/** Frappe de touche : l'adresse du site qui s'écrit. */
function type() {
  const out = samples(0.035);
  const random = noise(61);
  const high = new Biquad().set('highpass', 3000, 0.8);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    out[n] =
      high.run(random()) * Math.exp(-t / 0.0035) +
      Math.sin(TAU * 900 * t) * Math.exp(-t / 0.007) * 0.3;
  }
  return finish(out, { peak: 0.55 });
}

/** Pièces : trois éclats métalliques, pour l'argent qui arrive. */
function coins() {
  const out = samples(0.75);
  const random = noise(71);
  [0, 0.06, 0.13].forEach((start, index) => {
    const first = Math.round(start * SR);
    const tones = [2637, 3520, 4186, 5274].map((frequency) => frequency * (1 + random() * 0.012));
    for (let n = first; n < out.length; n++) {
      const t = (n - first) / SR;
      let value = 0;
      tones.forEach((frequency, k) => {
        value += Math.sin(TAU * frequency * t) * Math.exp(-t / (0.14 - k * 0.02)) * (1 - k * 0.18);
      });
      out[n] += value * (1 - index * 0.2) * (1 - Math.exp(-t / 0.0008));
    }
  });
  return finish(reverb(out, { mix: 0.18, feedback: 0.5, tail: 0.3 }), { peak: 0.6, fadeOut: 0.15 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Vidéo « Jeunesse » : la discussion de groupe et la fête
// ─────────────────────────────────────────────────────────────────────────────

/** Vibration : deux « bzz » d'un moteur de téléphone posé sur une table. */
function buzz() {
  const out = samples(0.42);
  const random = noise(83);
  const smooth = new Biquad().set('lowpass', 1400, 0.8);
  const rattle = new Biquad().set('bandpass', 420, 2.5);
  const pulses = [
    [0, 0.15],
    [0.23, 0.38],
  ];
  let phase = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    let level = 0;
    for (const [from, to] of pulses) {
      if (t >= from && t <= to) level = Math.min(1, (t - from) / 0.012, (to - t) / 0.03);
    }
    phase += (TAU * (158 + 6 * Math.sin(TAU * 7 * t))) / SR;
    // Onde presque carrée (le moteur), plus le cliquetis du boîtier.
    const motor = Math.tanh(3 * Math.sin(phase));
    const grit = rattle.run(random()) * (0.5 + 0.5 * Math.sin(phase));
    out[n] = smooth.run(motor * 0.8 + grit * 0.9) * level;
  }
  return finish(out, { peak: 0.6 });
}

/** Message reçu : une bulle qui monte, puis une petite note claire. */
function message() {
  const out = samples(0.4);
  let phase = 0;
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const frequency = 560 + 360 * (1 - Math.exp(-t / 0.02));
    phase += (TAU * frequency) / SR;
    const level = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.05);
    out[n] = Math.sin(phase) * level * 0.9;
  }
  bell(out, 0.075, 1174.66, { decay: 0.16, level: 0.55 });
  return finish(reverb(out, { mix: 0.12, feedback: 0.45, tail: 0.25 }), {
    peak: 0.6,
    fadeOut: 0.08,
  });
}

/** Message envoyé : un souffle bref qui file vers l'aigu, et un léger clic. */
function send() {
  const air = whoosh({ seconds: 0.24, low: 900, high: 7500, apex: 0.75, seed: 97 });
  const out = samples(0.3);
  for (let n = 0; n < air.length; n++) out[n] = air[n] * 0.8;
  const first = Math.round(0.2 * SR);
  for (let n = first; n < out.length; n++) {
    const t = (n - first) / SR;
    out[n] += Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.01) * 0.35;
  }
  return finish(out, { peak: 0.6 });
}

/** Canon à confettis : un claquement sec, puis le crépitement des papiers. */
function popper() {
  const out = samples(0.9);
  const random = noise(101);
  const crack = new Biquad().set('highpass', 900, 0.7);
  const body = new Biquad().set('bandpass', 1800, 0.9);
  for (let n = 0; n < out.length; n++) {
    const t = n / SR;
    const x = random();
    out[n] =
      crack.run(x) * Math.exp(-t / 0.006) * 1.2 +
      body.run(x) * Math.exp(-t / 0.03) * 0.8 +
      Math.sin(TAU * 110 * t) * Math.exp(-t / 0.04) * 0.5;
  }
  const sparkle = noise(103);
  const bright = new Biquad().set('highpass', 3500, 0.7);
  for (let k = 0; k < 16; k++) {
    const start = 0.06 + ((sparkle() + 1) / 2) * 0.55;
    const level = 0.5 * (1 - k / 20);
    const first = Math.round(start * SR);
    for (let n = first; n < Math.min(out.length, first + Math.round(0.02 * SR)); n++) {
      const t = (n - first) / SR;
      out[n] += bright.run(sparkle()) * Math.exp(-t / 0.002) * level;
    }
  }
  return finish(reverb(out, { mix: 0.18, feedback: 0.5, tail: 0.4 }), {
    peak: 0.8,
    fadeOut: 0.2,
  });
}

mkdirSync(OUT, { recursive: true });
console.log(`Effets sonores → ${OUT}`);
write('whoosh', whoosh());
write('whoosh-deep', whoosh({ seconds: 0.9, low: 150, high: 2200, apex: 0.5, seed: 19 }));
write('swish', whoosh({ seconds: 0.34, low: 1200, high: 7000, apex: 0.35, seed: 11 }));
write('tap', tap());
write('pop', pop());
write('pop-high', pop({ base: 540, sweep: 1050 }));
write('tick', tick());
write('ding', ding());
write('beep', beep());
write('valid', valid());
write('impact', impact());
write('riser', riser());
write('type', type());
write('coins', coins());
write('buzz', buzz());
write('message', message());
write('send', send());
write('popper', popper());
