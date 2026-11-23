/** Academy progress: finished lessons, stars, XP, daily streak, practice time, badges (kept in the browser). */

export interface LessonResult { score: number; stars: number; at: number; secs: number }

export interface Progress {
  lessons: Record<string, LessonResult>;
  xp: number;
  streak: { last: string; count: number; best: number };
  practiceSecs: number;
  badges: string[];
  trainerBest: number;
  examBest: number;
  earBest: number;
}

export const BADGES: Record<string, { icon: string; name: string; how: string }> = {
  first: { icon: '🎧', name: 'İlk Ders', how: 'İlk dersi bitir' },
  hotcue: { icon: '🎯', name: 'Hot Cue', how: 'Ders 2\'yi bitir' },
  tempo: { icon: '⏱️', name: 'Tempo Avcısı', how: 'Ders 3\'ü bitir' },
  ear: { icon: '👂', name: 'Altın Kulak', how: 'Ders 4\'ü (kulakla beatmatch) bitir' },
  trainer80: { icon: '🏁', name: 'Beatmatch Ustası', how: 'Beatmatch Antrenörü\'nde 80+ puan' },
  perfect: { icon: '⭐', name: 'Kusursuz', how: 'Bir dersi 3 yıldızla bitir' },
  streak3: { icon: '🔥', name: '3 Gün Seri', how: '3 gün üst üste pratik yap' },
  streak7: { icon: '🏆', name: '7 Gün Seri', how: '7 gün üst üste pratik yap' },
  hour: { icon: '⌛', name: '1 Saat', how: 'Toplam 1 saat pratik' },
  phrase: { icon: '📐', name: 'Phrase Ustası', how: 'Ders 5\'i bitir' },
  mixer: { icon: '🎛️', name: 'Geçiş Ustası', how: 'Ders 6–10\'u bitir' },
  exam80: { icon: '🎓', name: 'Sınavı Geçti', how: 'Geçiş Sınavı\'nda 80+ puan' },
  ear80: { icon: '🎵', name: 'Keskin Kulak', how: 'Kulak Egzersizi\'nde 80+ puan' },
  aksak: { icon: '🥁', name: 'Aksak Usta', how: 'Ders 14\'ü (Türk müziği) bitir' },
  grad: { icon: '🏅', name: 'Akademi Mezunu', how: '14 dersin hepsini bitir' },
};

const KEY = 'klavye-dj.academy';

export const empty = (): Progress => ({ lessons: {}, xp: 0, streak: { last: '', count: 0, best: 0 }, practiceSecs: 0, badges: [], trainerBest: 0, examBest: 0, earBest: 0 });

export function load(): Progress {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Progress | null;
    return o && typeof o === 'object' ? { ...empty(), ...o, streak: { ...empty().streak, ...o.streak } } : empty();
  } catch { return empty(); }
}

export const progress: Progress = typeof localStorage === 'undefined' ? empty() : load();

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* private mode */ }
}

/** Local calendar day, "2026-11-22". */
export const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Count today as a practice day: +1 if yesterday was one, reset if a day was missed. */
export function touchStreak(p: Progress, today = new Date()): void {
  const t = dayKey(today);
  if (p.streak.last === t) return;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  p.streak.count = p.streak.last === dayKey(y) ? p.streak.count + 1 : 1;
  p.streak.last = t;
  p.streak.best = Math.max(p.streak.best, p.streak.count);
}

/** 3 stars ≥ 90 %, 2 ≥ 70 %, 1 otherwise. */
export const starsFor = (score: number): number => score >= 90 ? 3 : score >= 70 ? 2 : 1;

/** Badges newly earned by the current state (and records them). */
export function checkBadges(p: Progress): string[] {
  const has = (id: string) => p.lessons[id] != null;
  const want: [string, boolean][] = [
    ['first', Object.keys(p.lessons).length > 0],
    ['hotcue', has('l2')], ['tempo', has('l3')], ['ear', has('l4')],
    ['trainer80', p.trainerBest >= 80],
    ['perfect', Object.values(p.lessons).some(l => l.stars === 3)],
    ['streak3', p.streak.best >= 3], ['streak7', p.streak.best >= 7],
    ['hour', p.practiceSecs >= 3600],
    ['phrase', has('l5')], ['mixer', ['l6', 'l7', 'l8', 'l9', 'l10'].every(has)], ['exam80', p.examBest >= 80],
    ['ear80', p.earBest >= 80], ['aksak', has('l14')],
    ['grad', Array.from({ length: 14 }, (_, i) => 'l' + (i + 1)).every(has)],
  ];
  const fresh = want.filter(([id, ok]) => ok && !p.badges.includes(id)).map(([id]) => id);
  p.badges.push(...fresh);
  return fresh;
}

/** Store a finished lesson (keeps the best score) and give XP. */
export function finishLesson(p: Progress, id: string, score: number, secs: number, now = new Date()): { stars: number; xp: number; badges: string[] } {
  const stars = starsFor(score), old = p.lessons[id];
  const xp = Math.round(score / 2) + (old ? 0 : 25);
  if (!old || score > old.score) p.lessons[id] = { score, stars, at: now.getTime(), secs };
  p.xp += xp;
  touchStreak(p, now);
  return { stars, xp, badges: checkBadges(p) };
}
