/**
 * Lesson engine: one step at a time — a friendly explanation, the control lit up (spotlight), the key to press,
 * an automatic check of whether you did it, instant feedback and points. "Göster" plays a ghost-hand demo first.
 */
import type { Deck } from '../engine/deck';
import type { Mixer } from '../engine/mixer';
import type { Fader } from '../ui/controls';
import { ensureCtx } from '../engine/context';
import { runGhost, stopGhost, type GhostStep } from './ghost';
import { BADGES, finishLesson, progress, save } from './progress';
import { setRules } from './rules';

export interface Ctx { decks: Deck[]; mixer: Mixer; xf: Fader }
/** Scratch space of the current step (baselines, "was seen" flags, hold timers). */
export interface StepState { t0: number; d: Record<string, number | boolean> }

export interface Step {
  /** explanation (simple HTML allowed) */
  say: string;
  /** keys to press, shown as keycaps, e.g. "Q" or "⇧ E" */
  keys?: string;
  /** control to light up */
  at?: string | ((c: Ctx) => Element | null);
  /**
   * done? polled ~20× per second; steps without a check get a "Devam" button.
   * Returning a string = not done, and show this as feedback (e.g. "Erken bastın, tekrar dene").
   */
  check?: (c: Ctx, s: StepState) => boolean | string;
  /** the check must stay true this long (ms) */
  hold?: number;
  hint?: string;
  /** ghost-hand demo ("Göster") */
  show?: (c: Ctx) => GhostStep[];
  /** runs when the step starts (and again after a demo): take baselines here */
  enter?: (c: Ctx, s: StepState) => void;
}

export interface Lesson {
  id: string;
  no: number;
  title: string;
  /** one line: what you will be able to do */
  goal: string;
  minutes: number;
  setup?: (c: Ctx) => Promise<void>;
  teardown?: (c: Ctx) => void;
  steps: Step[];
  /** shown on the summary card */
  learned: string[];
  /** custom final score (practice modes) */
  score?: (c: Ctx, secs: number, base: number) => number;
  /** "şunu düzelt" lines for the summary card (practice / exam) */
  feedback?: () => string[];
  practice?: boolean;
}

let ctx: Ctx;
let lesson: Lesson | null = null;
let idx = 0;
let st: StepState = { t0: 0, d: {} };
let earned = 0, maxPts = 0, stepPts = 10;
let started = 0, holdSince = 0, demo = false, passed = false;
let timer: ReturnType<typeof setInterval> | undefined;
let onExit: (() => void) | undefined;

const $ = (s: string) => document.querySelector<HTMLElement>(s)!;
const keycaps = (k: string) => k.split(' ').map(x => x === '+' || x === '/' || x === 'ya' || x === 'da' ? x : `<kbd>${x}</kbd>`).join(' ');

export function initAcademyEngine(c: Ctx, exitCb: () => void): void { ctx = c; onExit = exitCb; }
export function inLesson(): boolean { return lesson != null; }

function target(s: Step): Element | null {
  if (!s.at) return null;
  return typeof s.at === 'function' ? s.at(ctx) : document.querySelector(s.at);
}

function spotlight(): void {
  const spot = $('#spot'), s = lesson?.steps[idx], el = s && target(s);
  if (!el) { spot.style.display = 'none'; return; }
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  // keep the coach card away from the lit control
  $('#coach').classList.toggle('top', r.top + r.height / 2 > innerHeight / 2);
}

function render(msg?: string, cls = ''): void {
  if (!lesson) return;
  const s = lesson.steps[idx], n = lesson.steps.length;
  $('#coachTitle').textContent = `${lesson.practice ? '' : 'Ders ' + lesson.no + ' · '}${lesson.title}`;
  $('#coachDots').innerHTML = lesson.steps.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"></i>`).join('');
  $('#coachText').innerHTML = s.say;
  $('#coachKeys').innerHTML = s.keys ? 'Bas: ' + keycaps(s.keys) : '';
  $('#coachMsg').innerHTML = msg ?? '';
  $('#coachMsg').className = cls;
  $('#coachHint').style.display = s.hint ? '' : 'none';
  $('#coachShow').style.display = s.show ? '' : 'none';
  $('#coachNext').style.display = s.check ? 'none' : '';
  $('#coachNext').textContent = idx === n - 1 && !s.check ? 'Bitir' : 'Devam';
  $('#coachScore').textContent = maxPts ? `${earned} puan` : '';
}

function enterStep(i: number): void {
  idx = i; passed = false; holdSince = 0; stepPts = 10;
  st = { t0: performance.now(), d: {} };
  const s = lesson!.steps[i];
  s.enter?.(ctx, st);
  if (s.check) maxPts += 10;
  render();
  spotlight();
}

function next(): void {
  if (!lesson) return;
  if (idx + 1 < lesson.steps.length) enterStep(idx + 1);
  else void finish();
}

function tick(): void {
  if (!lesson) return;
  spotlight();
  if (demo || passed) return;
  const s = lesson.steps[idx];
  if (!s.check) return;
  const res = s.check(ctx, st), now = performance.now();
  if (typeof res === 'string') { holdSince = 0; if (res) render(res, 'hint'); return; }
  if (!res) { holdSince = 0; return; }
  if (s.hold) {
    if (!holdSince) holdSince = now;
    const left = s.hold - (now - holdSince);
    if (left > 0) { render(`Böyle tut… ${Math.ceil(left / 1000)}`, 'wait'); return; }
  }
  passed = true;
  earned += stepPts;
  render(['✓ Harika!', '✓ Süper!', '✓ Tam olarak bu!', '✓ Aferin!'][idx % 4] + ` +${stepPts}`, 'ok');
  setTimeout(next, 1100);
}

