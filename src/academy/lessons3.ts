/** Lessons 11–14 (harmonic mixing, set building, restaurant set, aksak rhythms) and the ear-training quiz. */
import type { Ctx, Lesson, Step } from './engine';
import type { Deck } from '../engine/deck';
import { ritimFx } from '../engine/beatfx';
import { engine } from '../engine/context';
import { mixerCfg } from '../engine/mixercfg';
import { compat } from '../analysis/key';
import { AKSAK_DEMO } from '../demo/demos';
import { audible, barTime, bassOn, startWatch } from './mixhelp';
import { prep } from './lessons';
import { phraseHint, phraseStart } from './lessons2';
import { setRules } from './rules';

const A = (c: Ctx) => c.decks[0], B = (c: Ctx) => c.decks[1];
const keysFit = (c: Ctx) => { const a = A(c).playingKey(), b = B(c).playingKey(); return !!a && !!b && compat(a, b) === 2; };
let watch = startWatch();

/** Set a deck's key shift with the normal actions (so the pitch shifter follows). */
function setShift(d: Deck, semis: number): void {
  d.act('keyReset');
  for (let i = 0; i < Math.abs(semis); i++) d.act(semis > 0 ? 'keyUp' : 'keyDown');
}

const L11: Lesson = {
  id: 'l11', no: 11, title: 'Harmonik miks', minutes: 6,
  goal: 'Tonu uyumlu şarkıları birleştir; uyumsuzsa TON ile düzelt',
  learned: ['Her şarkının bir tonu var; uyumsuz tonlar birlikte "ekşi" duyulur', 'Ton Çarkı: aynı numara ya da ±1 komşu (aynı harf) = uyumlu', 'TON ♯/♭ ile tonu kaydırıp uyumlu hale getirmek', 'Kütüphanede ✓ Uyumlu ile sıradaki şarkıyı seçmek'],
  setup: async c => { await prep(c, 0, 1); B(c).act('sync'); },
  steps: [
    { at: '#deckA .key', say: 'Bu yazı şarkının <b>tonu</b> ve <b>Ton Çarkı</b> numarası: A\'da <b>Am · 1m</b>. Ton Çarkı\'nda <b>aynı numara</b> ya da <b>bir komşu</b> (aynı harfle: 1m → 2m, 12m) birlikte güzel duyulur.' },
    { at: '.console', keys: 'Q + Y + ↓', say: '<b>Q</b> ve <b>Y</b> ile iki şarkıyı da çal (temposu eşit). Crossfader ortada olsun (<b>↓</b>). Dinle: melodiler birbirine "ekşi" geliyor mu?', check: c => A(c).playing && B(c).playing && Math.abs(c.mixer.xfVal) < 0.05 },
    { at: '#deckB .key', say: 'B\'nin tonu <b>Cm · 10m</b>: 1m ile 10m çarkta uzak, ikisinin yazısı da <b>kırmızı</b> = çatışıyor. Kulağın da bunu söylüyor olmalı.' },
    {
      at: '#deckB .kshift', keys: '⇧ Ü (×3)', say: 'Düzeltelim: B\'nin tonunu <b>⇧Ü</b> ile <b>3 yarım ses düşür</b> (Cm → Am). Yazılar <b>yeşile</b> dönecek.',
      check: c => keysFit(c), hint: '⇧Ü üç kez: TON kutusu −3 göstermeli. Ya da ♭ butonuna üç kez tıkla.',
      show: c => [{ at: '#deckB [data-a=keyDown]', say: '♭\'ya üç kez basıyorum', run: () => setShift(B(c), -3), wait: 1500 }, { say: 'Geri alıyorum, şimdi sen yap', run: () => setShift(B(c), 0), wait: 300 }],
    },
    { at: '.console', say: 'Dinle: artık melodiler kardeş gibi. Harmonik miks, geçişlerin "profesyonel" duyulmasının sırrıdır. <b>Devam</b>.' },
    { at: '#deckB .ksv', say: 'B\'nin <b>TON kutusuna tıkla</b>: kaydırma sıfırlanır (orijinal ton).', check: c => B(c).keyShift === 0 },
    { at: '#libFits', say: 'Kütüphanede <b>✓ Uyumlu</b> butonu, <b>çalan şarkıyla</b> ton ve tempo olarak uyumlu şarkıları gösterir. Bas.', check: () => !!document.querySelector('#libFits.on') },
    { at: '#libT th[data-k=key]', say: 'Bir de <b>Ton</b> başlığına tıkla: şarkılar çarktaki sırayla dizilir; komşular yan yana gelir.', check: () => !!document.querySelector('#libT th[data-k=key].on') },
    { at: '.console', keys: 'Q + Y', say: '<b>Q</b> ve <b>Y</b> ile ikisini durdur. (✓ Uyumlu\'yu kapatmak istersen tekrar tıkla.)', check: c => !A(c).playing && !B(c).playing },
  ],
};

