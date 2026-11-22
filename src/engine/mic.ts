import { engine, ensureCtx, ramp } from './context';
import { toast } from '../util';

/**
 * Microphone for announcements: mic -> low cut -> gentle compressor -> level -> master (through the limiter).
 * DUCK: while you speak, the music drops by `depth` dB and comes back smoothly when you stop.
 */
export const mic = {
  on: false,
  level: 0.8,
  duckOn: true,
  /** music reduction while speaking, in dB */
  depth: 12,
  /** current mic level 0..1 (for the meter) */
  meter: 0,
  speaking: false,
};

let stream: MediaStream | null = null;
let src: MediaStreamAudioSourceNode | null = null;
let gain: GainNode | null = null;
let an: AnalyserNode | null = null;
const buf = new Float32Array(1024);
let lastVoice = 0;

/** Speech detection threshold (RMS) and how long the music stays down after the last word. */
const THRESH = 0.02, HOLD_MS = 600;

export async function micToggle(): Promise<void> {
  if (mic.on) { micOff(); return; }
  const ctx = ensureCtx();
  await engine.ready;
  try {
    // browser voice processing off: it would pump the music and colour the voice
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    toast('Mikrofon açılamadı (izin verilmedi ya da mikrofon yok)');
    return;
  }
  src = ctx.createMediaStreamSource(stream);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
  gain = ctx.createGain(); gain.gain.value = 0;
  an = ctx.createAnalyser(); an.fftSize = 1024;
  src.connect(hp).connect(comp).connect(gain).connect(engine.master!);
  hp.connect(an);
  ramp(gain.gain, mic.level * mic.level * 1.5, 0.02);
  mic.on = true;
  toast('Mikrofon açık. Hoparlöre yakınsan dikkat: mikrofon hoparlörü duyarsa ıslık (feedback) yapar, sesi kıs ya da uzaklaş.');
}

export function micOff(): void {
  mic.on = false; mic.meter = 0; mic.speaking = false;
  if (gain) ramp(gain.gain, 0, 0.02);
  const s = stream, n = src;
  setTimeout(() => { s?.getTracks().forEach(t => t.stop()); n?.disconnect(); }, 100);
  stream = null; src = null; gain = null; an = null;
  if (engine.duck) ramp(engine.duck.gain, 1, 0.25);
}

export function setMicLevel(v: number): void {
  mic.level = v;
  if (gain && mic.on) ramp(gain.gain, v * v * 1.5, 0.02);
}

export function setDuck(on: boolean): void {
  mic.duckOn = on;
  if (!on && engine.duck) ramp(engine.duck.gain, 1, 0.25);
}

/** Every frame: mic meter + ducking decision. */
export function micFrame(now: number): void {
  if (!mic.on || !an) return;
  an.getFloatTimeDomainData(buf);
  let s = 0;
  for (const v of buf) s += v * v;
  const rms = Math.sqrt(s / buf.length);
  mic.meter = Math.max(mic.meter * 0.85, Math.min(1, rms * 6));
  if (rms > THRESH) lastVoice = now;
  const speaking = now - lastVoice < HOLD_MS;
  if (speaking !== mic.speaking) {
    mic.speaking = speaking;
    if (mic.duckOn && engine.duck) {
      // quick down (≈ 50 ms), slow back up (≈ 0.8 s) — sounds natural, not "pumping"
      ramp(engine.duck.gain, speaking ? Math.pow(10, -mic.depth / 20) : 1, speaking ? 0.015 : 0.25);
    }
  }
}
