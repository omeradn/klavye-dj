/**
 * Lessons 5–10 (mixing techniques) and the transition exam. Built-in demos have a fixed structure:
 * intro bars 0–15 · build 16–31 · drop 32–63 · break 64–71 · drop 72–87 · outro 88–103 (phrases of 8 bars).
 */
import type { Ctx, Lesson } from './engine';
import type { Deck } from '../engine/deck';
import { ritimFx } from '../engine/beatfx';
import { setChanFx } from '../engine/chanfx';
import { engine } from '../engine/context';
import { audible, barTime, bassOn, phraseOffset, startWatch } from './mixhelp';
import { phaseMs, prep } from './lessons';

const A = (c: Ctx) => c.decks[0], B = (c: Ctx) => c.decks[1];

/** A playing from `aBar`, B parked at its start with SYNC on (tempo follows A); B's fader optionally down. */
async function prepMix(c: Ctx, a: number, b: number, aBar: number, bDown = true): Promise<void> {
  await prep(c, a, b);
  setChanFx('filter');
  const da = A(c), db = B(c);
  if (da.grid) da.seek(barTime(da.grid, aBar));
  db.act('sync');
  if (bDown) db.chF.set(0);
  da.act('play');
}

/** The phrase-start rule for starting a deck: ±1 beat passes; otherwise park it again and explain. */
function phraseStart(d: Deck, ref: Deck, watch: ReturnType<typeof startWatch>): boolean | string {
  const off = watch(d, ref);
  if (off == null) return d.playing;
  if (Math.abs(off) <= 1) return true;
  d.stop(); d.seek(0);
  return off < 0 ? `${Math.abs(off).toFixed(1)} vuruş erken bastın. Sayaç BAR 1/8'e dönünce, ilk vuruşta bas. Tekrar dene.`
    : `${off.toFixed(1)} vuruş geç kaldın. BAR 8/8 sarı yanınca say: 4-3-2-1… ve ilk vuruşta bas.`;
}

const phraseHint = 'Deck A\'nın sayacına bak: "BAR 8/8" sarı yanınca son bardasın. Işıklar 4-3-2-1 sayar; kırmızı ilk ışık yanarken bas.';

let watch = startWatch();

const L5: Lesson = {
  id: 'l5', no: 5, title: 'Beat, bar, phrase', minutes: 6,
  goal: 'Müziği saymayı öğren: 4 vuruş = 1 bar, 8 bar = 1 phrase',
  learned: ['1 bar = 4 vuruş, 1 phrase = 8 bar (32 vuruş)', 'Şarkıda her şey phrase başında değişir (kırmızı çizgi)', 'İkinci şarkıyı phrase başında başlatmak'],
  setup: c => prep(c, 1, 3),
  steps: [
    { at: '#deckA .dinfo', say: 'Dans müziği <b>4\'er vuruşla</b> sayılır: 4 vuruş = <b>1 bar</b>. <b>8 bar</b> = 1 <b>phrase</b>. Şarkıda yeni bir şey (bas girer, melodi değişir) hep phrase başında olur.' },
    { at: '#deckA .dinfo', keys: 'Q', say: '<b>Q</b> ile A\'yı çal ve sağdaki sayaca bak: <b>PHRASE · BAR x/8</b>. Küçük ışıklar her vuruşta kayar; kırmızı olan barın 1. vuruşu.', check: c => A(c).playing },
    { at: '.waves', say: 'Dalga formunda <b>kırmızı çizgiler</b> phrase başları, beyaz çizgiler bar başları. Dinle: kırmızı çizgiden geçerken müzik bir şey değiştiriyor mu? Bir phrase boyunca dinle, sonra <b>Devam</b>.' },
    {
      at: '#deckA [data-a=pad0]', keys: '1', say: 'Şimdi sen say: bir sonraki <b>phrase başında</b> (BAR 1/8\'in ilk vuruşu) tam o anda <b>1</b>\'e bas (hot cue koyar).',
      enter: c => { A(c).hot[0] = null; },
      check: c => {
        const a = A(c), h = a.hot[0];
        if (h == null || !a.grid) return false;
        const off = phraseOffset(a.grid, h, a.phraseBars);
        if (Math.abs(off) < 0.5) return true;
        a.hot[0] = null;
        return `${Math.abs(Math.round(off))} vuruş ${off < 0 ? 'erken' : 'geç'}. Bir sonraki phrase başında tekrar dene.`;
      },
      hint: phraseHint,
    },
    {
      at: '#deckB [data-a=play]', keys: 'Y', say: 'B\'deki şarkı başından hazır (SYNC açık, temposu A\'ya eşit). A\'nın bir sonraki <b>phrase başında</b> <b>Y</b> ile B\'yi başlat. İki şarkının phrase\'leri üst üste gelir.',
      enter: () => { watch = startWatch(); },
      check: c => phraseStart(B(c), A(c), watch),
      hint: phraseHint,
    },
    { at: '.waves', say: 'Dinle: iki şarkının kırmızı çizgileri birlikte geçiyor. DJ\'ler geçişleri hep böyle, <b>phrase\'e phrase</b> yapar; yoksa kulağa "yanlış yerden girdi" gibi gelir.' },
    { at: '.console', keys: 'Q + Y', say: '<b>Q</b> ve <b>Y</b> ile ikisini de durdur.', check: c => !A(c).playing && !B(c).playing },
  ],
};