const has = (d: Deck, s: string) => d.has && d.title.includes(s);

const L12: Lesson = {
  id: 'l12', no: 12, title: 'Set kurgusu ve enerji eğrisi', minutes: 5,
  goal: 'Şarkıları sakinden hareketliye, sonra tekrar sakine dizmek',
  learned: ['Set bir hikâyedir: ısınma → yükselme → zirve → iniş', 'Sıradaki şarkı: biraz daha hızlı/enerjik ve tonu uyumlu', 'Kütüphanede BPM / Enerji / Ton sıralaması ve ✓ Uyumlu ile seçmek'],
  setup: c => prep(c),
  steps: [
    { say: 'İyi bir set <b>enerji eğrisi</b> çizer: <b>ısınma</b> (sakin) → <b>yükselme</b> → <b>zirve</b> → <b>iniş</b>. Ani düşüşler ve sıçramalar dinleyiciyi koparır. Bu derste 4 demo parçayla bir eğri kuracağız.' },
    { at: '#libT th[data-k=bpm]', say: 'Kütüphanede <b>BPM</b> başlığına tıkla: şarkılar yavaştan hızlıya dizilir. (Kendi şarkılarında <b>Enerji</b> sütunu da var.)', check: () => !!document.querySelector('#libT th[data-k=bpm].on') },
    { at: '.lib', say: '<b>Isınma</b>: en sakin parçayı (<b>112 BPM, Sakin Öğle</b>) satırındaki <b>A</b> butonuyla A\'ya yükle.', check: c => has(A(c), 'Sakin') },
    { at: '.lib', say: '<b>Yükselme</b>: bir sonraki (<b>122, Gün Batımı</b>) B\'ye yüklensin: satırdaki <b>B</b>.', check: c => has(B(c), 'Gün Batımı') },
    { say: '112 → 122: tempo kademeli arttı. Setin ortasında 122 → 126 → 128 gibi küçük adımlarla <b>zirveye</b> çıkılır; zirvede en dolu parçalar çalınır. Sonra ters sırayla <b>iniş</b>.' },
    { at: '.lib', say: '<b>Zirve</b>: en hızlı parçayı (<b>128, Hızlı Çıkış</b>) A\'ya yükle.', check: c => has(A(c), 'Hızlı') },
    { say: 'Restoranda bu eğri farklıdır: akşam yemeğinde uzun ve düz bir "sakin" bölge, gece ilerledikçe hafif bir yükseliş. Bir sonraki derste bunu deneyeceğiz.' },
  ],
};

