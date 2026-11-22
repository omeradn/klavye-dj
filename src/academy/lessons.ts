/** DJ Akademi lessons (Turkish, friendly, short). Lessons 1–4 work with the built-in demo tracks only. */
import type { Ctx, Lesson } from './engine';
import { setRules } from './rules';

/** All 14 lessons of the curriculum; the ones without content yet are shown as "yakında". */
export const CURRICULUM: { no: number; title: string }[] = [
  { no: 1, title: 'Arayüz turu' }, { no: 2, title: 'Play, Cue ve hot cue' }, { no: 3, title: 'BPM ve tempo' },
  { no: 4, title: 'Kulakla beatmatching' }, { no: 5, title: 'Beat, bar, phrase' }, { no: 6, title: 'EQ ile geçiş (bas değişimi)' },
  { no: 7, title: 'Filtre ile geçiş' }, { no: 8, title: 'Loop ile uzatma' }, { no: 9, title: 'Hot cue ile drop' },
  { no: 10, title: 'Echo out' }, { no: 11, title: 'Harmonik miks' }, { no: 12, title: 'Set kurgusu ve enerji eğrisi' },
  { no: 13, title: 'Restoran seti pratiği' }, { no: 14, title: 'Türk müziği ile miks (aksak ritimler)' },
];

const A = (c: Ctx) => c.decks[0], B = (c: Ctx) => c.decks[1];

/** Fresh decks with the given demo tracks (index into DEMOS), stopped at the start, controls centred. */
export async function prep(c: Ctx, a?: number, b?: number): Promise<void> {
  for (const d of c.decks) d.resetForLesson();
  c.xf.set(0);
  if (a != null) await A(c).loadDemo(a);
  if (b != null) await B(c).loadDemo(b);
  for (const d of c.decks) { d.resetForLesson(); if (d.has) d.seek(0); }
}

/** Beat distance of deck B from deck A in ms (real time), or null when not both playing with a grid. */
export function phaseMs(c: Ctx): number | null {
  const a = A(c), b = B(c), e = b.phaseDiff();
  if (e == null || !b.grid || !a.playing || !b.playing) return null;
  return e * 60 / (b.grid.bpm * b.speed()) * 1000;
}
const tempoGap = (c: Ctx) => Math.abs((A(c).bpmNow() ?? 0) - (B(c).bpmNow() ?? 0));

const L1: Lesson = {
  id: 'l1', no: 1, title: 'Arayüz turu', minutes: 3,
  goal: 'Ekranda neyin nerede olduğunu öğren',
  learned: ['Deck A, Deck B ve mikserin yeri', 'Crossfader ile iki şarkı arasında geçiş', 'Kısayol listesini açmak (Esc)'],
  setup: c => prep(c, 0, 1),
  steps: [
    { say: '<b>Hoş geldin!</b> Bu ilk derste ekranı tanıyacağız. Her adımda parlayan yere bak; ne yapman gerektiğini burada yazacağım.' },
    { at: '#deckA', say: 'Bu <b>Deck A</b>. Gerçek bir DJ setindeki sol "pikap" gibi: şarkıyı burada çalar, durdurur, hızını ayarlarsın.' },
    { at: '#deckB', say: 'Bu da <b>Deck B</b>, sağdaki pikap. DJ\'lik iki şarkıyı birbirine bağlama sanatı: biri çalarken öbürünü hazırlarsın.' },
    { at: '.waves', say: 'Bunlar şarkıların <b>dalga formu</b>: şarkının resmi. Beyaz çizgi şu an çalan yer. Mor kısımlar bas, beyaz kısımlar tiz sesler.' },
    { at: '.mixer', say: 'Ortadaki <b>mikser</b>: her şarkının ses seviyesi (kanal fader\'ı), bas/orta/tiz düğmeleri (EQ) ve filtre burada.' },
    {
      at: '#xf', keys: '→', say: '<b>Crossfader</b>: hangi şarkının duyulacağını seçer. Sağ ok tuşuyla crossfader\'ı <b>sağa (B\'ye)</b> götür.',
      check: c => c.mixer.xfVal > 0.5, hint: 'Klavyede sağ ok tuşunu birkaç kez bas ya da fareyle sağa sürükle.',
      show: c => [{ at: '#xf', say: 'Sağ oka basıyorum, crossfader B\'ye kayıyor', run: () => c.xf.set(0.8), wait: 900 }, { run: () => c.xf.set(0), wait: 300 }],
    },
    { at: '#xf', keys: '←', say: 'Şimdi sol ok tuşuyla <b>sola (A\'ya)</b> götür.', check: c => c.mixer.xfVal < -0.5, hint: 'Sol ok tuşu.' },
    { at: '#xf', keys: '↓', say: 'Aşağı ok tuşu crossfader\'ı <b>ortalar</b>: iki şarkı da duyulur.', check: c => Math.abs(c.mixer.xfVal) < 0.01, hint: 'Aşağı ok tuşu.' },
    { at: '.fxbar', say: 'Burası <b>efektler</b> (Ritim FX, Kanal FX), mikser ayarları ve mikrofon. İleriki derslerde kullanacağız.' },
    { at: '.lib', say: 'Burası <b>kütüphane</b>: kendi şarkılarını klasör olarak ekler, buradan deck\'lere yüklersin. Derslerde demo parçaları kullanacağız.' },
    {
      at: '#helpBtn', keys: 'Esc', say: 'Bütün klavye kısayolları tek listede. <b>Esc</b> ile kısayol listesini aç.',
      check: () => document.querySelector('#help')!.classList.contains('show'),
    },
    {
      at: '#help .box', keys: 'Esc', say: 'İşte bütün tuşlar. Unutursan buraya bakarsın. Şimdi tekrar <b>Esc</b> ile kapat.',
      check: () => !document.querySelector('#help')!.classList.contains('show'),
    },
    { say: 'Tur bitti! Bir sonraki derste ilk şarkını çalacak ve <b>hot cue</b> koyacaksın.' },
  ],
};

