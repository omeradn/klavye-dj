import { $, clamp, fmt, toast, setText } from '../util';
import { Knob, Fader } from '../ui/controls';
import { engine, ensureCtx, ramp } from './context';
import { phonesAudible } from './output';
import { JUMP_BEATS, KEY_SEMIS, LOOP_BEATS, PAD_MODES, padLabel, ROLL_BEATS, sliceBase, type PadMode } from './padmodes';
import { loadUserSample, playSample, resetSample, sampler } from './sampler';
import { CHAN_FX, chanFx, crushCurve, cutoff } from './chanfx';
import { chGain, isoGain, mixerCfg } from './mixercfg';
import { impulse } from './beatfx';
import { detectBPM } from '../analysis/bpm';
import {
  analyzeGrid, barPos, downbeatAt, lineKind, METER_ORDER, METERS, phaseAt, pulseLen, setBpmAt, snap, wrapHalf, type Grid,
} from '../analysis/grid';
import { fileSig } from '../library/model';
import { loadMeta, saveMeta } from '../library/trackmeta';
import { computePeaks, PPS } from '../analysis/peaks';
import { computeBands, energyRating } from '../analysis/features';
import { compat, detectKey, keyName, shiftKey, wheelCode, type Key } from '../analysis/key';
import { DEMOS, renderDemo } from '../demo/synth';
import type { DeckIn, DeckState } from './worklets/protocol';
import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch';

import { AUDIO_EXT } from '../library/model';
/** One platter revolution = 1.8 s of audio (33 1/3 rpm vinyl). */
const SEC_PER_REV = 1.8;
/** Jog ring (outer part) = nudge; inner part = scratch (when VINYL is on). */
const JOG_RING = 0.8;
/**
 * Pitch-shifter block size. Its latency (= this) is hidden by the look-ahead read head,
 * so it only decides quality and how long we stay on the original signal after a jump.
 */
const KEYLOCK_BLOCK_MS = 120;

/**
 * One deck: transport, tempo, cues, loops + its mixer channel strip.
 * Audio is played by the 'deck' AudioWorklet (src/engine/worklets/deck-processor.ts);
 * this class keeps a mirror of its state for the UI.
 */
/** Analysis results for a song (cached by the library). */
export interface TrackInfo {
  bpm: number | null;
  dur: number;
  grid: Grid | null;
  key?: Key | null;
  energy?: number;
}

const BAND_COL = ['#7a5cff', '#3ce37a', '#e9ecf1'];   // low · mid · high

export class Deck {
  /** seconds of real time shown across the scrolling waveform (shared by both decks; wheel on it = zoom) */
  static span = 7;

  readonly id: string;
  readonly i: number;
  readonly color: string;
  readonly el: HTMLElement;
  readonly ch: HTMLElement;
  /** The opposite deck (used by SYNC). */
  other!: Deck;

  // track
  len = 0;           // samples
  sr = 48000;
  title = '';
  // mirror of the worklet state
  pos = 0; posAt = 0; rateNow = 0; playing = false; audible = false;

  tempo = 0; bend = 0; jogBend = 0; jogStamp = 0;
  cuePt = 0; cuePreview = false;
  hot: (number | null)[] = Array(8).fill(null);
  /** performance pad mode */
  padMode: PadMode = 'hot';
  /** pads held down right now (roll / slicer act while held) */
  private padsHeld = new Set<number>();
  private sliceStart = 0;
  private rollPad = -1;
  bpm: number | null = null;
  /** beatgrid (null = unknown); `bpm` mirrors grid.bpm */
  grid: Grid | null = null;
  /** detected musical key (before key shift / tempo) */
  key: Key | null = null;
  energy = 0;
  bands: Float32Array | null = null;
  /** phrase length in bars for the counter and the red phrase lines */
  phraseBars = 8;
  /** QUANTIZE: cue, hot cue and loops snap to the grid; hot cue jumps keep the beat phase */
  quantize = true;
  /** SYNC latched: follows the other deck's tempo and keeps the beats aligned */
  syncOn = false;
  private syncBend = 0;
  private syncSetting = false;
  /** saved-data key of the loaded song ('' = none) */
  sig = '';
  private srcFile: File | null = null;
  loopOn = false; loopBeats = 4; loopS = 0; loopE = 0;
  kills = { lo: false, mid: false, hi: false };
  fxOn = false; keyLock = true;
  /** headphone CUE (pre-fader listen) */
  pfl = false;
  /** manual key shift in semitones (−12…+12) */
  keyShift = 0;
  wet = 0;
  private lookahead = 0;
  private lastSemis = NaN;
  reverse = false; slip = false; censor = false; vinyl = true;
  scratching = false; scratchLast = 0; scratchIdle = true;
  peaks: Float32Array | null = null;
  ovImg: HTMLCanvasElement | null = null;
  demoIdx: number;
  vu = 0;
  wired = false;
  /** called after a file was analysed here (the library caches the result) */
  onAnalyzed?: (f: File, info: TrackInfo) => void;
  /** called the first time a loaded song starts playing (history) */
  onPlayed?: (sig: string, title: string) => void;
  private logged = false;

  // controls
  tempoF!: Fader; chF!: Fader;
  trimK!: Knob; hiK!: Knob; midK!: Knob; loK!: Knob; filK!: Knob; fxK!: Knob;
  fxBtn!: HTMLButtonElement; pflBtn!: HTMLButtonElement;
  file!: HTMLInputElement;
  readonly ws: HTMLCanvasElement;
  readonly wo: HTMLCanvasElement;
  private ui!: Record<string, HTMLElement>;
  private vuEl: HTMLElement;

  // audio graph
  node?: AudioWorkletNode;
  stretch?: StretchNode;
  klMix?: AudioWorkletNode;
  private wiring?: Promise<void>;
  trim?: GainNode;
  lo?: BiquadFilterNode; mid?: BiquadFilterNode; hi?: BiquadFilterNode; fil?: BiquadFilterNode;
  /** EQ vs isolator: both chains exist, a crossfade picks one */
  private iso?: { eqG: GainNode; isoG: GainNode; lo: GainNode; mid: GainNode; hi: GainNode };
  chGain?: GainNode; cueG?: GainNode; xfG?: GainNode;
  /** Ritim FX insert point (between channel fader and crossfader) */
  insIn?: GainNode; insOut?: GainNode;
  /** Kanal FX paths */
  private cfx?: { dry: GainNode; spSend: GainNode; spFilt: BiquadFilterNode; crush: WaveShaperNode; crFilt: BiquadFilterNode; crWet: GainNode; nFilt: BiquadFilterNode; nGain: GainNode; steps: number }; fxSend?: GainNode; fb?: GainNode;
  delay?: DelayNode;
  an?: AnalyserNode;
  anBuf = new Float32Array(1024);