const L13: Lesson = {
  id: 'l13', no: 13, title: 'Restoran seti pratiği', minutes: 8,
  goal: 'Sakin, alçak sesli ve fark edilmeyen uzun geçişlerle restoran seti',
  learned: ['Restoranda müzik arka plandır: ses kısık, efekt yok, drop yok', 'Uzun geçiş: crossfader\'ı 30 saniye ve üzerinde yavaşça kaydırmak', 'YUMUŞAK crossfader eğrisi ve bas çakışmasından kaçınmak', 'Anons için mikrofon + DUCK'],
  setup: async c => { await prep(c, 2, 0); B(c).act('sync'); c.xf.set(-1); },
  steps: [
    { say: '<b>Restoran seti</b> kulüp setinden farklıdır: müzik sohbetin <b>arkasında</b> durur. Ses kısık, efekt yok, ani değişim yok; geçişler o kadar yumuşak ki kimse fark etmez.' },
    { at: '#xfCurve', say: 'MİKSER kutusunda crossfader eğrisi <b>YUMUŞAK</b> olsun (gerekirse butona tıklayıp YUMUŞAK\'a getir).', check: () => mixerCfg.xf === 'smooth' },
    { at: '#masterK', keys: 'PgDn', say: '<b>Master</b>\'ı biraz kıs: <b>PgDn</b> ile %70\'in altına indir.', check: () => (engine.master?.gain.value ?? 1) < 0.72, hint: 'PgDn\'ye 6-7 kez bas ya da MASTER düğmesini fareyle aşağı çevir.' },
    { at: '#deckA [data-a=play]', keys: 'Q', say: 'Crossfader A\'da. <b>Q</b> ile A\'yı (sakin parça) çal.', check: c => A(c).playing },
    { at: '#chB [data-a=killLow]', keys: 'N', say: 'Uzun geçişte iki bas uzun süre üst üste biner: B\'nin basını baştan kes (<b>N</b>).', check: c => B(c).kills.lo },
    { at: '#deckB [data-a=play]', keys: 'Y', say: 'A\'nın <b>phrase başında</b> <b>Y</b> ile B\'yi başlat (crossfader A\'da olduğu için henüz duyulmuyor).', enter: () => { watch = startWatch(); }, check: c => phraseStart(B(c), A(c), watch), hint: phraseHint },
    {
      at: '#xf', keys: '→ (yavaşça)', say: 'Şimdi crossfader\'ı <b>→</b> ile <b>adım adım, en az 30 saniyede</b> B\'ye götür. Ortaya gelince bası değiştir (<b>Z</b> + <b>N</b>).',
      enter: (_c, s) => { s.d.sweep = 0; s.d.t = performance.now(); s.d.clash = 0; },
      check: (c, s) => {
        const now = performance.now(), dt = Math.min(200, now - (s.d.t as number));
        s.d.t = now;
        const x = c.mixer.xfVal;
        // the sweep time = time the crossfader spends between its two ends
        if (x > -0.95 && x < 0.95) s.d.sweep = (s.d.sweep as number) + dt;
        const ga = audible(A(c), x), gb = audible(B(c), x);
        if (ga > 0.2 && gb > 0.2 && bassOn(A(c)) && bassOn(B(c))) s.d.clash = (s.d.clash as number) + dt;
        const secs = (s.d.sweep as number) / 1000;
        if (x < 0.95) {
          const warn = (s.d.clash as number) > 2000 ? ' · iki bas birlikte çalıyor (Z + N)' : '';
          return secs > 1 ? `Geçiş sürüyor: ${secs.toFixed(0)} / 30 sn${warn}` : false;
        }
        if (secs >= 30) return true;
        c.xf.set(-1);
        s.d.sweep = 0;
        return `Çok hızlı oldu (${secs.toFixed(0)} sn). Crossfader'ı başa aldım; bu kez 30 saniyeyi geçecek kadar yavaş git.`;
      },
      hint: 'Sağ oka her 2 saniyede bir bas: 20 bas, yaklaşık 40 saniye.',
    },
    { at: '#micOn', say: 'Anons zamanı gelince: <b>🎤 ON</b> ile mikrofonu aç, konuş ("Afiyet olsun!"), müzik kendiliğinden kısılır (DUCK). Bitince kapat. (Mikrofonun yoksa bu adımı geç: <b>Devam</b>.)' },
    { at: '.console', keys: 'Q + Y + PgUp', say: 'Tebrikler, ilk restoran geçişini yaptın! <b>Q</b> ve <b>Y</b> ile durdur.', check: c => !A(c).playing && !B(c).playing },
  ],
};