const L2: Lesson = {
  id: 'l2', no: 2, title: 'Play, Cue ve hot cue', minutes: 5,
  goal: 'Şarkıyı çal/durdur, cue noktası koy, hot cue ile istediğin yere atla',
  learned: ['Q ile çal / durdur', 'W (CUE): dururken bastığın yer başlangıç noktası olur, çalarken basınca oraya döner', 'Hot cue: 1–4 tuşlarıyla anı kaydet, tekrar basınca oraya atla', 'Backspace + pad ile hot cue silmek'],
  setup: c => prep(c, 2),
  steps: [
    {
      at: '#deckA [data-a=play]', keys: 'Q', say: 'Deck A\'ya sakin bir demo yükledim. <b>Q</b> ile çal.',
      check: c => A(c).playing,
      show: c => [{ at: '#deckA [data-a=play]', say: 'Q\'ya basıyorum: şarkı başladı', run: () => A(c).act('play'), wait: 1500 }, { at: '#deckA [data-a=play]', say: 'Tekrar Q: durdu', run: () => A(c).act('play') }],
    },
    { at: '#deckA [data-a=play]', keys: 'Q', say: 'Güzel! Şimdi tekrar <b>Q</b> ile durdur.', check: c => !A(c).playing },
    {
      at: '.waves', keys: 'W', say: '<b>CUE noktası</b> = şarkıyı başlatacağın yer. Üstteki dalga formunda (alt ince şerit) <b>ortalara bir yere tıkla</b>, sonra <b>W</b>\'ye bas.',
      enter: (c, s) => { s.d.cue = A(c).cuePt; },
      check: (c, s) => !A(c).playing && A(c).cuePt > 1 && A(c).cuePt !== s.d.cue,
      hint: 'Önce A\'nın dalga formunun alttaki ince şeridine tıkla (şarkı oraya gider), sonra W.',
    },
    {
      at: '#deckA [data-a=cue]', keys: 'Q ... W', say: 'Şimdi <b>Q</b> ile çal, birkaç saniye dinle, sonra <b>W</b>\'ye bas: şarkı cue noktasına <b>geri döner ve durur</b>.',
      enter: (_c, s) => { s.d.played = false; },
      check: (c, s) => { if (A(c).playing) s.d.played = true; return !!s.d.played && !A(c).playing && Math.abs(A(c).currentTime() - A(c).cuePt) < 0.15; },
      hint: 'Önce Q (çalar), sonra W (döner ve durur).',
    },
    {
      at: '#deckA [data-a=cue]', keys: 'W (basılı tut)', say: 'CUE\'nun gizli özelliği: dururken <b>W\'yi basılı tut</b> → cue noktasından çalar; <b>bırakınca</b> geri döner. Şarkının girişini önceden dinlemek için.',
      enter: (_c, s) => { s.d.seen = false; },
      check: (c, s) => { if (A(c).cuePreview) s.d.seen = true; return !!s.d.seen && !A(c).cuePreview && !A(c).playing; },
      hint: 'W tuşunu 1-2 saniye basılı tut, sonra bırak.',
    },
    {
      at: '#deckA [data-a=pad0]', keys: 'Q ... 1', say: '<b>Hot cue</b> = şarkıya koyduğun yer imi. <b>Q</b> ile çal, beğendiğin bir anda <b>1</b>\'e bas: o an pad\'e kaydedilir (mor yanar).',
      enter: c => { A(c).hot[0] = null; },
      check: c => A(c).hot[0] != null,
    },
    {
      at: '#deckA [data-a=pad0]', keys: '1', say: 'Şarkı çalmaya devam etsin. Birkaç saniye bekle, sonra <b>1</b>\'e tekrar bas: kaydettiğin yere <b>atlar</b>.',
      enter: (_c, s) => { s.d.away = false; },
      check: (c, s) => {
        const a = A(c), h = a.hot[0];
        if (h == null || !a.playing) return false;
        if (a.currentTime() - h > 1.2) s.d.away = true;
        return !!s.d.away && Math.abs(a.currentTime() - h) < 0.4;
      },
      hint: 'Şarkı çalıyor olmalı (Q). Hot cue\'dan en az 1-2 saniye ilerledikten sonra 1\'e bas.',
    },
    {
      at: '#deckA [data-a=pad0]', keys: 'Backspace + 1', say: 'Hot cue\'yu silmek için <b>Backspace</b>\'i basılı tutup <b>1</b>\'e bas (ya da pad\'e sağ tıkla).',
      check: c => A(c).hot[0] == null,
    },
    { at: '#deckA [data-a=play]', keys: 'Q', say: 'Son olarak <b>Q</b> ile durdur. Tebrikler, artık bir şarkıyı istediğin yerden başlatabilirsin!', check: c => !A(c).playing },
  ],
};