const L6: Lesson = {
  id: 'l6', no: 6, title: 'EQ ile geçiş (bas değişimi)', minutes: 7,
  goal: 'İki şarkının basını aynı anda çaldırmadan geçiş yap',
  learned: ['İki bas aynı anda çalarsa ses çamurlaşır', 'Gelen şarkı basız girer (LOW kill), phrase başında bas el değiştirir', 'Giden şarkının fader\'ı sonra iner'],
  setup: c => prepMix(c, 1, 3, 24),
  steps: [
    { at: '.mixer', say: 'En temel geçiş: <b>bas değişimi</b>. İki şarkının kick ve basları aynı anda çalarsa ses çamurlaşır. Kural: <b>aynı anda tek bas</b>. A çalıyor; B hazır, fader\'ı kapalı.' },
    { at: '#chB [data-a=killLow]', keys: 'N', say: 'Önce B\'nin basını kes: <b>N</b> (B LOW kill). Düğme kırmızı çerçeve alır.', check: c => B(c).kills.lo },
    {
      at: '#deckB [data-a=play]', keys: 'Y', say: 'A\'nın bir sonraki <b>phrase başında</b> <b>Y</b> ile B\'yi başlat (henüz duyulmuyor, fader kapalı).',
      enter: () => { watch = startWatch(); }, check: c => phraseStart(B(c), A(c), watch), hint: phraseHint,
    },
    { at: '#chB [data-a=fader]', keys: '⇧ J (basılı tut)', say: 'B\'nin kanal fader\'ını yukarı kaldır: <b>⇧J</b>. B basız girdiği için çakışma yok; sadece hi-hat ve melodisi duyulur.', check: c => B(c).chF.v > 0.7, hint: 'Shift + J basılı tut, ya da B\'nin KANAL fader\'ını fareyle yukarı sürükle.' },
    {
      at: '.mixer', keys: 'Z + N', say: 'Şimdi asıl an: bir sonraki <b>phrase başında</b> bası el değiştir: <b>Z</b> (A\'nın basını kes) ve hemen <b>N</b> (B\'nin basını aç).',
      enter: (_c, s) => { s.d.both = 0; s.d.last = performance.now(); },
      check: (c, s) => {
        const a = A(c), b = B(c), now = performance.now(), dt = now - (s.d.last as number);
        s.d.last = now;
        if (bassOn(a) && bassOn(b) && audible(b, c.mixer.xfVal) > 0.3) s.d.both = (s.d.both as number) + dt;
        if (!(a.kills.lo && !b.kills.lo)) return (s.d.both as number) > 1500 ? 'İki bas birden çalıyor! A\'nın basını kes (Z).' : false;
        return true;
      },
      hint: 'Önce Z (A\'nın LOW kill\'i yanar), hemen ardından N (B\'nin LOW kill\'i söner). İkisi arasında yarım saniyeden az olsun.',
    },
    { at: '#chA [data-a=fader]', keys: '⇧ A (basılı tut)', say: 'Bas artık B\'de. A\'yı yavaşça çıkar: <b>⇧A</b> ile A\'nın fader\'ını indir.', check: c => A(c).chF.v < 0.1 },
    { at: '#deckA [data-a=play]', keys: 'Q', say: 'A artık duyulmuyor; <b>Q</b> ile durdur. Tebrikler, ilk gerçek geçişin bu!', check: c => !A(c).playing },
    { at: '.console', keys: 'Y', say: 'Son olarak <b>Y</b> ile B\'yi de durdur.', check: c => !B(c).playing },
  ],
};

