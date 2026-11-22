import { engine, ramp } from './context';
import { SOUNDS } from '../demo/sounds';
import { dbDelete, dbGet, dbPut } from '../library/db';
import { toast } from '../util';

/**
 * 8-slot sampler shared by both decks (pads in SAMPLER mode).
 * Built-in sounds are synthesised; any slot can take your own sound file (kept in the browser).
 * Output: sampler volume -> master bus (so it goes through the master limiter).
 */
export interface Slot { name: string; buf: AudioBuffer | null; user: boolean }

interface Stored { name: string; blob: Blob }

export const sampler = {
  slots: SOUNDS.map(s => ({ name: s.name, buf: null, user: false })) as Slot[],
  level: 0.8,
  out: null as GainNode | null,
  /** currently sounding voices per slot (for the pad lights) */
  voices: new Map<number, AudioBufferSourceNode>(),
};

/** Build the built-in sounds and restore user sounds (called once the AudioContext exists). */
export async function buildSampler(ctx: AudioContext): Promise<void> {
  sampler.out = ctx.createGain();
  sampler.out.gain.value = sampler.level ** 2;
  sampler.out.connect(engine.bus!);
  SOUNDS.forEach((s, i) => {
    const x = s.render(ctx.sampleRate), b = ctx.createBuffer(1, x.length, ctx.sampleRate);
    b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
    sampler.slots[i].buf = b;
  });
  for (let i = 0; i < 8; i++) {
    const st = await dbGet<Stored>('samples', i).catch(() => undefined);
    if (!st) continue;
    try {
      sampler.slots[i] = { name: st.name, buf: await ctx.decodeAudioData(await st.blob.arrayBuffer()), user: true };
    } catch { /* stored file no longer decodes: keep built-in */ }
  }
}

export function setSamplerLevel(v: number): void {
  sampler.level = v;
  if (sampler.out) ramp(sampler.out.gain, v * v, 0.01);
}

/** Play a slot from the start (pressing again restarts it). */
export function playSample(i: number): void {
  const ctx = engine.ctx, s = sampler.slots[i];
  if (!ctx || !sampler.out || !s?.buf) return;
  stopSample(i);
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.connect(sampler.out);
  src.onended = () => { if (sampler.voices.get(i) === src) sampler.voices.delete(i); };
  src.start();
  sampler.voices.set(i, src);
}

export function stopSample(i: number): void {
  const v = sampler.voices.get(i);
  if (!v) return;
  sampler.voices.delete(i);
  try { v.stop(); } catch { /* already ended */ }
}

/** Load your own sound file into a slot (max 30 s, so the browser storage stays small). */
export async function loadUserSample(i: number, f: File): Promise<void> {
  const ctx = engine.ctx;
  if (!ctx) return;
  let buf: AudioBuffer;
  try { buf = await ctx.decodeAudioData(await f.arrayBuffer()); } catch { toast('Bu ses dosyası açılamadı'); return; }
  if (buf.duration > 30) { toast('Sampler sesi en fazla 30 saniye olabilir'); return; }
  const name = f.name.replace(/\.[^.]+$/, '').slice(0, 24);
  sampler.slots[i] = { name, buf, user: true };
  await dbPut('samples', { name, blob: f } satisfies Stored, i).catch(() => toast('Ses kaydedilemedi (sadece bu oturum)'));
  toast(`Sampler ${i + 1}: "${name}" yüklendi`);
}

/** Back to the built-in sound. */
export async function resetSample(i: number): Promise<void> {
  const ctx = engine.ctx;
  if (!ctx) return;
  const x = SOUNDS[i].render(ctx.sampleRate), b = ctx.createBuffer(1, x.length, ctx.sampleRate);
  b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
  sampler.slots[i] = { name: SOUNDS[i].name, buf: b, user: false };
  await dbDelete('samples', i).catch(() => undefined);
  toast(`Sampler ${i + 1}: "${SOUNDS[i].name}" sesine dönüldü`);
}