const L14: Lesson = {
  id: 'l14', no: 14, title: 'Türk müziği ile miks (aksak ritimler)', minutes: 7,
  goal: '9/8 aksak ritmi saymak ve aksak bir parçadan 4/4\'e geçmek',
  learned: ['Aksak ritim: vuruşlar eşit değil. 9/8 karşılama = 2+2+2+3', 'Grid\'de ölçüyü seçmek (GRID satırındaki ölçü butonu)', '9/8 ile 4/4 üst üste oturmaz: geçiş echo out ya da sessiz bir arayla yapılır'],
  setup: async c => { await prep(c, AKSAK_DEMO, 2); ritimFx.setOn(false); ritimFx.setFx('echo'); },
  teardown: () => { ritimFx.setOn(false); ritimFx.setTarget('M'); },
  steps: [
    { at: '#deckA .dtitle', say: 'A\'da kodla üretilmiş bir <b>9/8 karşılama</b> var: darbuka ve hicaz bir ezgi. Türk müziğinin <b>aksak</b> ritimlerinde vuruşlar eşit değildir: 9/8 = <b>2+2+2+3</b> ("bir-iki, bir-iki, bir-iki, bir-iki-üç").' },
    { at: '#deckA .dinfo', keys: 'Q', say: '<b>Q</b> ile çal ve sayaçtaki <b>4 ışığı</b> izle: son ışık daha <b>uzun</b> yanar (3 sekizlik). Ayağınla say: düm-tek-düm-tek-<b>tek</b>.', check: c => A(c).playing },
    { at: '#deckA .mtr', say: 'GRID satırındaki ölçü butonu <b>9/8</b> gösteriyor. Kendi aksak şarkılarında bu butona tıklayıp 9/8, 7/8, 10/8 seçersin; dalga formu çizgileri ve sayaç ona göre değişir. BPM burada <b>sekizlik</b> sayısıdır (270).' },
    { at: '.waves', say: 'Bu şarkıyı 4/4\'lük bir şarkıyla <b>beatmatch edemezsin</b>: 9 sekizlik bar ile 4 vuruşluk bar üst üste oturmaz. Çözüm: aksak şarkıyı <b>echo out</b> ile bitirip 4/4\'ü temiz başlatmak.' },
    { at: '#fxTarget', keys: '⇧ B + B', say: 'Ritim FX hedefini <b>A</b> yap (<b>⇧B</b>) ve <b>B</b> ile ECHO\'yu aç. Yankı aksak sekizliklere oturur.', check: () => ritimFx.on && ritimFx.fx === 'echo' && ritimFx.target === 'A' },
    { at: '#chA [data-a=fader]', keys: '⇧ A', say: 'Bir bar sonunda (son, uzun ışıkta) <b>⇧A</b> ile A\'nın fader\'ını kes; yankı havada kalsın.', check: c => A(c).chF.v < 0.1 },
    { at: '#deckB [data-a=play]', keys: 'Y', say: 'Yankı sönmeye başlarken <b>Y</b> ile B\'yi (4/4, 112 BPM) başlat. Burada phrase aranmaz; sessizliğe yeni bir başlangıç yapıyorsun.', check: c => B(c).playing },
    { at: '#fxOn', keys: 'B + Q', say: '<b>B</b> ile echo\'yu kapat, <b>Q</b> ile A\'yı durdur.', check: c => !ritimFx.on && !A(c).playing },
    { at: '.console', keys: 'Y', say: '<b>Y</b> ile B\'yi de durdur. Tebrikler, Akademi\'nin bütün derslerini bitirdin! 🎉', check: c => !B(c).playing },
  ],
};

/* ---------------- Kulak Egzersizi ---------------- */

type Q = 'tempo' | 'phase' | 'aligned' | 'key';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);

