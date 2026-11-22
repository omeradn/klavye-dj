import { engine, ramp } from './context';
import { audioSettings, saveAudioSettings, type PhonesMode } from './settings';
import { toast } from '../util';

/**
 * Output routing + headphone (cue) mix.
 *
 *   limiter ─► masterOut ───────────────────────────────────────────► master output
 *      │
 *      ├► gMaster ┐
 *   cueBus ► gCue ┴► normal ─┐
 *   cueBus ► mono ┐          ├► level ─► phones limiter ─► phOut ──► headphone output
 *   limiter► mono ┴► split ──┘   (split: left ear = cue, right ear = master)
 *
 * Where the two outputs go depends on the phones mode:
 *   single: one stereo output — master, or (SPLIT on) the headphone signal
 *   quad:   one 4-channel interface — master on 1-2, headphones on 3-4
 *   device: master on the context's device, headphones on a second device (via <audio>.setSinkId)
 */

type SinkCtx = AudioContext & { setSinkId?: (id: string) => Promise<void> };
type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

/** Equal-power cue/master blend: x = 0 only cue, x = 1 only master. */
export function cueMixGains(x: number): { cue: number; master: number } {
  return { cue: Math.cos(x * Math.PI / 2), master: Math.sin(x * Math.PI / 2) };
}

export const phones = { split: false };

interface Nodes {
  ctx: AudioContext;
  masterOut: GainNode; gCue: GainNode; gMaster: GainNode; normal: GainNode; gSplit: GainNode;
  level: GainNode; lim: AudioWorkletNode; phOut: GainNode;
  quad?: { merge: ChannelMergerNode; spM: ChannelSplitterNode; spP: ChannelSplitterNode };
  dev?: { dest: MediaStreamAudioDestinationNode; el: SinkAudio };
}
let N: Nodes | null = null;
/** the mode actually in use (quad falls back to single if the device has < 4 channels) */
let active: PhonesMode = 'single';

export const outputSupport = {
  masterDevice: typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype,
  phonesDevice: typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
};