const L3: Lesson = {
  id: 'l3', no: 3, title: 'BPM ve tempo', minutes: 5,
  goal: 'BPM\'i oku, tempoyu ayarla, iki şarkının hızını eşitle',
  learned: ['BPM = dakikadaki vuruş sayısı', 'A / S ile tempo (B deck: H / J), G ile sıfırla', 'SYNC (E) tempoyu ve vuruşları otomatik eşitler', 'Key lock açıkken tempo değişse de ton aynı kalır'],
  setup: c => prep(c, 0, 1),
  steps: [
    { at: '#deckA .dbpm', say: 'Sağ üstteki sayı <b>BPM</b>: dakikadaki vuruş sayısı. A\'daki şarkı <b>122</b>, B\'deki <b>126</b> BPM. İki şarkıyı birleştirmek için hızlarının aynı olması gerekir.' },
    { at: '#deckA [data-a=play]', keys: 'Q', say: '<b>Q</b> ile A\'yı çal ve ritme kulak ver: her "güm" bir vuruş.', check: c => A(c).playing },
    {
      at: '#deckA [data-a=tempo]', keys: 'S (basılı tut)', say: 'A\'nın temposunu B\'ye eşitle: <b>S</b>\'yi basılı tutarak BPM yazısını <b>126</b>\'ya getir (A = yavaşlat).',
      check: c => Math.abs((A(c).bpmNow() ?? 0) - 126) < 0.3,
      hint: 'S tempoyu artırır, A azaltır. BPM yazısı 125.7 – 126.3 arasında olmalı.',
      show: c => [{ at: '#deckA [data-a=tempo]', say: 'S\'ye basılı tutuyorum: BPM yükseliyor', run: () => A(c).tempoF.set(126 / 122 - 1), wait: 1200 }, { say: 'Geri alıyorum, şimdi sen yap', run: () => A(c).tempoF.set(0), wait: 300 }],
    },
    { at: '#deckA [data-a=tempoReset]', keys: 'G', say: 'Oldu! Şimdi <b>G</b> ile tempoyu sıfırla (orijinal hız).', check: c => Math.abs(A(c).tempo) < 0.0005 },
    {
      at: '#deckA [data-a=sync]', keys: 'Y ... E', say: 'Bunun otomatik yolu: <b>SYNC</b>. Önce <b>Y</b> ile B\'yi de çal, sonra <b>E</b>\'ye bas: A, B\'nin hızına eşitlenir ve vuruşlar üst üste gelir.',
      check: c => A(c).syncOn && B(c).playing,
      hint: 'Y = B\'yi çal. E = A\'nın SYNC\'i (turuncu yanar).',
    },
    {
      at: '#deckA [data-a=keylock]', keys: '⇧ E', say: '<b>Key lock</b>: tempo değişse de şarkının tonu aynı kalır (yeşil KEY). <b>⇧E</b> ile key lock\'u <b>kapat</b> ve farkı duy: ton biraz değişir.',
      check: c => !A(c).keyLock,
    },
    { at: '#deckA [data-a=keylock]', keys: '⇧ E', say: 'Duydun mu? Şimdi <b>⇧E</b> ile tekrar <b>aç</b>. DJ\'lerin çoğu key lock\'u hep açık tutar.', check: c => A(c).keyLock },
    { at: '.console', keys: 'Q + Y', say: 'Son adım: <b>Q</b> ve <b>Y</b> ile iki deck\'i de durdur.', check: c => !A(c).playing && !B(c).playing },
  ],
};