/** Both decks from bar 32 (drop), B matched to A in tempo and key, then the question's change applied. */
function arrange(c: Ctx, o: { tempo?: number; ms?: number; semis?: number }): void {
  const a = A(c), b = B(c);
  a.stop(); b.stop();
  a.tempoF.set(0);
  b.tempoF.set((a.bpm ?? 122) / (b.bpm ?? 126) - 1 + (o.tempo ?? 0));
  setShift(b, o.semis ?? -3);
  if (a.grid && b.grid) {
    a.seek(barTime(a.grid, 32));
    b.seek(barTime(b.grid, 32) + (o.ms ?? 0) / 1000 * b.speed());
  }
  a.act('play'); b.act('play');
}

function question(kind: Q): Step {
  switch (kind) {
    case 'tempo': {
      const d = sign() * rnd(0.02, 0.035);
      return { say: '🎧 Dinle: <b>B</b>, A\'dan <b>hızlı mı yavaş mı</b>? (Vuruşlar birbirinden kaçıyor; hangisi öne geçiyor?)', choices: ['B daha hızlı', 'B daha yavaş'], answer: () => (d > 0 ? 0 : 1), enter: c => arrange(c, { tempo: d }), explain: 'Hızlı olan şarkının vuruşları her seferinde biraz daha öne kaçar.' };
    }
    case 'phase': {
      const ms = sign() * rnd(35, 60);
      return { say: '🎧 Tempolar aynı ama vuruşlar üst üste değil. <b>B\'nin</b> kick\'i A\'dan <b>önce</b> mi geliyor, <b>sonra</b> mı?', choices: ['B önde (önce)', 'B geride (sonra)'], answer: () => (ms > 0 ? 0 : 1), enter: c => arrange(c, { ms }), explain: 'Önde olanın "güm"ü ilk duyulur: "gü-güm" diye çift vurur.' };
    }
    case 'aligned': {
      const off = Math.random() < 0.5 ? 0 : sign() * rnd(30, 45);
      return { say: '🎧 Vuruşlar <b>hizalı</b> mı, yoksa hafif <b>kayık</b> mı (çift "güm")?', choices: ['Hizalı', 'Kayık'], answer: () => (off === 0 ? 0 : 1), enter: c => arrange(c, { ms: off }), explain: 'Hizalıyken iki kick tek, dolgun bir kick gibi duyulur.' };
    }
    case 'key': {
      const fit = Math.random() < 0.5;
      return { say: '🎧 İki şarkının <b>tonu uyumlu</b> mu, yoksa <b>çatışıyor</b> mu? Melodilere kulak ver.', choices: ['Uyumlu', 'Çatışıyor'], answer: () => (fit ? 0 : 1), enter: c => arrange(c, { semis: fit ? -3 : 0 }), explain: 'Çatışan tonlarda melodiler "ekşi", akortsuz gibi gelir.' };
    }
  }
}

export const EAR: Lesson = {
  id: 'ear', no: 0, title: 'Kulak Egzersizi', minutes: 4, practice: true,
  goal: 'Hangisi hızlı? Hangisi önde? Ton uyumlu mu? 8 kısa kulak sorusu (ekran gizli)',
  learned: [],
  setup: async c => {
    await prep(c, 0, 1);
    setRules({ hideBpm: true, noSync: true, hideWaves: true });
    const kinds: Q[] = ['tempo', 'tempo', 'phase', 'phase', 'aligned', 'aligned', 'key', 'key'].sort(() => Math.random() - 0.5) as Q[];
    EAR.steps = [
      { say: 'Ekrandaki ipuçları (BPM, dalga formu, faz) gizli: sadece <b>kulağınla</b> cevap ver. Varsa kulaklık tak. Her soruda iki şarkı birlikte çalar. Hazırsan <b>Devam</b>.' },
      ...kinds.map(question),
    ];
  },
  teardown: c => { c.decks.forEach(d => { d.stop(); d.act('keyReset'); }); },
  steps: [],
};

export const LESSONS3: Lesson[] = [L11, L12, L13, L14];
