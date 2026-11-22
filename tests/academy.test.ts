import { describe, it, expect } from 'vitest';
import { empty, touchStreak, starsFor, finishLesson, checkBadges, dayKey } from '../src/academy/progress';

const day = (s: string) => new Date(s + 'T12:00:00');

describe('academy progress', () => {
  it('counts a daily streak, resets after a missed day, keeps the best', () => {
    const p = empty();
    touchStreak(p, day('2026-11-20')); touchStreak(p, day('2026-11-20'));
    expect(p.streak.count).toBe(1);
    touchStreak(p, day('2026-11-21')); touchStreak(p, day('2026-11-22'));
    expect(p.streak).toMatchObject({ count: 3, best: 3, last: '2026-11-22' });
    touchStreak(p, day('2026-11-24'));
    expect(p.streak).toMatchObject({ count: 1, best: 3 });
  });

  it('stars and best score', () => {
    expect([95, 90, 75, 40].map(starsFor)).toEqual([3, 3, 2, 1]);
    const p = empty();
    const a = finishLesson(p, 'l1', 72, 100, day('2026-11-22'));
    expect(a.stars).toBe(2);
    expect(a.badges).toContain('first');
    finishLesson(p, 'l1', 60, 90, day('2026-11-22'));
    expect(p.lessons.l1.score).toBe(72);           // the better result stays
    const b = finishLesson(p, 'l1', 95, 80, day('2026-11-22'));
    expect(p.lessons.l1.stars).toBe(3);
    expect(b.badges).toContain('perfect');
    expect(p.xp).toBe(36 + 25 + 30 + 48);
  });

  it('badges are given once', () => {
    const p = empty();
    p.trainerBest = 85; p.practiceSecs = 4000;
    expect(checkBadges(p).sort()).toEqual(['hour', 'trainer80']);
    expect(checkBadges(p)).toEqual([]);
  });

  it('formats local days', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