/** Build the output graph (called once from the context hook, after the limiter exists). */
export async function buildOutput(ctx: AudioContext): Promise<void> {
  const lim = engine.limiter!, cue = engine.cueBus!;
  const g = (v = 1) => { const x = ctx.createGain(); x.gain.value = v; return x; };
  const mono = () => new GainNode(ctx, { channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });

  const masterOut = g(); lim.connect(masterOut);
  const gCue = g(), gMaster = g(), normal = g(), gSplit = g(0), level = g();
  cue.connect(gCue).connect(normal);
  lim.connect(gMaster).connect(normal);
  const merge = ctx.createChannelMerger(2), mc = mono(), mm = mono();
  cue.connect(mc).connect(merge, 0, 0);
  lim.connect(mm).connect(merge, 0, 1);
  merge.connect(gSplit);
  normal.connect(level); gSplit.connect(level);
  // two decks summed in the headphones can exceed 0 dBFS: they get their own limiter
  const plim = new AudioWorkletNode(ctx, 'limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
  const phOut = g();
  level.connect(plim).connect(phOut);
  N = { ctx, masterOut, gCue, gMaster, normal, gSplit, level, lim: plim, phOut };

  applyPhonesMix();
  if (audioSettings.masterSink) await setMasterDevice(audioSettings.masterSink, false);
  await applyRouting();
}

export function applyPhonesMix(): void {
  if (!N) return;
  const s = audioSettings, m = cueMixGains(s.cueMix);
  ramp(N.gCue.gain, m.cue, 0.01);
  ramp(N.gMaster.gain, m.master, 0.01);
  ramp(N.normal.gain, phones.split ? 0 : 1, 0.01);
  ramp(N.gSplit.gain, phones.split ? 1 : 0, 0.01);
  ramp(N.level.gain, s.phonesLevel ** 2, 0.01);
}

export function setCueMix(v: number): void { audioSettings.cueMix = v; applyPhonesMix(); saveAudioSettings(); }
export function setPhonesLevel(v: number): void { audioSettings.phonesLevel = v; applyPhonesMix(); saveAudioSettings(); }

export function setSplit(on: boolean): void {
  phones.split = on;
  applyPhonesMix();
  if (active === 'single') void applyRouting();
}

/** Is the headphone signal audible somewhere right now? (used for hints) */
export function phonesAudible(): boolean { return active !== 'single' || phones.split; }

export function activeMode(): PhonesMode { return active; }

/** Connect master / headphone signals to the outputs for the current mode. */
export async function applyRouting(): Promise<void> {
  if (!N) return;
  const { ctx, masterOut, phOut } = N, dest = ctx.destination;
  masterOut.disconnect(); phOut.disconnect();
  if (N.dev) { N.dev.el.pause(); N.dev.el.srcObject = null; }

  let mode = audioSettings.phonesMode;
  if (mode === 'quad' && dest.maxChannelCount < 4) {
    toast(`Bu ses çıkışı ${dest.maxChannelCount} kanallı; 4 kanal gerekli. Tek çıkışa dönüldü.`);
    mode = 'single';
  }
  if (mode === 'device' && !outputSupport.phonesDevice) {
    toast('Bu tarayıcı ayrı kulaklık cihazını desteklemiyor (Chrome ya da Edge kullan).');
    mode = 'single';
  }
  active = mode;

  if (mode === 'quad') {
    dest.channelCount = 4; dest.channelCountMode = 'explicit'; dest.channelInterpretation = 'discrete';
    const q = N.quad ??= { merge: ctx.createChannelMerger(4), spM: ctx.createChannelSplitter(2), spP: ctx.createChannelSplitter(2) };
    masterOut.connect(q.spM); phOut.connect(q.spP);
    q.spM.connect(q.merge, 0, 0); q.spM.connect(q.merge, 1, 1);
    q.spP.connect(q.merge, 0, 2); q.spP.connect(q.merge, 1, 3);
    q.merge.connect(dest);
    return;
  }
  N.quad?.merge.disconnect();
  dest.channelCount = 2; dest.channelCountMode = 'explicit'; dest.channelInterpretation = 'speakers';

  if (mode === 'device') {
    masterOut.connect(dest);
    const d = N.dev ??= { dest: ctx.createMediaStreamDestination(), el: new Audio() as SinkAudio };
    phOut.connect(d.dest);
    d.el.srcObject = d.dest.stream;
    try {
      await d.el.setSinkId!(audioSettings.phonesSink);
      await d.el.play();
    } catch {
      toast('Kulaklık cihazı açılamadı (çıkarılmış olabilir). Ayarlardan başka cihaz seç.');
    }
    return;
  }
  (phones.split ? phOut : masterOut).connect(dest);
}

/** Send the master (whole AudioContext) to another output device. */
export async function setMasterDevice(id: string, save = true): Promise<boolean> {
  const ctx = engine.ctx as SinkCtx | null;
  if (!ctx?.setSinkId) { toast('Bu tarayıcı çıkış cihazı seçmeyi desteklemiyor (Chrome ya da Edge kullan).'); return false; }
  try {
    await ctx.setSinkId(id);
  } catch {
    toast('Bu ses cihazı açılamadı; varsayılan çıkış kullanılıyor.');
    if (id) await ctx.setSinkId('').catch(() => undefined);
    return false;
  }
  if (save) { audioSettings.masterSink = id; saveAudioSettings(); await applyRouting(); }
  return true;
}

export async function setPhonesMode(mode: PhonesMode, sink = audioSettings.phonesSink): Promise<void> {
  audioSettings.phonesMode = mode; audioSettings.phonesSink = sink;
  saveAudioSettings();
  await applyRouting();
}

/** Total output latency the browser reports (ms), or null before audio starts. */
export function measuredLatencyMs(): number | null {
  const c = engine.ctx;
  if (!c) return null;
  return Math.round(((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000);
}

/** For dev testing: the nodes, so levels can be inspected from the console. */
export function outputNodes(): Nodes | null { return N; }