const L4: Lesson = {
  id: 'l4', no: 4, title: 'Kulakla beatmatching', minutes: 8,
  goal: 'BPM sayısına bakmadan, sadece kulağınla iki şarkıyı eşitle',
  learned: ['Tempo farkı "dörtnala at" gibi duyulur: vuruşlar birbirinden kaçar', 'Önce tempoyu (H / J), sonra vuruşları (K / L bend) eşitlemek', 'Faz göstergesi: yeşil ve ortada = hizalı'],
  setup: async c => { await prep(c, 0, 1); setRules({ hideBpm: true, noSync: true }); },
  teardown: () => setRules({ hideBpm: false, noSync: false }),
  steps: [
    { say: 'Bu derste <b>BPM sayıları gizli</b> ve <b>SYNC kapalı</b>. Gerçek DJ\'ler gibi kulakla eşitleyeceksin. Varsa kulaklık tak; yoksa hoparlör de olur.' },
    { at: '#deckA [data-a=play]', keys: 'Q', say: '<b>Q</b> ile A\'yı çal. Bu "ana" şarkı; ona dokunmayacağız.', check: c => A(c).playing },
    { at: '#deckB [data-a=play]', keys: 'Y', say: '<b>Y</b> ile B\'yi de çal. Dinle: iki davul birbirinden kaçıyor, "dörtnala at" gibi takır tukur… Tempolar farklı.', check: c => B(c).playing },
    {
      at: '#deckB [data-a=tempo]', keys: 'H / J', say: 'B\'nin temposunu <b>H</b> (yavaşlat) ve <b>J</b> (hızlandır) ile ayarla. Davullar birbirinden <b>uzaklaşmayı bırakınca</b> tempo tamam.',
      check: c => A(c).playing && B(c).playing && tempoGap(c) < 0.3, hold: 2000,
      hint: 'B daha hızlı başlıyor: H\'yi basılı tut, takırtının yavaşladığını duy. Fark çok azalınca tek tek bas.',
    },
    {
      at: '#deckB [data-a=bendUp]', keys: 'K / L (basılı tut)', say: 'Tempolar aynı ama vuruşlar üst üste değil. <b>K</b> (geri it) ya da <b>L</b> (ileri it) tuşunu kısa kısa basılı tutarak B\'yi kaydır. İki "güm" <b>tek güm</b> gibi duyulmalı.',
      check: c => { const m = phaseMs(c); return m != null && Math.abs(m) < 15 && tempoGap(c) < 0.3; }, hold: 3000,
      hint: 'Önce hangi kick önde, dinle. B öndeyse K, gerideyse L. Göstergeye bakmak istersen: dalga formlarının arasındaki FAZ çubuğu yeşil olmalı.',
    },
    {
      at: '.phase', say: 'Süper! Şimdi <b>8 saniye</b> böyle tut. Kayarsa K / L ile düzelt.',
      check: c => { const m = phaseMs(c); return m != null && Math.abs(m) < 25 && tempoGap(c) < 0.4; }, hold: 8000,
    },
    { say: '<b>Tebrikler!</b> Kulakla beatmatch DJ\'liğin temelidir. Biraz pratikle saniyeler içinde yapacaksın: Akademi\'deki <b>Beatmatch Antrenörü</b> ile çalış. Şimdi BPM\'ler tekrar görünüyor.' },
  ],
};

/** Beatmatch trainer: random tempo, hidden numbers, match by ear against the clock. */
export const TRAINER: Lesson = {
  id: 'trainer', no: 0, title: 'Beatmatch Antrenörü', minutes: 2, practice: true,
  goal: 'Rastgele tempoda çalan A\'ya, B\'yi kulağınla en hızlı şekilde eşitle',
  learned: [],
  setup: async c => {
    await prep(c, 0, 1);
    setRules({ hideBpm: true, noSync: true });
    const a = A(c); a.tempoF.set(Math.round((Math.random() * 0.08 - 0.04) * 1000) / 1000);
  },
  teardown: () => setRules({ hideBpm: false, noSync: false }),
  steps: [
    { say: 'A rastgele bir tempoda çalacak; BPM\'ler gizli. <b>B</b>\'yi H / J (tempo) ve K / L (bend) ile eşitle. Ne kadar hızlı, o kadar çok puan. Hazırsan <b>Devam</b>.' },
    { keys: 'Q + Y', say: '<b>Q</b> ve <b>Y</b> ile iki deck\'i de çal. Süre başladı!', check: c => A(c).playing && B(c).playing },
    {
      at: '.console', keys: 'H J K L', say: 'Eşitle! Tempo ve vuruşlar 3 saniye hizalı kalınca biter.',
      check: c => { const m = phaseMs(c); return m != null && Math.abs(m) < 12 && tempoGap(c) < 0.15; }, hold: 3000,
    },
  ],
  score: (_c, secs) => Math.max(30, Math.min(100, 115 - secs)),
};

export const LESSONS: Lesson[] = [L1, L2, L3, L4];