export async function startLesson(l: Lesson): Promise<void> {
  ensureCtx();
  stopLesson(false);
  lesson = l; earned = 0; maxPts = 0; started = performance.now();
  document.body.classList.add('in-lesson');
  $('#coach').style.display = 'block';
  $('#coachText').textContent = 'Hazırlanıyor… (demo parçalar yükleniyor)';
  $('#coachTitle').textContent = `${l.practice ? '' : 'Ders ' + l.no + ' · '}${l.title}`;
  for (const id of ['#coachDots', '#coachKeys', '#coachMsg', '#coachScore']) $(id).innerHTML = '';
  for (const id of ['#coachShow', '#coachHint', '#coachNext']) $(id).style.display = 'none';
  await l.setup?.(ctx);
  if (lesson !== l) return;
  enterStep(0);
  // practice time counts while a lesson is open
  timer = setInterval(() => { tick(); }, 50);
}

function practiceSecs(): number { return Math.round((performance.now() - started) / 1000); }

/** Leave the lesson (teardown, rules off, practice time saved). */
export function stopLesson(ask = true): void {
  if (!lesson) return;
  if (ask && !confirm('Dersten çıkılsın mı? (İlerleme bu ders için kaydedilmez)')) return;
  clearInterval(timer);
  stopGhost();
  lesson.teardown?.(ctx);
  progress.practiceSecs += practiceSecs(); save();
  setRules({ noSync: false, hideBpm: false });
  lesson = null;
  document.body.classList.remove('in-lesson');
  $('#coach').style.display = 'none';
  $('#spot').style.display = 'none';
  onExit?.();
}

async function finish(): Promise<void> {
  const l = lesson!, secs = practiceSecs();
  const base = maxPts ? Math.round(earned / maxPts * 100) : 100;
  const score = Math.max(0, Math.min(100, Math.round(l.score ? l.score(ctx, secs, base) : base)));
  if (l.id === 'trainer') progress.trainerBest = Math.max(progress.trainerBest, score);
  if (l.id === 'exam') progress.examBest = Math.max(progress.examBest, score);
  const r = finishLesson(progress, l.id, score, secs);
  stopLesson(false);
  save();
  showSummary(l, score, r.stars, secs, r.xp, r.badges);
}

function showSummary(l: Lesson, score: number, stars: number, secs: number, xp: number, badges: string[]): void {
  const m = Math.floor(secs / 60), s = secs % 60;
  $('#summaryBox').innerHTML = `
    <div class="sumStars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>
    <h2>${l.practice ? l.title : `Ders ${l.no} bitti: ${l.title}`}</h2>
    <div class="sumRow"><b>${score}</b><small>/ 100 puan</small><b>+${xp}</b><small>XP</small><b>${m}:${String(s).padStart(2, '0')}</b><small>süre</small></div>
    ${l.feedback ? `<h3>Değerlendirme</h3><ul class="fb">${l.feedback().map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${l.learned.length ? `<h3>Öğrendiklerin</h3><ul>${l.learned.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}
    ${badges.length ? `<h3>Yeni rozet</h3><div class="badges">${badges.map(b => `<span class="badge">${BADGES[b].icon} ${BADGES[b].name}</span>`).join('')}</div>` : ''}
    <div class="sumBtns"><button class="hbtn" id="sumAgain">Tekrar</button><button class="hbtn" id="sumMenu">Akademi</button><button class="hbtn primary" id="sumNext">Devam</button></div>`;
  $('#summary').classList.add('show');
  const close = () => $('#summary').classList.remove('show');
  $('#sumAgain').onclick = () => { close(); void startLesson(l); };
  $('#sumMenu').onclick = () => { close(); summaryNext?.('menu', l); };
  $('#sumNext').onclick = () => { close(); summaryNext?.('next', l); };
}

let summaryNext: ((what: 'menu' | 'next', l: Lesson) => void) | undefined;
export function onSummary(fn: typeof summaryNext): void { summaryNext = fn; }

/** Coach card buttons. */
export function setupCoach(): void {
  $('#coachNext').onclick = () => next();
  $('#coachSkip').onclick = () => { if (lesson) { stepPts = 0; render('Adım atlandı', 'wait'); setTimeout(next, 500); } };
  $('#coachExit').onclick = () => stopLesson();
  $('#coachHint').onclick = () => {
    const s = lesson?.steps[idx];
    if (!s?.hint) return;
    if (stepPts > 7) stepPts -= 3;
    render(`💡 ${s.hint}`, 'hint');
  };
  $('#coachShow').onclick = async () => {
    const s = lesson?.steps[idx];
    if (!s?.show || demo) return;
    demo = true;
    if (stepPts > 8) stepPts -= 2;
    await runGhost(s.show(ctx), line => render(`🖐 ${line}`, 'demo'));
    demo = false;
    st = { t0: performance.now(), d: {} };
    s.enter?.(ctx, st);
    render('Şimdi sen yap 👇', 'demo');
  };
}