const L7: Lesson = {
  id: 'l7', no: 7, title: 'Filtre ile geçiş', minutes: 6,
  goal: 'Filtreyle giden şarkıyı inceltip yumuşakça çıkar',
  learned: ['Sağa çevrilen filtre (high-pass) basları ve gövdeyi keser', 'Filtre + fader birlikte = yumuşak, "uzaklaşan" geçiş', 'Bitince filtreyi ortalamayı unutma (⇧G)'],
  setup: c => prepMix(c, 1, 3, 40),
  steps: [
    { at: '#chA [data-a=filter]', say: 'Bu geçişte A\'yı <b>filtreyle</b> inceltip çıkaracağız: düğme sağa döndükçe önce bas, sonra gövde kaybolur, şarkı "uzaklaşır".' },
    { at: '#deckB [data-a=play]', keys: 'Y', say: 'A\'nın <b>phrase başında</b> <b>Y</b> ile B\'yi başlat.', enter: () => { watch = startWatch(); }, check: c => phraseStart(B(c), A(c), watch), hint: phraseHint },
    { at: '#chB [data-a=fader]', keys: '⇧ J', say: '<b>⇧J</b> ile B\'nin fader\'ını aç.', check: c => B(c).chF.v > 0.7 },
    { at: '#chA [data-a=filter]', keys: '⇧ F (basılı tut)', say: 'Şimdi <b>⇧F</b>\'yi basılı tutarak A\'nın filtresini yavaşça <b>sağa</b> çevir (8 bar kadar sürsün). A inceldikçe B öne çıkar.', check: c => A(c).filK.v > 0.6 },
    { at: '#chA [data-a=fader]', keys: '⇧ A', say: 'A artık ince bir ses. <b>⇧A</b> ile fader\'ını indir.', check: c => A(c).chF.v < 0.1 },
    { at: '#chA [data-a=filter]', keys: '⇧ G + Q', say: '<b>⇧G</b> ile A\'nın filtresini ortala (sonraki şarkı için!) ve <b>Q</b> ile A\'yı durdur.', check: c => Math.abs(A(c).filK.v) < 0.03 && !A(c).playing },
    { at: '.console', keys: 'Y', say: '<b>Y</b> ile B\'yi de durdur.', check: c => !B(c).playing },
  ],
};