  constructor(id: string, i: number) {
    this.id = id; this.i = i; this.color = i ? '#38c6ff' : '#ff8a3d';
    this.demoIdx = i;
    this.el = $('#deck' + id); this.ch = $('#ch' + id);
    this.buildDeck(); this.buildChannel();
    this.ws = $<HTMLCanvasElement>('#ws' + id); this.wo = $<HTMLCanvasElement>('#wo' + id);
    this.vuEl = $('#vu' + id);
    this.wo.addEventListener('click', e => {
      if (!this.len) return;
      const r = this.wo.getBoundingClientRect();
      this.seek((e.clientX - r.left) / r.width * this.duration);
    });
    [this.el, this.ws.parentNode as HTMLElement].forEach(z => {
      z.addEventListener('dragover', e => { e.preventDefault(); this.el.classList.add('drag'); });
      z.addEventListener('dragleave', () => this.el.classList.remove('drag'));
      z.addEventListener('drop', e => {
        e.preventDefault(); this.el.classList.remove('drag');
        const f = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('audio') || AUDIO_EXT.test(f.name));
        if (f) void this.load(f);
      });
    });
    // wheel anywhere on deck (not on a control) = tempo
    this.el.addEventListener('wheel', e => { e.preventDefault(); this.tempoF.nudge(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  get has(): boolean { return this.len > 0; }
  get duration(): number { return this.len / this.sr; }

  /** Current play position in seconds (worklet snapshot + extrapolation). */
  currentTime(): number {
    if (!this.len) return 0;
    let p = this.pos;
    if (this.audible && engine.ctx) p += this.rateNow * (engine.ctx.currentTime - this.posAt) * this.sr;
    return clamp(p, 0, this.len) / this.sr;
  }

  private post(m: DeckIn, transfer: Transferable[] = []): void { this.node?.port.postMessage(m, transfer); }

  /** Element with data-a="…" inside this deck. */
  q(a: string): HTMLElement { return this.el.querySelector<HTMLElement>(`[data-a="${a}"]`)!; }

  private buildDeck(): void {
    const L = this.id;
    this.el.innerHTML = `
      <div class="dtop"><div class="dname">${L}</div><div class="dtitle">Şarkı yok — sürükle bırak, LOAD ya da DEMO</div>
        <div class="dbpm" title="Tık: ×2 · Shift+tık: ½">— <small>BPM</small></div></div>
      <div class="dinfo"><span class="rem">-0:00</span><span class="tp">±0.00%</span><span class="kl">KEY LOCK</span><span class="key" title="Ton (tempo ve TON kaydırma dahil) · çark numarası. Yeşil: diğer deck ile uyumlu, sarı: riskli, kırmızı: çatışır"></span><span class="lp"></span><span class="bars" title="Phrase · bar (tıkla: phrase uzunluğu 4/8/16/32 bar)"></span><span class="leds"></span></div>
      <div class="dbody">
        <div class="jogwrap"><div class="jog" data-a="jog" title="İç kısım: scratch (VINYL açıkken) · Dış halka: tempo dürtme"><div class="platter"><i></i></div><div class="jogc"><div><b class="jt">0:00</b><span class="jr">-0:00</span></div></div></div></div>
        <div class="tcol"><span class="lbl">TEMPO</span><div class="tf" data-a="tempo"></div>
          <button class="b" data-a="tempoReset">0%</button>
          <span class="lbl">TON</span>
          <div class="kshift">
            <button class="b" data-a="keyUp" title="Tonu yarım ses yükselt">♯</button>
            <button class="ksv" data-a="keyReset" title="Ton kaydırma · tıkla: sıfırla">0</button>
            <button class="b" data-a="keyDown" title="Tonu yarım ses düşür">♭</button>
          </div></div>
      </div>
      <div class="row">
        <button class="b amber" data-a="sync">SYNC</button>
        <button class="b" data-a="keylock">KEY</button>
        <button class="b" data-a="loop">LOOP</button>
        <button class="b" data-a="loopHalf">½</button>
        <button class="b" data-a="loopDouble">×2</button>
        <button class="b" data-a="jumpBack" title="Beat jump geri (loop boyu kadar)">◀◀</button>
        <button class="b" data-a="jumpFwd" title="Beat jump ileri (loop boyu kadar)">▶▶</button>
        <button class="b" data-a="load">LOAD</button>
        <button class="b" data-a="demo" title="Kodla üretilmiş demo parça yükle">DEMO</button>
        <input type="file" accept="audio/*" hidden>
      </div>
      <div class="row">
        <button class="b" data-a="vinyl" title="Açık: jog'un iç kısmı plak gibi scratch yapar">VINYL</button>
        <button class="b" data-a="slip" title="Loop/ters/scratch bitince şarkı kaldığı yerden değil, olması gereken yerden devam eder">SLIP</button>
        <button class="b red" data-a="reverse">REV</button>
        <button class="b red" data-a="censor" title="Basılı tut: ters çalar, bırakınca şarkı kaldığı yerden devam eder">CENSOR</button>
        <button class="b" data-a="brake" title="Plak çaları kapatır gibi yavaşça durur">BRAKE</button>
        <button class="b" data-a="spinback" title="Plağı geri savurup durdurur">SPIN</button>
      </div>
      <div class="row grow">
        <span class="glbl">GRID</span>
        <button class="b sm" data-a="gridLeft" title="Grid'i 5 ms sola kaydır (Shift+tık: 1 ms)">◁</button>
        <button class="b sm" data-a="gridRight" title="Grid'i 5 ms sağa kaydır (Shift+tık: 1 ms)">▷</button>
        <button class="b sm" data-a="downbeat" title="Çalan yere en yakın vuruşu 1. vuruş yap (bar ve phrase başı)">1.1</button>
        <button class="b sm" data-a="bpmDown" title="BPM −0,05 (Shift+tık: −0,01); çalan yerdeki çizgi yerinde kalır">BPM−</button>
        <button class="b sm" data-a="bpmUp" title="BPM +0,05 (Shift+tık: +0,01)">BPM+</button>
        <button class="b sm mtr" data-a="meter" title="Ölçü: 4/4 · 6/8 · 7/8 aksak · 9/8 aksak · 10/8 aksak. Aksak ölçülerde BPM = sekizlik vuruş sayısı">4/4</button>
        <button class="b sm" data-a="quantize" title="QUANTIZE: cue, hot cue ve loop en yakın vuruşa oturur; hot cue'ya atlarken ritim kaymaz">QUANT</button>
      </div>
      <div class="pmodes" data-a="padMode">
        ${PAD_MODES.map(m => `<button class="pm" data-m="${m.id}" title="${m.help}">${m.label}</button>`).join('')}
      </div>
      <div class="pads">
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<button class="pad" data-a="pad${i}"><span>HOT CUE ${i + 1}</span></button>`).join('')}
      </div>
      <div class="transport">
        <button class="round cue" data-a="cue">CUE</button>
        <button class="round play" data-a="play">▶❚❚</button>
        <div class="sp"></div>
        <button class="b" data-a="bendDown">◀ BEND</button>
        <button class="b" data-a="bendUp">BEND ▶</button>
      </div>`;
    const q = (a: string) => this.q(a);
    const sel = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    this.ui = {
      pmodes: sel('.pmodes'),
      title: sel('.dtitle'), bpm: sel('.dbpm'), rem: sel('.rem'), tp: sel('.tp'), kl: sel('.kl'), lp: sel('.lp'), key: sel('.key'),
      jt: sel('.jt'), jr: sel('.jr'), platter: sel('.platter'), ksv: sel('.ksv'), bars: sel('.bars'), leds: sel('.leds'),
      mtr: sel('.mtr'),
    };

    this.tempoF = new Fader(q('tempo'), {
      min: -0.16, max: 0.16, def: 0, step: 0.001,
      // applyFX keeps the echo time locked to the current tempo
      onchange: v => {
        this.tempo = v; this.applyRate(); this.applyFX();
        if (this.syncOn && !this.syncSetting) { this.syncOn = false; toast(`Deck ${this.id}: SYNC kapandı (tempo elle değişti)`); }
      },
    });
    q('tempo').classList.add('tick');

    const file = this.el.querySelector<HTMLInputElement>('input[type=file]')!;
    file.onchange = () => { if (file.files?.[0]) void this.load(file.files[0]); file.value = ''; };
    this.file = file;

    const click = (a: string, fn: (e: MouseEvent) => void) => q(a).addEventListener('click', e => { ensureCtx(); fn(e); });
    for (const a of ['play', 'sync', 'keylock', 'loop', 'loopHalf', 'loopDouble', 'jumpBack', 'jumpFwd', 'load', 'demo',
      'tempoReset', 'vinyl', 'slip', 'reverse', 'brake', 'spinback', 'keyUp', 'keyDown', 'keyReset']) click(a, () => this.act(a));
    for (const a of ['gridLeft', 'gridRight', 'downbeat', 'bpmDown', 'bpmUp', 'meter', 'quantize']) click(a, e => this.gridAct(a, e.shiftKey));
    this.ui.bars.onclick = () => { this.phraseBars = this.phraseBars >= 32 ? 4 : this.phraseBars * 2; toast(`Phrase: ${this.phraseBars} bar`); };
    // pad modes and pads (pointer: press/release so ROLL and SLICER work while held)
    this.el.querySelector<HTMLElement>('.pmodes')!.addEventListener('click', e => {
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m as PadMode | undefined;
      if (m) this.setPadMode(m);
    });
    for (let i = 0; i < 8; i++) {
      const b = q('pad' + i);
      let down = false;
      b.onpointerdown = e => {
        if (e.button === 2) return;
        e.preventDefault(); ensureCtx();
        if (e.shiftKey) { this.padAlt(i); return; }
        down = true; this.pad(i, true);
      };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => { if (down) { down = false; this.pad(i, false); } };
      b.oncontextmenu = e => { e.preventDefault(); ensureCtx(); this.padAlt(i); };
    }

    // press-and-hold buttons
    for (const a of ['cue', 'censor', 'bendDown', 'bendUp']) {
      const b = q(a);
      let down = false;
      b.onpointerdown = e => { e.preventDefault(); ensureCtx(); down = true; this.hold(a, true); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => { if (down) { down = false; this.hold(a, false); } };
    }

    this.ui.bpm.onclick = e => {
      if (!this.bpm) return;
      let b = e.shiftKey ? this.bpm / 2 : this.bpm * 2;
      if (b > 250) b /= 4;
      if (this.grid) this.setGrid({ ...this.grid, bpm: b });
      else { this.bpm = b; this.updLoop(); }
    };

    this.buildJog(q('jog'));
  }

  /** Jog wheel: inner part scratches like vinyl (VINYL on); outer ring nudges while playing / scrubs while paused. */
  private buildJog(jog: HTMLElement): void {
    let last: number | null = null, lastT = 0, mode: 'scratch' | 'nudge' = 'nudge';
    const geo = (e: PointerEvent) => {
      const r = jog.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      return { a: Math.atan2(dy, dx), d: Math.hypot(dx, dy) / (r.width / 2) };
    };
    jog.addEventListener('pointerdown', e => {
      ensureCtx(); jog.setPointerCapture(e.pointerId);
      const g = geo(e);
      last = g.a; lastT = performance.now();
      mode = this.vinyl && g.d < JOG_RING ? 'scratch' : 'nudge';
      if (mode === 'scratch' && this.has) this.setScratch(true, 0);
    });
    jog.addEventListener('pointermove', e => {
      if (last == null) return;
      const a = geo(e).a;
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      if (!this.has) return;
      const now = performance.now(), dt = Math.max(4, now - lastT);
      lastT = now;
      if (mode === 'scratch') this.setScratch(true, clamp(d / (2 * Math.PI) * SEC_PER_REV / (dt / 1000), -8, 8));
      else if (!this.playing) this.seek(this.currentTime() + d / (2 * Math.PI) * SEC_PER_REV);
      else { this.jogBend = clamp(d / dt * 60, -0.5, 0.5); this.jogStamp = now; this.applyRate(); }
    });
    const end = () => {
      if (last == null) return;
      last = null;
      if (mode === 'scratch') this.setScratch(false, 0);
      else { this.jogBend = 0; this.applyRate(); }
    };
    jog.addEventListener('pointerup', end);
    jog.addEventListener('pointercancel', end);
  }

  private setScratch(on: boolean, rate: number): void {
    this.scratching = on;
    this.scratchLast = performance.now();
    this.scratchIdle = rate === 0;
    this.post({ t: 'scratch', on, rate });
  }

  private buildChannel(): void {
    const c = this.ch;
    const clearKill = (k: 'lo' | 'mid' | 'hi') => () => { this.kills[k] = false; this.applyEQ(); };
    this.trimK = new Knob(c, { min: 0, max: 2, def: 1, label: 'TRIM', onchange: v => { if (this.trim) ramp(this.trim.gain, v); } });
    this.hiK = new Knob(c, { min: -26, max: 6, def: 0, label: 'HI', onchange: () => this.applyEQ(), onreset: clearKill('hi') });
    this.midK = new Knob(c, { min: -26, max: 6, def: 0, label: 'MID', onchange: () => this.applyEQ(), onreset: clearKill('mid') });
    this.loK = new Knob(c, { min: -26, max: 6, def: 0, label: 'LOW', onchange: () => this.applyEQ(), onreset: clearKill('lo') });
    this.filK = new Knob(c, { min: -1, max: 1, def: 0, label: 'FİLTRE', onchange: v => this.applyFilter(v) });
    chanFx.listeners.push(() => {
      setText(this.filK.w.querySelector('span')!, CHAN_FX.find(x => x.id === chanFx.type)!.label);
      this.applyFilter(this.filK.v);
    });

    const fx = document.createElement('div'); fx.className = 'fxrow'; c.appendChild(fx);
    this.fxBtn = document.createElement('button'); this.fxBtn.className = 'b'; this.fxBtn.dataset.a = 'fx'; this.fxBtn.textContent = 'ECHO';
    this.fxBtn.onclick = () => { ensureCtx(); this.act('fx'); };
    fx.appendChild(this.fxBtn);
    this.fxK = new Knob(fx, { min: 0, max: 1, def: 0.5, onchange: () => this.applyFX() });
    this.fxK.el.style.width = this.fxK.el.style.height = '34px';
    this.fxK.ind.style.transformOrigin = '50% 13px'; this.fxK.ind.style.height = '9px';

    this.pflBtn = document.createElement('button'); this.pflBtn.className = 'b pfl'; this.pflBtn.dataset.a = 'pfl';
    this.pflBtn.textContent = '🎧 CUE';
    this.pflBtn.title = 'Bu kanalı kulaklıkta dinle (fader ve crossfader kapalıyken de duyulur)';
    this.pflBtn.onclick = () => { ensureCtx(); this.act('pfl'); };
    c.appendChild(this.pflBtn);

    const fd = document.createElement('div'); fd.dataset.a = 'fader'; c.appendChild(fd);
    const lb = document.createElement('div'); lb.className = 'lbl2'; lb.textContent = 'KANAL'; c.appendChild(lb);
    this.chF = new Fader(fd, { min: 0, max: 1, def: 0.85, onchange: v => { if (this.chGain) ramp(this.chGain.gain, chGain(mixerCfg.ch, v), 0.004); } });
    mixerCfg.listeners.push(() => { this.chF.set(this.chF.v); this.applyEQ(); });
    fd.style.height = '150px';

    this.hiK.w.dataset.a = 'killHigh'; this.midK.w.dataset.a = 'killMid'; this.loK.w.dataset.a = 'killLow';
    this.filK.w.dataset.a = 'filter'; this.trimK.w.dataset.a = 'trim';
  }

  /** Build the audio graph once (safe to call repeatedly). */
  wire(): Promise<void> {
    return this.wiring ??= this.buildGraph();
  }

  /**
   * deck worklet ─ out0 (original + wet weight) ──────────────► keylock-mix ─► trim ─► EQ ─► filter ─► channel fader ─► crossfader ─► bus
   *              └ out1 (look-ahead) ─► pitch shifter ─────────┘                              │         crossfader ─► echo ─► bus
   *                                                                                            └► headphone CUE ─► cueBus
   * (echo is post-crossfader so its tail keeps ringing after an "echo out" with the crossfader)
   */
  private async buildGraph(): Promise<void> {
    if (!engine.ctx || !engine.bus) return;
    const C = engine.ctx;
    this.node = new AudioWorkletNode(C, 'deck', { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [3, 2] });
    this.node.port.onmessage = e => {
      const s = e.data as DeckState;
      this.pos = s.pos; this.posAt = s.at; this.rateNow = s.rate; this.playing = s.playing; this.audible = s.audible; this.wet = s.wet;
    };
    this.klMix = new AudioWorkletNode(C, 'keylock-mix', {
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: 3, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    });
    this.node.connect(this.klMix, 0, 0);
    try {
      const st = await SignalsmithStretch(C, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      await st.configure({ blockMs: KEYLOCK_BLOCK_MS });
      this.lookahead = Math.round((await st.latency()) * C.sampleRate);
      await st.schedule({ active: true, semitones: 0 });
      this.node.connect(st, 1, 0);
      st.connect(this.klMix, 0, 1);
      this.stretch = st;
    } catch {
      toast('Key lock başlatılamadı; şarkılar key lock olmadan çalar');
    }
    this.trim = C.createGain(); this.trim.gain.value = this.trimK.v;
    this.lo = C.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 220;
    this.mid = C.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1000; this.mid.Q.value = 0.7;
    this.hi = C.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 3800;
    this.fil = C.createBiquadFilter();
    this.chGain = C.createGain(); this.chGain.gain.value = chGain(mixerCfg.ch, this.chF.v);
    this.cueG = C.createGain(); this.cueG.gain.value = this.pfl ? 1 : 0;
    this.xfG = C.createGain();
    this.fxSend = C.createGain(); this.fxSend.gain.value = 0;
    this.delay = C.createDelay(4); this.fb = C.createGain(); this.fb.gain.value = 0.45;
    this.an = C.createAnalyser(); this.an.fftSize = 1024;
    // Kanal FX: dry + space (reverb send) + crush (bit reduction) + noise, all summed before the fader
    const g = (v = 0) => { const x = C.createGain(); x.gain.value = v; return x; };
    const sum = g(1), dry = g(1), spSend = g(), conv = C.createConvolver(), spFilt = C.createBiquadFilter();
    const crush = C.createWaveShaper(), crFilt = C.createBiquadFilter(), crWet = g();
    const nFilt = C.createBiquadFilter(), nGain = g();
    conv.buffer = impulse(C, 1.8);
    crush.curve = crushCurve(16) as Float32Array<ArrayBuffer>;
    const nb = C.createBuffer(1, C.sampleRate * 2, C.sampleRate), nd = nb.getChannelData(0);
    let seed = this.i + 7;
    for (let i = 0; i < nd.length; i++) { seed = (seed * 16807) % 2147483647; nd[i] = (seed / 2147483647) * 2 - 1; }
    const noise = C.createBufferSource(); noise.buffer = nb; noise.loop = true; noise.start();
    // ISOLATOR: 3-band Linkwitz-Riley (24 dB/oct) split at 250 Hz and 2.5 kHz; the bands sum back flat
    // Butterworth Q: Web Audio reads Q in dB for low/high-pass (−3.01 dB = 0.707) but linearly for all-pass
    const bq = (type: BiquadFilterType, f: number) => {
      const b = C.createBiquadFilter(); b.type = type; b.frequency.value = f;
      b.Q.value = type === 'allpass' ? Math.SQRT1_2 : 20 * Math.log10(Math.SQRT1_2);
      return b;
    };
    const chain = (from: AudioNode, ...ns: AudioNode[]) => ns.reduce((p, n) => p.connect(n), from);
    const eqG = g(1), isoG = g(0), isoSum = g(1), bLo = g(1), bMid = g(1), bHi = g(1);
    this.klMix.connect(this.trim).connect(this.lo).connect(this.mid).connect(this.hi).connect(eqG).connect(this.fil);
    chain(this.trim, bq('lowpass', 250), bq('lowpass', 250), bq('allpass', 2500), bLo, isoSum);
    chain(this.trim, bq('highpass', 250), bq('highpass', 250), bq('lowpass', 2500), bq('lowpass', 2500), bMid, isoSum);
    chain(this.trim, bq('highpass', 250), bq('highpass', 250), bq('highpass', 2500), bq('highpass', 2500), bHi, isoSum);
    isoSum.connect(isoG).connect(this.fil);
    this.iso = { eqG, isoG, lo: bLo, mid: bMid, hi: bHi };
    this.fil.connect(dry).connect(sum);
    this.fil.connect(spSend).connect(conv).connect(spFilt).connect(sum);
    this.fil.connect(crush).connect(crFilt).connect(crWet).connect(sum);
    noise.connect(nFilt).connect(nGain).connect(sum);
    sum.connect(this.chGain);
    this.cfx = { dry, spSend, spFilt, crush, crFilt, crWet, nFilt, nGain, steps: 16 };
    // Ritim FX can be inserted between the channel fader and the crossfader
    this.insIn = g(1); this.insOut = g(1);
    this.chGain.connect(this.insIn).connect(this.insOut).connect(this.xfG); this.chGain.connect(this.an);
    if (engine.cueBus) sum.connect(this.cueG).connect(engine.cueBus);
    this.xfG.connect(engine.bus);
    this.xfG.connect(this.fxSend).connect(this.delay);
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(engine.bus);
    this.wired = true;
    this.applyEQ(); this.applyFilter(this.filK.v); this.applyFX(); this.applyRate();
    this.post({ t: 'slip', on: this.slip });
  }

  /** Playback speed factor from tempo fader + pitch bend + jog nudge. */
  speed(): number { return clamp(1 + this.tempo + this.bend + this.jogBend + this.syncBend, 0.25, 3); }

  /**
   * Pitch correction in semitones: key lock cancels the pitch change of the tempo,
   * key shift adds a manual transposition on top.
   */
  private updateKeylock(): void {
    if (!this.stretch) return;
    const semis = this.keyShift + (this.keyLock ? -12 * Math.log2(this.speed()) : 0);
    const wet = Math.abs(semis) > 0.01;
    this.post({ t: 'keylock', lookahead: this.lookahead, wet });
    if (!(Math.abs(semis - this.lastSemis) < 0.003)) {
      this.lastSemis = semis;
      void this.stretch.schedule({ active: true, semitones: semis });
    }
  }

  /* ---------- loading ---------- */
  /** Load a song file. `known` (from the library cache) skips the analysis. */
  async load(f: File, known?: Partial<TrackInfo>): Promise<void> {
    const ctx = ensureCtx();
    if (this.playing && !confirm(`Deck ${this.id} şu an çalıyor. Yine de yeni şarkı yüklensin mi?`)) return;
    this.ui.title.textContent = f.name.replace(/\.[^.]+$/, '');
    toast(`Deck ${this.id}: analiz ediliyor…`);
    try {
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      this.peaks = computePeaks(L, buf.sampleRate);
      this.bands = computeBands(L, buf.sampleRate);
      let grid = known?.grid ?? null, key = known?.key, energy = known?.energy;
      const fresh = !grid || key === undefined || energy === undefined;
      if (!grid) {
        const bpm = known?.bpm !== undefined ? known.bpm : detectBPM(L, buf.sampleRate);
        grid = bpm ? analyzeGrid(L, buf.sampleRate, bpm) ?? { bpm, offset: 0, meter: '4/4', phraseBar: 0 } : null;
      }
      if (key === undefined) key = detectKey(L, buf.sampleRate);
      if (energy === undefined) energy = energyRating(L, buf.sampleRate, grid?.bpm);
      this.key = key; this.energy = energy;
      if (fresh) this.onAnalyzed?.(f, { bpm: grid?.bpm ?? null, dur: buf.duration, grid, key, energy });
      this.srcFile = f;
      await this.setTrack(f.name.replace(/\.[^.]+$/, ''), new Float32Array(L), new Float32Array(R), buf.sampleRate, grid, fileSig(f));
    } catch {
      toast('Bu dosya açılamadı (desteklenmeyen biçim olabilir)');
    }
  }

  /** Load a built-in demo track (next one in turn, or a given index). */
  async loadDemo(index?: number): Promise<void> {
    const ctx = ensureCtx();
    if (this.playing && !confirm(`Deck ${this.id} şu an çalıyor. Yine de demo yüklensin mi?`)) return;
    const spec = DEMOS[(index ?? this.demoIdx) % DEMOS.length];
    if (index == null) this.demoIdx += 2;
    toast(`Deck ${this.id}: demo hazırlanıyor…`);
    await new Promise(r => setTimeout(r, 30)); // let the toast paint
    const { L, R } = renderDemo(spec, ctx.sampleRate);
    this.peaks = computePeaks(L, ctx.sampleRate);
    this.bands = computeBands(L, ctx.sampleRate);
    this.key = { tonic: spec.root % 12, minor: spec.minor };
    this.srcFile = null;
    // demos are made on an exact grid: bar 1 at 0 s, phrases of 8 bars
    await this.setTrack(spec.name, L, R, ctx.sampleRate, { bpm: spec.bpm, offset: 0, meter: '4/4', phraseBar: 0 }, 'demo:' + spec.name);
  }

  private async setTrack(name: string, L: Float32Array, R: Float32Array, sr: number, grid: Grid | null, sig: string): Promise<void> {
    await engine.ready;
    await this.wire();
    const meta = await loadMeta(sig);
    this.len = L.length; this.sr = sr; this.title = name; this.sig = '';
    Object.assign(this, { pos: 0, posAt: 0, playing: false, audible: false, cuePt: meta?.cue ?? 0, cuePreview: false,
      hot: Array.from({ length: 8 }, (_, i) => meta?.hot?.[i] ?? null), loopOn: false, reverse: false, censor: false, ovImg: null, syncOn: false, syncBend: 0 });
    this.setGrid(meta?.grid ?? grid, false);
    this.logged = false;
    this.sig = sig;
    const bpm = this.bpm ? +this.bpm.toFixed(2) : null;
    this.post({ t: 'load', L, R }, [L.buffer, R.buffer]);
    if (this.cuePt) this.seek(this.cuePt);
    this.applyRate();
    this.ui.title.textContent = name;
    this.buildOverview(); this.updLoop();
    toast(`Deck ${this.id} hazır${bpm ? ' · ' + bpm + ' BPM' : ''}${meta ? ' · kayıtlı cue ve grid yüklendi' : ''}`);
  }

  private buildOverview(): void {
    const c = document.createElement('canvas'), W = 1600, H = 44;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const p = this.peaks!, n = p.length;
    g.fillStyle = this.color;
    for (let x = 0; x < W; x++) {
      const a = Math.floor(x / W * n), b = Math.floor((x + 1) / W * n);
      let m = 0;
      for (let i = a; i < b; i++) if (p[i] > m) m = p[i];
      const h = m * H * 0.95;
      g.fillRect(x, (H - h) / 2, 1, h || 1);
    }
    this.ovImg = c;
  }

  /** The key you actually hear: detected key + TON shift (+ tempo, when key lock is off). */
  playingKey(): Key | null {
    if (!this.key || !this.has) return null;
    return shiftKey(this.key, this.keyShift + (this.keyLock ? 0 : 12 * Math.log2(1 + this.tempo)));
  }

  /* ---------- beatgrid ---------- */

  setGrid(g: Grid | null, save = true): void {
    this.grid = g;
    this.bpm = g ? g.bpm : null;
    if (this.ui) this.ui.mtr.textContent = g ? g.meter : '4/4';
    this.updLoop();
    if (save) {
      this.persist();
      if (this.srcFile) this.onAnalyzed?.(this.srcFile, { bpm: this.bpm, dur: this.duration, grid: g, key: this.key, energy: this.energy });
    }
  }

  /** Save grid + cues with the song. */
  private persist(): void {
    if (this.sig) saveMeta(this.sig, { grid: this.grid, cue: this.cuePt, hot: this.hot });
  }

  /** Quantized time (nearest grid line) when QUANTIZE is on. */
  private qt(t: number): number { return this.quantize && this.grid ? snap(this.grid, t) : t; }

  private gridAct(a: string, fine: boolean): void {
    if (a === 'quantize') {
      this.quantize = !this.quantize;
      toast(`Deck ${this.id}: QUANTIZE ${this.quantize ? 'açık' : 'kapalı'}`);
      return;
    }
    const g = this.grid, t = this.currentTime();
    if (!g || !this.has) { toast('Önce şarkı yükle (grid için BPM gerekli)'); return; }
    switch (a) {
      case 'gridLeft': this.setGrid({ ...g, offset: g.offset - (fine ? 0.001 : 0.005) }); break;
      case 'gridRight': this.setGrid({ ...g, offset: g.offset + (fine ? 0.001 : 0.005) }); break;
      case 'downbeat': this.setGrid(downbeatAt(g, t)); toast('Bu vuruş artık bar 1 · phrase başı'); break;
      case 'bpmDown': case 'bpmUp': {
        const d = (a === 'bpmUp' ? 1 : -1) * (fine ? 0.01 : 0.05);
        this.setGrid(setBpmAt(g, Math.round((g.bpm + d) * 1000) / 1000, t));
        break;
      }
      case 'meter': {
        const m = METER_ORDER[(METER_ORDER.indexOf(g.meter) + 1) % METER_ORDER.length];
        this.setGrid({ ...g, meter: m });
        toast(`Ölçü: ${METERS[m].label}${m !== '4/4' ? " (BPM = sekizlik vuruş; gerekirse BPM'e tıklayıp ×2 / ½)" : ''}`);
        break;
      }
    }
  }

  /** Beat phase difference to the other deck in pulses (−0.5…+0.5), or null. */
  phaseDiff(): number | null {
    const o = this.other;
    if (!this.grid || !o.grid || !this.has || !o.has) return null;
    return wrapHalf(phaseAt(o.grid, o.currentTime()) - phaseAt(this.grid, this.currentTime()));
  }

  /** Tempo fader value needed to match the other deck (folding ×2 / ½ for half/double time), or null. */
  private syncTarget(): number | null {
    const o = this.other, own = this.bpm;
    if (!own || !o.bpm) return null;
    const target = o.bpm * (1 + o.tempo);
    const fold = [1, 2, 0.5].map(f => target * f).find(b => Math.abs(b / own - 1) <= 0.16);
    return fold == null ? null : fold / own - 1;
  }

  /** SYNC on: match tempo, then line up the beats (jump by the phase difference). */
  private syncEngage(): void {
    const t = this.syncTarget();
    if (t == null) {
      toast(this.bpm && this.other.bpm ? "Tempo farkı ±%16 dışında (BPM'e tıklayıp ×2 / ½ dene)" : "SYNC için iki deck'te de şarkı ve BPM gerekli");
      return;
    }
    this.other.syncOn = false;
    this.syncSetting = true; this.tempoF.set(t); this.syncSetting = false;
    this.syncOn = true;
    const e = this.phaseDiff();
    if (e != null && this.grid && this.playing && this.other.playing) {
      const d = e * pulseLen(this.grid) * this.sr;
      this.post({ t: 'jump', d }); this.pos += d;
    }
    toast(`Deck ${this.id} SYNC → ${(this.other.bpm! * (1 + this.other.tempo)).toFixed(2)} BPM${this.grid && this.other.grid ? ' · vuruşlar kilitli' : ''}`);
  }

  /** While SYNC is latched: follow the other deck's tempo and pull the beat phase back in line. */
  private syncFollow(now: number): void {
    const t = this.syncTarget();
    if (t != null && Math.abs(t - this.tempo) > 1e-5) { this.syncSetting = true; this.tempoF.set(t); this.syncSetting = false; }
    let bend = 0;
    const e = this.phaseDiff();
    // lock only while both play and nobody is nudging by hand
    if (e != null && this.grid && this.playing && this.other.playing && !this.bend && !this.jogBend && !this.scratching
      && !this.other.bend && !this.other.jogBend && now - this.jogStamp > 500) {
      const sec = e * pulseLen(this.grid);
      if (Math.abs(e) > 0.25) { this.post({ t: 'jump', d: sec * this.sr }); this.pos += sec * this.sr; }
      else if (Math.abs(sec) > 0.002) bend = clamp(sec * 0.8, -0.01, 0.01);   // closes the gap in about a second
    }
    if (bend !== this.syncBend) { this.syncBend = bend; this.applyRate(); }
  }

  /** Phrase · bar counter and beat LEDs. */
  private drawCounter(t: number): void {
    const g = this.grid, ui = this.ui;
    if (!g || !this.has) { setText(ui.bars, ''); if (ui.leds.childElementCount) ui.leds.innerHTML = ''; return; }
    const b = barPos(g, t, this.phraseBars);
    setText(ui.bars, `PHRASE ${b.phrase} · BAR ${b.barInPhrase}/${this.phraseBars}`);
    ui.bars.classList.toggle('end', b.barInPhrase === this.phraseBars);
    if (ui.leds.childElementCount !== b.beatsInBar) ui.leds.innerHTML = '<i></i>'.repeat(b.beatsInBar);
    for (let i = 0; i < b.beatsInBar; i++) ui.leds.children[i].classList.toggle('on', i === b.beat);
  }

  /* ---------- performance pads ---------- */

  setPadMode(m: PadMode): void {
    this.releasePads();
    this.padMode = m;
    toast(`Deck ${this.id} pad: ${PAD_MODES.find(x => x.id === m)!.label} — ${PAD_MODES.find(x => x.id === m)!.help}`);
  }

  cyclePadMode(dir: number): void {
    const i = PAD_MODES.findIndex(m => m.id === this.padMode);
    this.setPadMode(PAD_MODES[(i + dir + PAD_MODES.length) % PAD_MODES.length].id);
  }

  private releasePads(): void {
    for (const i of [...this.padsHeld]) this.pad(i, false);
  }

  /** A pad was pressed (down = true) or released. */
  pad(i: number, down: boolean): void {
    if (down) this.padsHeld.add(i); else this.padsHeld.delete(i);
    const m = this.padMode, has = this.has;
    if (m === 'roll' || m === 'slicer') { this.padHold(i, down); return; }
    if (!down) return;
    switch (m) {
      case 'hot': this.act('hot', i); break;
      case 'loop': if (has) this.beatLoop(LOOP_BEATS[i]); break;
      case 'jump': if (has) this.jumpBeats(JUMP_BEATS[i]); break;
      case 'sampler': playSample(i); break;
      case 'key': if (has) { this.keyShift = KEY_SEMIS[i]; this.updateKeylock(); } break;
    }
  }

  /** Second function (⇧+click, right click, Backspace+key): delete hot cue / load own sampler sound. */
  padAlt(i: number): void {
    if (this.padMode === 'hot') { if (this.hot[i] != null) { this.act('hotDel', i); toast(`Hot cue ${i + 1} silindi`); } return; }
    if (this.padMode !== 'sampler') return;
    if (sampler.slots[i].user && confirm(`Sampler ${i + 1}: kendi sesin "${sampler.slots[i].name}" silinip yerleşik sese dönülsün mü?`)) { void resetSample(i); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = () => { if (inp.files?.[0]) void loadUserSample(i, inp.files[0]); };
    inp.click();
  }

  /** ROLL / SLICER: a slipping loop while the pad is held; the newest held pad wins. */
  private padHold(i: number, down: boolean): void {
    if (!this.has || !this.playing) { if (!down && this.rollPad === i) this.rollOff(); return; }
    if (!down) {
      if (this.rollPad !== i) return;
      const last = [...this.padsHeld].pop();
      if (last == null) { this.rollOff(); return; }
      i = last;   // another pad is still held: continue with it
    }
    const t = this.currentTime(), g = this.grid, pl = this.beatLen();
    if (this.padMode === 'roll') {
      const len = ROLL_BEATS[i] * pl;
      // start on the grid, so the repeats land on the beat
      const s = g ? g.offset + Math.floor((t - g.offset) / len) * len : t;
      this.post({ t: 'roll', on: true, s: s * this.sr, e: (s + len) * this.sr });
    } else {
      if (this.rollPad < 0) this.sliceStart = this.sliceWindow(t);
      const s = this.sliceStart + i * pl;
      this.post({ t: 'roll', on: true, s: s * this.sr, e: (s + pl) * this.sr, jump: true });
    }
    this.rollPad = i;
  }

  private rollOff(): void {
    this.rollPad = -1;
    this.post({ t: 'roll', on: false, s: 0, e: 0 });
  }

  /** Start time of the 8-beat slicer window around t. */
  private sliceWindow(t: number): number {
    const g = this.grid, pl = this.beatLen();
    if (!g) return Math.floor(t / (8 * pl)) * 8 * pl;
    return g.offset + sliceBase(Math.floor((t - g.offset) / pl + 1e-6)) * pl;
  }

  /** Jump by a number of beats (an active loop moves along). */
  jumpBeats(beats: number): void {
    if (!this.has) return;
    const d = beats * this.beatLen();
    if (this.loopOn) { this.loopS += d; this.loopE += d; }
    this.pos = clamp(this.pos + d * this.sr, 0, this.len - 1);
    this.post({ t: 'jump', d: d * this.sr });
  }

  /** Pad labels and lights for the current mode. */
  private drawPads(t: number): void {
    const m = this.padMode;
    this.ui.pmodes.querySelectorAll<HTMLElement>('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    const slice = m === 'slicer' && this.has ? Math.floor((t - this.sliceWindow(t)) / this.beatLen()) : -1;
    for (let i = 0; i < 8; i++) {
      const b = this.q('pad' + i), span = b.firstElementChild as HTMLElement;
      setText(span, padLabel(m, i, { sample: sampler.slots[i].name }));
      let cls = 'pad m-' + m;
      if (m === 'hot' && this.hot[i] != null) cls += ' set';
      if (m === 'loop' && this.loopOn && this.loopBeats === LOOP_BEATS[i]) cls += ' on';
      if ((m === 'roll' || m === 'slicer') && this.rollPad === i) cls += ' on';
      if (m === 'slicer' && slice === i && this.rollPad < 0 && this.playing) cls += ' cur';
      if (m === 'sampler') { if (sampler.voices.has(i)) cls += ' on'; if (sampler.slots[i].user) cls += ' user'; }
      if (m === 'key' && this.keyShift === KEY_SEMIS[i] && (KEY_SEMIS[i] !== 0 || this.has)) cls += ' on';
      if (this.padsHeld.has(i)) cls += ' held';
      if (b.className !== cls) b.className = cls;
    }
  }

  /* ---------- actions ---------- */
  private setPlaying(on: boolean): void {
    if (on && !this.logged && this.sig) { this.logged = true; this.onPlayed?.(this.sig, this.title); }
    this.playing = on;
    this.audible = on || this.audible;
    this.post({ t: 'play', on });
  }

  act(a: string, arg = 0): void {
    const has = this.has;
    switch (a) {
      case 'play':
        if (!has) return;
        if (this.cuePreview) { this.cuePreview = false; return; } // CUE held + PLAY = keep playing
        this.setPlaying(!this.playing);
        break;
      case 'sync':
        if (this.syncOn) { this.syncOn = false; this.syncBend = 0; this.applyRate(); toast(`Deck ${this.id}: SYNC kapalı`); }
        else this.syncEngage();
        break;
      case 'keylock':
        this.keyLock = !this.keyLock; this.updateKeylock();
        toast(`Deck ${this.id}: key lock ${this.keyLock ? 'açık (tempo değişse de ton aynı kalır)' : 'kapalı (tempo ile ton da değişir)'}`);
        break;
      case 'keyUp': case 'keyDown': case 'keyReset':
        this.keyShift = a === 'keyReset' ? 0 : clamp(this.keyShift + (a === 'keyUp' ? 1 : -1), -12, 12);
        this.updateKeylock();
        break;
      case 'loop': if (this.loopOn) this.loopOff(); else this.beatLoop(this.loopBeats); break;
      case 'loopHalf': this.resizeLoop(0.5); break;
      case 'loopDouble': this.resizeLoop(2); break;
      case 'jumpFwd': case 'jumpBack': this.beatJump(a === 'jumpFwd' ? 1 : -1); break;
      case 'padModeNext': this.cyclePadMode(1); break;
      case 'padModePrev': this.cyclePadMode(-1); break;
      case 'load': this.file.click(); break;
      case 'demo': void this.loadDemo(); break;
      case 'tempoDown': this.tempoF.nudge(-1); break;
      case 'tempoUp': this.tempoF.nudge(1); break;
      case 'tempoReset': this.tempoF.set(0); break;
      case 'faderDown': this.chF.nudge(-1); break;
      case 'faderUp': this.chF.nudge(1); break;
      case 'filterDown': this.filK.nudge(-1); break;
      case 'filterUp': this.filK.nudge(1); break;
      case 'filterReset': this.filK.set(0); break;
      case 'killLow': this.kills.lo = !this.kills.lo; this.applyEQ(); break;
      case 'killMid': this.kills.mid = !this.kills.mid; this.applyEQ(); break;
      case 'killHigh': this.kills.hi = !this.kills.hi; this.applyEQ(); break;
      case 'eqReset': this.hiK.set(0); this.midK.set(0); this.loK.set(0); this.kills = { lo: false, mid: false, hi: false }; this.applyEQ(); break;
      case 'fx': this.fxOn = !this.fxOn; this.applyFX(); break;
      case 'pfl':
        this.pfl = !this.pfl;
        if (this.cueG) ramp(this.cueG.gain, this.pfl ? 1 : 0, 0.01);
        if (this.pfl && !phonesAudible()) toast("Tek çıkışta kulaklık CUE'sunu duymak için mikserdeki SPLIT'i aç (sol kulak: CUE, sağ kulak: master)");
        break;
      case 'fxDown': this.fxK.nudge(-1); break;
      case 'fxUp': this.fxK.nudge(1); break;
      case 'vinyl': this.vinyl = !this.vinyl; toast(this.vinyl ? 'VINYL açık: jog ile scratch' : 'VINYL kapalı: jog sadece tempo dürtme'); break;
      case 'slip': this.slip = !this.slip; this.post({ t: 'slip', on: this.slip }); break;
      case 'reverse': if (!has) return; this.reverse = !this.reverse; this.post({ t: 'reverse', on: this.reverse }); break;
      case 'brake': if (has && this.playing) this.post({ t: 'vinyl', fx: 'brake', dur: 1.2 }); break;
      case 'spinback': if (has && this.playing) this.post({ t: 'vinyl', fx: 'spin', dur: 1.0 }); break;
      case 'hot': {
        if (!has) return;
        const h = this.hot[arg], t = this.currentTime();
        if (h == null) { this.hot[arg] = this.qt(t); this.persist(); break; }
        // quantized jump while playing: land at the same spot within the beat, so the rhythm does not stumble
        const keep = this.quantize && this.grid && this.playing ? t - snap(this.grid, t) : 0;
        this.seek(h + keep);
        if (!this.playing) this.setPlaying(true);
        break;
      }
      case 'hotDel': this.hot[arg] = null; this.persist(); break;
    }
  }

  /** Press-and-hold controls (keyboard keydown/keyup or pointer down/up). */
  hold(a: string, on: boolean): void {
    switch (a) {
      case 'cue': if (on) this.cueDown(); else this.cueUp(); break;
      case 'censor': if (this.has || !on) { this.censor = on; this.post({ t: 'censor', on }); } break;
      case 'bendDown': this.setBend(on ? -0.04 : 0); break;
      case 'bendUp': this.setBend(on ? 0.04 : 0); break;
    }
  }

  /**
   * CUE like a CDJ: while playing -> back to the cue point and stop.
   * Paused away from the cue -> set a new cue here. Paused on the cue -> play while held (preview).
   */
  private cueDown(): void {
    if (!this.has) return;
    if (this.playing && !this.cuePreview) { this.setPlaying(false); this.seek(this.cuePt); return; }
    const t = this.currentTime();
    if (Math.abs(t - this.cuePt) < 0.02) { this.cuePreview = true; this.setPlaying(true); }
    else { this.cuePt = this.qt(t); if (this.cuePt !== t) this.seek(this.cuePt); this.persist(); }
  }

  private cueUp(): void {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this.setPlaying(false);
    this.seek(this.cuePt);
  }

  seek(t: number): void {
    if (!this.len) return;
    const p = clamp(t, 0, this.duration - 0.05) * this.sr;
    this.pos = p; this.posAt = engine.ctx?.currentTime ?? 0;
    this.post({ t: 'seek', pos: p });
  }

  setBend(v: number): void { this.bend = v; this.applyRate(); }

  applyRate(): void { this.post({ t: 'tempo', v: this.speed() }); this.updateKeylock(); }

  beatLen(): number { return this.grid ? pulseLen(this.grid) : 60 / (this.bpm || 120); }

  beatLoop(beats: number): void {
    if (!this.has) return;
    ensureCtx();
    if (this.loopOn && this.loopBeats === beats) { this.loopOff(); return; }
    this.loopBeats = beats;
    // quantized: the loop starts on the nearest beat line
    this.loopS = this.qt(this.currentTime());
    this.loopE = this.loopS + beats * this.beatLen();
    this.loopOn = true;
    this.sendLoop();
    this.updLoop();
  }

  private loopOff(): void { this.loopOn = false; this.sendLoop(); this.updLoop(); }

  private sendLoop(): void { this.post({ t: 'loop', on: this.loopOn, s: this.loopS * this.sr, e: this.loopE * this.sr }); }

  resizeLoop(f: number): void {
    this.loopBeats = clamp(this.loopBeats * f, 0.125, 32);
    if (this.loopOn) { this.loopE = this.loopS + this.loopBeats * this.beatLen(); this.sendLoop(); }
    this.updLoop();
  }

  /** Jump by the current loop size (in beats); an active loop moves along. */
  beatJump(dir: number): void {
    if (!this.has) return;
    const d = dir * this.loopBeats * this.beatLen();
    if (this.loopOn) { this.loopS += d; this.loopE += d; }
    this.pos = clamp(this.pos + d * this.sr, 0, this.len - 1);
    this.post({ t: 'jump', d: d * this.sr });
  }

  updLoop(): void {
    const b = this.loopBeats, s = b < 1 ? '1/' + Math.round(1 / b) : String(b);
    if (this.ui) this.ui.lp.textContent = this.loopOn ? `LOOP ${s} beat` : `loop/jump: ${s}`;
    this.applyFX();
  }

  applyEQ(): void {
    const k = this.kills;
    if (!this.loK) return;
    this.hiK.el.classList.toggle('kill', k.hi);
    this.midK.el.classList.toggle('kill', k.mid);
    this.loK.el.classList.toggle('kill', k.lo);
    if (!this.hi || !this.mid || !this.lo || !this.iso) return;
    const iso = mixerCfg.eq === 'iso', x = this.iso;
    ramp(x.eqG.gain, iso ? 0 : 1, 0.01); ramp(x.isoG.gain, iso ? 1 : 0, 0.01);
    // EQ: shelves, kill = −40 dB · ISOLATOR: band gains, knob fully down or kill = band gone
    ramp(this.hi.gain, k.hi ? -40 : this.hiK.v, 0.005);
    ramp(this.mid.gain, k.mid ? -40 : this.midK.v, 0.005);
    ramp(this.lo.gain, k.lo ? -40 : this.loK.v, 0.005);
    ramp(x.hi.gain, k.hi ? 0 : isoGain(this.hiK.v), 0.005);
    ramp(x.mid.gain, k.mid ? 0 : isoGain(this.midK.v), 0.005);
    ramp(x.lo.gain, k.lo ? 0 : isoGain(this.loK.v), 0.005);
  }

  /** The channel FX knob: FİLTRE, SPACE, NOISE or CRUSH (chosen for both channels in the FX bar). */
  applyFilter(v: number): void {
    const f = this.fil, x = this.cfx;
    if (!f || !x) return;
    const type = chanFx.type, a = Math.abs(v) < 0.03 ? 0 : Math.abs(v), c = cutoff(v);
    const set = (bq: BiquadFilterNode, q: number) => { bq.type = c.type; ramp(bq.frequency, c.f); bq.Q.value = q; };
    // the main filter works only in FİLTRE mode
    if (type === 'filter') set(f, a ? 1.2 : 0.7); else { f.type = 'lowpass'; ramp(f.frequency, 22000); f.Q.value = 0.7; }
    ramp(x.spSend.gain, type === 'space' ? a * 1.2 : 0, 0.02);
    if (type === 'space') set(x.spFilt, 0.7);
    const cr = type === 'crush' ? a : 0;
    ramp(x.dry.gain, 1 - cr, 0.01); ramp(x.crWet.gain, cr, 0.01);
    if (type === 'crush') {
      set(x.crFilt, 0.7);
      const steps = Math.max(2, Math.round(48 * (1 - a) ** 2 + 2));
      if (steps !== x.steps) { x.steps = steps; x.crush.curve = crushCurve(steps) as Float32Array<ArrayBuffer>; }
    }
    if (type === 'noise') set(x.nFilt, 0.9);
    this.noiseLevel = type === 'noise' ? a * 0.18 : 0;
    ramp(x.nGain.gain, this.playing ? this.noiseLevel : 0, 0.02);
  }
  /** noise only sounds while the deck plays */
  private noiseLevel = 0;
  private noiseOn = false;

  applyFX(): void {
    this.fxBtn?.classList.toggle('on', this.fxOn);
    if (!this.fxSend || !this.delay) return;
    ramp(this.fxSend.gain, this.fxOn ? this.fxK.v : 0, 0.01);
    ramp(this.delay.delayTime, clamp(this.beatLen() * 0.75 / (1 + this.tempo), 0.05, 3.9), 0.05);
  }

  /* ---------- per-frame UI ---------- */
  frame(now: number): void {
    const dur = this.duration, t = this.currentTime(), ui = this.ui;
    if (this.jogBend && now - this.jogStamp > 90) { this.jogBend = 0; this.applyRate(); }
    // a scratching hand that stops moving holds the record still
    if (this.scratching && !this.scratchIdle && now - this.scratchLast > 35) this.setScratch(true, 0);
    if (this.syncOn) this.syncFollow(now);
    if (this.cfx && this.noiseOn !== (this.playing && this.noiseLevel > 0)) {
      this.noiseOn = this.playing && this.noiseLevel > 0;
      ramp(this.cfx.nGain.gain, this.noiseOn ? this.noiseLevel : 0, 0.05);
    }
    this.drawCounter(t);
    ui.platter.style.transform = `rotate(${t * 360 / SEC_PER_REV}deg)`;
    setText(ui.jt, fmt(t));
    setText(ui.jr, '-' + fmt(dur - t));
    setText(ui.rem, '-' + fmt(dur - t));
    const tp = this.tempo * 100;
    setText(ui.tp, (tp >= 0 ? '+' : '') + tp.toFixed(2) + '%');
    ui.kl.style.color = this.keyLock ? 'var(--green)' : '';
    const k = this.playingKey(), ok = this.other.playingKey();
    setText(ui.key, k ? `${keyName(k)} · ${wheelCode(k)}` : '');
    ui.key.className = 'key' + (k && ok ? ' c' + compat(k, ok) : '');
    setText(ui.ksv, (this.keyShift > 0 ? '+' : '') + this.keyShift);
    ui.ksv.classList.toggle('on', this.keyShift !== 0);
    const bpm = this.bpm ? (this.bpm * (1 + this.tempo)).toFixed(this.bpm % 1 ? 2 : 1) : '—';
    const bpmHtml = `${bpm} <small>BPM</small>`;
    if (ui.bpm.innerHTML !== bpmHtml) ui.bpm.innerHTML = bpmHtml;

    // LEDs
    const pl = this.q('play');
    pl.classList.toggle('on', this.playing);
    pl.classList.toggle('blink', !this.playing && this.has);
    this.q('cue').classList.toggle('on', !this.playing && this.has && Math.abs(t - this.cuePt) < 0.05);
    this.q('keylock').classList.toggle('on', this.keyLock);
    this.q('sync').classList.toggle('on', this.syncOn);
    this.q('quantize').classList.toggle('on', this.quantize);
    this.q('loop').classList.toggle('on', this.loopOn);
    this.q('vinyl').classList.toggle('on', this.vinyl);
    this.q('slip').classList.toggle('on', this.slip);
    this.q('reverse').classList.toggle('on', this.reverse);
    this.q('censor').classList.toggle('on', this.censor);
    this.pflBtn.classList.toggle('on', this.pfl);
    this.drawPads(t);

    // VU
    if (this.an) {
      this.an.getFloatTimeDomainData(this.anBuf);
      let m = 0;
      for (const v of this.anBuf) { const a = Math.abs(v); if (a > m) m = a; }
      const db = 20 * Math.log10(m || 1e-6);
      this.vu = Math.max(this.vu * 0.9, clamp((db + 48) / 48, 0, 1));
      this.vuEl.style.height = this.vu * 100 + '%';
    }
    this.drawWaves(t, dur);
  }

  private drawWaves(t: number, dur: number): void {
    const c = this.ws, g = c.getContext('2d')!, W = c.width, H = c.height, dpr = devicePixelRatio;
    g.fillStyle = '#0f1114'; g.fillRect(0, 0, W, H);
    // 7 s of *real* time across the view: at the same BPM both decks show beats the same width apart
    const sp = this.playing ? Math.max(0.25, this.speed()) : 1 + this.tempo;
    const span = Deck.span, x0 = W / 2, sx = W / span / sp;  // pixels per second of track
    const X = (tt: number) => x0 + (tt - t) * sx;
    if (this.bands) {
      // 3 colour bands, drawn on top of each other: low (widest) · mid · high
      const b = this.bands, n = b.length / 3, step = Math.max(1, Math.floor(W / 900));
      const fpp = step / sx * PPS;                              // analysis frames per drawn column
      for (let band = 0; band < 3; band++) {
        g.fillStyle = BAND_COL[band];
        for (let x = 0; x < W; x += step) {
          const tt = t + (x - x0) / sx, i0 = Math.floor(tt * PPS), i1 = Math.max(i0 + 1, Math.floor(i0 + fpp));
          if (i1 <= 0 || i0 >= n) continue;
          let m = 0;
          for (let i = Math.max(0, i0); i < i1 && i < n; i++) { const v = b[i * 3 + band]; if (v > m) m = v; }
          const h = m * H * (band === 0 ? 0.95 : band === 1 ? 0.8 : 0.6);
          g.globalAlpha = tt < t ? 0.45 : 1;
          g.fillRect(x, (H - h) / 2, step, h);
        }
      }
      g.globalAlpha = 1;
      const gr = this.grid;
      if (gr) {
        const pl = pulseLen(gr), half = W / 2 / sx;
        const k0 = Math.ceil((t - half - gr.offset) / pl), k1 = Math.floor((t + half - gr.offset) / pl);
        const thin = pl * sx < 6 * dpr;                        // too dense: only bar lines
        for (let k = k0; k <= k1; k++) {
          const kind = lineKind(gr, k, this.phraseBars);
          if (thin && kind < 2) continue;
          const x = X(gr.offset + k * pl);
          if (kind === 3) { g.fillStyle = '#ff4545cc'; g.fillRect(x - dpr, 0, 2 * dpr, H); }
          else if (kind === 2) { g.fillStyle = '#ffffffaa'; g.fillRect(x - dpr / 2, 0, dpr * 1.5, H); }
          else if (kind === 1) { g.fillStyle = '#ffffff70'; g.fillRect(x, 0, dpr, H); }
          else { g.fillStyle = '#ffffff1c'; g.fillRect(x, H * 0.35, dpr, H * 0.3); }
        }
      }
    } else { g.fillStyle = '#ffffff22'; g.fillRect(0, H / 2, W, 1); }
    if (this.loopOn) { g.fillStyle = '#3ce37a30'; g.fillRect(X(this.loopS), 0, (this.loopE - this.loopS) * sx, H); }
    const mark = (tt: number, col: string, w: number) => {
      const x = X(tt);
      if (x >= -2 && x <= W + 2) { g.fillStyle = col; g.fillRect(x - w / 2, 0, w, H); }
    };
    if (dur) {
      mark(this.cuePt, '#ffb020', 2 * dpr);
      this.hot.forEach(h => { if (h != null) mark(h, '#b98bff', 2 * dpr); });
    }
    g.fillStyle = '#fff'; g.fillRect(x0 - dpr, 0, 2 * dpr, H);

    // overview
    const o = this.wo, og = o.getContext('2d')!, OW = o.width, OH = o.height;
    og.fillStyle = '#0f1114'; og.fillRect(0, 0, OW, OH);
    if (this.ovImg) og.drawImage(this.ovImg, 0, 0, OW, OH);
    if (dur) {
      const px = t / dur * OW;
      og.fillStyle = '#0f1114aa'; og.fillRect(0, 0, px, OH);
      og.fillStyle = '#ffb020'; og.fillRect(this.cuePt / dur * OW - 1, 0, 2, OH);
      og.fillStyle = '#b98bff';
      this.hot.forEach(h => { if (h != null) og.fillRect(h / dur * OW - 1, 0, 2, OH); });
      og.fillStyle = '#fff'; og.fillRect(px - 1, 0, 2, OH);
    }
  }
}
