/** The "Akademi" menu: lessons (unlocking in order), practice modes, XP, streak, practice time and badges. */
import { CURRICULUM, LESSONS as L1to4, TRAINER } from './lessons';
import { EXAM, LESSONS2 } from './lessons2';


import { initAcademyEngine, inLesson, onSummary, setupCoach, startLesson, type Ctx } from './engine';
import { BADGES, progress } from './progress';

const LESSONS = [...L1to4, ...LESSONS2];

const $ = (s: string) => document.querySelector<HTMLElement>(s)!;

export function toggleAcademy(v?: boolean): void {
  const el = $('#academy'), show = v ?? !el.classList.contains('show');
  if (show && inLesson()) return;
  if (show) render();
  el.classList.toggle('show', show);
}

const unlocked = (no: number) => no === 1 || progress.lessons['l' + (no - 1)] != null;

function render(): void {
  const p = progress, h = Math.floor(p.practiceSecs / 3600), m = Math.floor(p.practiceSecs % 3600 / 60);
  $('#acStats').innerHTML = `
    <div><b>${p.xp}</b><small>XP</small></div>
    <div><b>${p.streak.count}🔥</b><small>günlük seri (en iyi ${p.streak.best})</small></div>
    <div><b>${h ? h + ' sa ' : ''}${m} dk</b><small>pratik</small></div>
    <div><b>${Object.keys(p.lessons).filter(k => k !== 'trainer').length}/${CURRICULUM.length}</b><small>ders</small></div>`;
  $('#acLessons').innerHTML = CURRICULUM.map(c => {
    const l = LESSONS.find(x => x.no === c.no), r = p.lessons['l' + c.no];
    const state = !l ? 'soon' : !unlocked(c.no) ? 'locked' : r ? 'done' : 'open';
    const right = state === 'soon' ? '<em>yakında</em>' : state === 'locked' ? '🔒' : r ? `<span class="stars">${'★'.repeat(r.stars)}<i>${'★'.repeat(3 - r.stars)}</i></span>` : '<em class="go">Başla ▸</em>';
    return `<li class="${state}" data-no="${c.no}"><span class="no">${c.no}</span><span class="tt">${c.title}${l ? `<small>${l.goal} · ~${l.minutes} dk</small>` : ''}</span>${right}</li>`;
  }).join('');
  $('#acPractice').innerHTML = `
    <li class="open" data-p="trainer"><span class="no">🏁</span><span class="tt">Beatmatch Antrenörü<small>${TRAINER.goal}${p.trainerBest ? ` · en iyi: ${p.trainerBest}` : ''}</small></span><em class="go">Başla ▸</em></li>
    <li class="${unlocked(7) ? 'open' : 'locked'}" data-p="exam"><span class="no">🎚️</span><span class="tt">Geçiş Sınavı<small>${EXAM.goal}${p.examBest ? ` · en iyi: ${p.examBest}` : ' · Ders 6\'dan sonra açılır'}</small></span>${unlocked(7) ? '<em class="go">Başla ▸</em>' : '🔒'}</li>
    <li class="soon"><span class="no">👂</span><span class="tt">Kulak Egzersizi<small>Hangisi hızlı? Hangisi önde? Kısa kulak testleri</small></span><em>yakında</em></li>`;
  $('#acBadges').innerHTML = Object.entries(BADGES).map(([id, b]) =>
    `<span class="badge ${p.badges.includes(id) ? '' : 'off'}" title="${b.how}">${b.icon} ${b.name}</span>`).join('');
}

export function setupAcademy(c: Ctx): void {
  initAcademyEngine(c, () => { /* back to normal use */ });
  setupCoach();
  $('#acadBtn').onclick = () => toggleAcademy();
  $('#acClose').onclick = () => toggleAcademy(false);
  $('#acLessons').onclick = e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-no]');
    if (!li || !li.classList.contains('open') && !li.classList.contains('done')) return;
    const l = LESSONS.find(x => x.no === +li.dataset.no!);
    if (l) { toggleAcademy(false); void startLesson(l); }
  };
  $('#acPractice').onclick = e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-p]');
    if (!li || !li.classList.contains('open')) return;
    toggleAcademy(false); void startLesson(li.dataset.p === 'exam' ? EXAM : TRAINER);
  };
  onSummary((what, l) => {
    if (what === 'menu' || l.practice) { toggleAcademy(true); return; }
    const next = LESSONS.find(x => x.no === l.no + 1);
    if (next) void startLesson(next); else toggleAcademy(true);
  });
}