const L8: Lesson = {
  id: 'l8', no: 8, title: 'Loop ile uzatma', minutes: 5,
  goal: 'Şarkı bitmek üzereyken loop ile zaman kazan',
  learned: ['R: loop aç/kapat (4 vuruş)', 'T: loop ×2, ⇧T: loop ½', 'LOOP pad modu: 8 hazır uzunluk'],
  setup: async c => { await prep(c, 0); const a = A(c); if (a.grid) a.seek(barTime(a.grid, 92)); a.act('play'); },
  steps: [
    { at: '#deckA .rem', say: 'A\'daki şarkı <b>bitmek üzere</b> (kalan süreye bak) ama sıradaki şarkı hazır değil. Çözüm: <b>loop</b> ile bir parçayı tekrar ettirmek.' },
    { at: '#deckA [data-a=loop]', keys: 'R', say: '<b>R</b> ile 4 vuruşluk loop aç: aynı 4 vuruş tekrar eder, şarkı ilerlemez.', check: c => A(c).loopOn && A(c).loopBeats === 4 },
    { at: '#deckA [data-a=loopDouble]', keys: 'T', say: '<b>T</b> ile loop\'u iki katına çıkar (8 vuruş).', check: c => A(c).loopOn && A(c).loopBeats === 8 },
    { at: '#deckA [data-a=loopHalf]', keys: '⇧ T', say: '<b>⇧T</b> ile iki kez yarıla: 2 vuruş. Kısaldıkça gerilim artar.', check: c => A(c).loopOn && A(c).loopBeats === 2 },
    { at: '#deckA [data-a=loop]', keys: 'R', say: '<b>R</b> ile loop\'tan çık: şarkı kaldığı yerden devam eder.', check: c => !A(c).loopOn },
    { at: '#deckA .pmodes', keys: '5', say: 'Pad\'lerle daha hızlı: <b>5</b> ile pad modunu <b>LOOP</b> yap.', check: c => A(c).padMode === 'loop' },
    { at: '#deckA [data-a=pad4]', keys: '⇧ 1', say: 'Alt sıradaki ilk pad 4 vuruş: <b>⇧1</b> ile aç.', check: c => A(c).loopOn && A(c).loopBeats === 4 && A(c).padMode === 'loop' },
    { at: '#deckA [data-a=loop]', keys: 'R + Q', say: '<b>R</b> ile loop\'u kapat, <b>Q</b> ile durdur.', check: c => !A(c).loopOn && !A(c).playing },
  ],
  teardown: c => { A(c).padMode = 'hot'; },
};

const L9: Lesson = {
  id: 'l9', no: 9, title: 'Hot cue ile drop', minutes: 7,
  goal: 'Gelen şarkıyı doğrudan drop\'undan, tam phrase başında başlat',
  learned: ['Drop = şarkının en dolu bölümü (dalga formunda kalınlaşan yer)', 'JUMP pad modu ile vuruş vuruş ilerlemek', 'Hot cue\'ya phrase başında basınca şarkı oradan başlar (QUANT ritmi korur)'],
  setup: async c => { await prepMix(c, 1, 3, 16, false); },
  steps: [
    { at: '.waves', say: 'B\'deki şarkının <b>drop</b>\'u 33. barda: dalga formunun kalınlaştığı yer. Amaç: A çalarken B\'yi <b>doğrudan drop\'tan</b> başlatmak.' },
    { at: '#deckB .pmodes', keys: '6', say: '<b>6</b> ile B\'nin pad modunu <b>JUMP</b> yap (iki kez: LOOP → JUMP).', check: c => B(c).padMode === 'jump' },
    {
      at: '#deckB [data-a=pad7]', keys: '⇧ 0', say: 'Alt sağdaki pad <b>32 ▶</b>: 32 vuruş (8 bar) ileri. <b>⇧0</b>\'a dört kez bas: B, drop\'un başına gelir.',
      check: c => { const b = B(c); return !!b.grid && Math.abs(b.currentTime() - barTime(b.grid, 32)) < 0.05 && !b.playing; },
      hint: 'Sayaç BAR 1/8 ve PHRASE 5 olmalı. Fazla gittiysen ⇧9 (◀ 32) ile geri.',
    },
    { at: '#deckB .pmodes', keys: '⇧ 6', say: '<b>⇧6</b> ile pad modunu <b>HOT CUE</b>\'ya geri al (iki kez).', check: c => B(c).padMode === 'hot' },
    {
      at: '#deckB [data-a=pad0]', keys: '7', say: '<b>7</b> ile drop\'a hot cue koy.', enter: c => { B(c).hot[0] = null; },
      check: c => { const b = B(c), h = b.hot[0]; return h != null && !!b.grid && Math.abs(h - barTime(b.grid, 32)) < 0.05; },
    },
    {
      at: '#deckB [data-a=pad0]', keys: '7', say: 'A\'nın bir sonraki <b>phrase başında</b> <b>7</b>\'ye bas: B doğrudan drop\'tan başlar!',
      enter: () => { watch = startWatch(); }, check: c => phraseStart(B(c), A(c), watch), hint: phraseHint,
    },
    { at: '#xf', keys: '→', say: 'Drop girdi! Şimdi crossfader\'ı <b>→</b> ile B\'ye götür; A sessizleşir.', check: c => c.mixer.xfVal > 0.9 },
    { at: '.console', keys: 'Q + Y + ↓', say: '<b>Q</b>, <b>Y</b> ile ikisini durdur ve <b>↓</b> ile crossfader\'ı ortala.', check: c => !A(c).playing && !B(c).playing && Math.abs(c.mixer.xfVal) < 0.01 },
  ],
  teardown: c => { B(c).padMode = 'hot'; },
};

