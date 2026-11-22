import { describe, expect, it } from 'vitest';
import {
  canonical, emptyProgress, longestStreak, mergeProgress, normalizeProgress, streakFromDays, totalXp,
  type SyncedProgress,
} from '../src/core/merge';

const p = (over: Partial<SyncedProgress>): SyncedProgress => ({ ...emptyProgress(), ...over });

const pc = p({
  deviceXp: { pc: 120 },
  days: ['2026-11-18', '2026-11-19', '2026-11-20'],
  lessons: { 'logique/ch1/l1': { completed: true, bestAccuracy: 0.6 } },
  chapters: { 'logique/ch0': { mastered: true, bestScore: 0.9 } },
  srs: {
    'logique/c1-1': { step: 3, due: '2026-11-27', graduated: false },
    'logique/c1-2': { step: 0, due: '2026-11-21', graduated: false },
  },
  errors: { 'logique/c1-2': { count: 2, last: '2026-11-20', resolved: false } },
  updatedAt: '2026-11-20T10:00:00.000Z',
});

const phone = p({
  deviceXp: { phone: 45 },
  days: ['2026-11-21', '2026-11-22'],
  lessons: {
    'logique/ch1/l1': { completed: true, bestAccuracy: 0.9 },
    'logique/ch1/l2': { completed: true, bestAccuracy: 0.7 },
  },
  srs: {
    'logique/c1-1': { step: 1, due: '2026-11-24', graduated: false },
    'logique/c1-2': { step: 2, due: '2026-11-25', graduated: false },
  },
  errors: { 'logique/c1-2': { count: 1, last: '2026-11-19', resolved: false } },
  updatedAt: '2026-11-22T08:00:00.000Z',
});

describe('fusion de la progression', () => {
  const m = mergeProgress(pc, phone);

  it('additionne les XP des deux appareils', () => {
    expect(totalXp(m)).toBe(165);
  });
  it('ne recompte pas les XP en synchronisant plusieurs fois', () => {
    const again = mergeProgress(mergeProgress(m, phone), pc);
    expect(totalXp(again)).toBe(165);
  });
  it('compte les XP gagnés depuis la dernière synchro sur un appareil déjà fusionné', () => {
    const phoneLater = { ...m, deviceXp: { ...m.deviceXp, phone: 60 } };
    expect(totalXp(mergeProgress(m, phoneLater))).toBe(180);
  });
  it('réunit les jours d\'activité : la série couvre les deux appareils', () => {
    expect(streakFromDays(pc.days, '2026-11-22')).toBe(0);
    expect(streakFromDays(phone.days, '2026-11-22')).toBe(2);
    expect(streakFromDays(m.days, '2026-11-22')).toBe(5);
    expect(longestStreak(m.days)).toBe(5);
  });
  it('garde le meilleur résultat par leçon, chapitre et exercice', () => {
    expect(m.lessons['logique/ch1/l1']).toEqual({ completed: true, bestAccuracy: 0.9 });
    expect(m.lessons['logique/ch1/l2']?.completed).toBe(true);
    expect(m.chapters['logique/ch0']?.mastered).toBe(true);
    expect(m.srs['logique/c1-1']?.step).toBe(3);
    expect(m.srs['logique/c1-2']?.step).toBe(2);
  });
  it('marque une erreur résolue quand le meilleur résultat a franchi J+3', () => {
    expect(m.errors['logique/c1-2']).toEqual({ count: 2, last: '2026-11-20', resolved: true });
  });
  it('est commutative et idempotente', () => {
    expect(canonical(mergeProgress(phone, pc))).toBe(canonical(m));
    expect(canonical(mergeProgress(m, m))).toBe(canonical(m));
    expect(m.updatedAt).toBe(phone.updatedAt);
  });
});

describe('lecture des anciennes sauvegardes', () => {
  it('convertit le format v1 (XP total, série) sans rien perdre', () => {
    const v1 = { version: 1, xp: 80, streak: { count: 3, last: '2026-11-20' }, lessons: { a: { completed: true, bestAccuracy: 1 } }, chapters: {}, srs: {}, errors: {}, settings: { hearts: false, unlockAll: false } };
    const v2 = normalizeProgress(v1, 'pc');
    expect(v2.deviceXp).toEqual({ pc: 80 });
    expect(v2.days).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    expect(v2.lessons.a?.completed).toBe(true);
    expect('settings' in v2).toBe(false);
  });
  it('refuse un fichier qui n\'est pas une progression', () => {
    expect(() => normalizeProgress({ foo: 1 }, 'pc')).toThrow();
    expect(() => normalizeProgress('texte', 'pc')).toThrow();
  });
});