const L10: Lesson = {
  id: 'l10', no: 10, title: 'Echo out', minutes: 6,
  goal: 'Giden şarkıyı yankıyla, havada kalarak bitir',
  learned: ['Ritim FX hedefini bir deck\'e vermek (⇧B)', 'ECHO açıkken fader\'ı inince yankı kuyruğu devam eder', 'Yankı sönerken yeni şarkı phrase başında girer'],
  setup: async c => { await prepMix(c, 1, 3, 40, false); ritimFx.setOn(false); ritimFx.setFx('echo'); },
  teardown: () => { ritimFx.setOn(false); ritimFx.setTarget('M'); },
  steps: [
    { at: '.fxbar .fxu', say: '<b>Echo out</b>: giden şarkıya yankı açıp sesini birden kesersin; yankı vuruşa oturarak söner, ardından yeni şarkı girer. Dramatik ve temiz bir geçiş.' },
    { at: '#fxTarget', keys: '⇧ B', say: 'Ritim FX\'in <b>HEDEF</b>\'ini <b>A</b> yap: <b>⇧B</b> (gerekirse birkaç kez).', check: () => ritimFx.target === 'A' },
    { at: '#fxOn', keys: 'B', say: 'Efekt ECHO. <b>B</b> ile aç: A yankılanmaya başlar.', check: () => ritimFx.on && ritimFx.fx === 'echo' && ritimFx.target === 'A' },
    {
      at: '#chA [data-a=fader]', keys: '⇧ A', say: 'Phrase\'in son barında (BAR 8/8) <b>⇧A</b>\'yı basılı tutup A\'nın fader\'ını <b>hızla</b> indir. Yankı havada kalır!',
      check: c => A(c).chF.v < 0.1 && ritimFx.on,
    },
    { at: '#deckB [data-a=play]', keys: 'Y', say: 'Yankı sönerken, A\'nın <b>phrase başında</b> <b>Y</b> ile B\'yi başlat.', enter: () => { watch = startWatch(); }, check: c => phraseStart(B(c), A(c), watch), hint: phraseHint },
    { at: '#fxOn', keys: 'B + Q', say: '<b>B</b> ile echo\'yu kapat ve <b>Q</b> ile A\'yı durdur.', check: c => !ritimFx.on && !A(c).playing },
    { at: '.console', keys: 'Y', say: '<b>Y</b> ile B\'yi de durdur. Artık 4 farklı geçiş biliyorsun: bas değişimi, filtre, hot cue ile drop ve echo out!', check: c => !B(c).playing },
  ],
};

/* ---------------- Geçiş Sınavı ---------------- */

interface ExamStats { start: number | null; clash: number; drift: number; overlap: number; hole: number; over: boolean; t: number; done: number }
let ex: ExamStats = { start: null, clash: 0, drift: 0, overlap: 0, hole: 0, over: false, t: 0, done: 0 };
let overBefore = 0;

function examParts(): { phrase: number; bass: number; beat: number; level: number } {
  const ph = ex.start == null ? 0 : Math.abs(ex.start) <= 0.25 ? 25 : Math.abs(ex.start) <= 1 ? 15 : 0;
  const bass = Math.max(0, 25 - ex.clash / 1000 * 5);
  const beat = ex.overlap > 0 ? 25 * (1 - Math.min(1, ex.drift / ex.overlap)) : 0;
  const level = Math.max(0, 25 - ex.hole / 1000 * 5 - (ex.over ? 10 : 0));
  return { phrase: ph, bass, beat, level };
}

export const EXAM: Lesson = {
  id: 'exam', no: 0, title: 'Geçiş Sınavı', minutes: 4, practice: true,
  goal: 'A\'dan B\'ye tam bir geçiş yap; phrase, bas, vuruş ve ses seviyesinden 100 üzerinden puan al',
  learned: [],
  setup: async c => {
    await prepMix(c, 1, 3, 24);
    ex = { start: null, clash: 0, drift: 0, overlap: 0, hole: 0, over: false, t: performance.now(), done: 0 };
    overBefore = engine.meter.overAt;
    watch = startWatch();
  },
  steps: [
    { say: '<b>Geçiş Sınavı.</b> A çalıyor, B başında hazır (SYNC açık, fader kapalı). Görevin: A\'dan B\'ye <b>tam bir geçiş</b> yap; sonunda sadece B çalsın. İstediğin tekniği kullan. Puanlama: <b>phrase</b> (B\'yi phrase başında başlat), <b>bas</b> (iki bas çakışmasın), <b>vuruş</b> (hizalı kalsın), <b>seviye</b> (ses boşluğu ya da clip olmasın). Hazırsan <b>Devam</b>.' },
    {
      at: '.console', say: 'Geçiş yap! Bittiğinde (A sessiz, B tam seste) sınav kendiliğinden biter.',
      check: c => {
        const a = A(c), b = B(c), now = performance.now(), dt = Math.min(200, now - ex.t);
        ex.t = now;
        const off = watch(b, a);
        if (off != null && ex.start == null) ex.start = off;
        const ga = audible(a, c.mixer.xfVal), gb = audible(b, c.mixer.xfVal);
        if (ga > 0.25 && gb > 0.25) {
          ex.overlap += dt;
          if (bassOn(a) && bassOn(b)) ex.clash += dt;
          const m = phaseMs(c);
          if (m != null && Math.abs(m) > 20) ex.drift += dt;
        }
        if (ex.start != null && ga + gb < 0.45) ex.hole += dt;
        if (engine.meter.overAt > overBefore) ex.over = true;
        // finished: only B is heard, for 2 seconds
        if (ex.start != null && ga < 0.05 && gb > 0.5) ex.done += dt; else ex.done = 0;
        return ex.done > 2000;
      },
    },
  ],
  score: () => { const p = examParts(); return p.phrase + p.bass + p.beat + p.level; },
  feedback: () => {
    const p = examParts(), out: string[] = [];
    const s = (n: number) => Math.round(n);
    out.push(`📐 Phrase: ${s(p.phrase)}/25 — ${ex.start == null ? 'B başlatılmadı' : Math.abs(ex.start) <= 0.25 ? 'B tam phrase başında girdi 👍' : `B phrase başından ${Math.abs(ex.start).toFixed(1)} vuruş ${ex.start < 0 ? 'önce' : 'sonra'} girdi. Sayaçta BAR 8/8 → 1/8 anını bekle.`}`);
    out.push(`🔊 Bas: ${s(p.bass)}/25 — ${ex.clash < 300 ? 'İki bas çakışmadı 👍' : `İki bas ${(ex.clash / 1000).toFixed(1)} sn birlikte çaldı. Gelen şarkıyı LOW kill ile (N) başlat, bası phrase başında değiştir (Z + N).`}`);
    out.push(`🥁 Vuruş: ${s(p.beat)}/25 — ${ex.overlap === 0 ? 'İki şarkı hiç birlikte duyulmadı (fader\'ları birlikte kullan)' : ex.drift < 300 ? 'Vuruşlar hizalı kaldı 👍' : `Vuruşlar ${(ex.drift / 1000).toFixed(1)} sn kaydı. SYNC açık kalsın ya da K / L ile düzelt.`}`);
    out.push(`🎚️ Seviye: ${s(p.level)}/25 — ${ex.hole < 300 && !ex.over ? 'Ses seviyesi dengeli 👍' : [ex.hole >= 300 ? `${(ex.hole / 1000).toFixed(1)} sn ses boşluğu oldu (B\'yi açmadan A\'yı kısma).` : '', ex.over ? 'Ses limiter\'a dayandı (kırmızı LİMİT): fader\'ları ya da TRIM\'i biraz kıs.' : ''].join(' ')}`);
    return out;
  },
};

export const LESSONS2: Lesson[] = [L5, L6, L7, L8, L9, L10];
