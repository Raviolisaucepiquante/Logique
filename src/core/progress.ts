// Progression de l'élève, sauvegardée dans le navigateur (localStorage).
import { chapterKey, lessonKey, type Catalog } from './content';
import { addDays, today } from './dates';
import { fail, isDue, learn, succeed, type SrsItem } from './srs';
import type { Chapter, Module } from './types';

const STORAGE_KEY = 'logiquepe:progress';
export const DEFAULT_THRESHOLD = 0.85;

export interface ErrorEntry {
  count: number;
  last: string;
  resolved: boolean;
}

export interface Settings {
  hearts: boolean;
  unlockAll: boolean;
}

export interface ProgressState {
  version: 1;
  xp: number;
  streak: { count: number; last: string | null };
  lessons: Record<string, { completed: boolean; bestAccuracy: number }>;
  chapters: Record<string, { mastered: boolean; bestScore: number }>;
  srs: Record<string, SrsItem>;
  errors: Record<string, ErrorEntry>;
  settings: Settings;
}

function fresh(): ProgressState {
  return {
    version: 1,
    xp: 0,
    streak: { count: 0, last: null },
    lessons: {},
    chapters: {},
    srs: {},
    errors: {},
    settings: { hearts: true, unlockAll: false },
  };
}

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const data = JSON.parse(raw) as Partial<ProgressState>;
    const base = fresh();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings } } as ProgressState;
  } catch {
    return fresh();
  }
}

export const state: ProgressState = load();

export function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible (navigation privée…) : la progression reste en mémoire */
  }
}

export function exportProgress(): string {
  return JSON.stringify(state, null, 2);
}

export function importProgress(json: string): void {
  const data = JSON.parse(json) as ProgressState;
  if (data.version !== 1) throw new Error('Fichier de progression non reconnu');
  Object.assign(state, fresh(), data);
  save();
}

export function resetProgress(): void {
  const settings = state.settings;
  Object.assign(state, fresh(), { settings });
  save();
}

// --- Série de jours -------------------------------------------------------

export function recordActivity(day = today()): void {
  const s = state.streak;
  if (s.last === day) return;
  s.count = s.last === addDays(day, -1) ? s.count + 1 : 1;
  s.last = day;
}

/** Série affichée : elle tombe à 0 si le dernier jour actif est avant-hier ou plus ancien. */
export function currentStreak(day = today()): number {
  const s = state.streak;
  if (!s.last) return 0;
  return s.last === day || s.last === addDays(day, -1) ? s.count : 0;
}

// --- Déblocage -------------------------------------------------------------

export function isLessonCompleted(m: Module, c: Chapter, lessonId: string): boolean {
  return !!state.lessons[lessonKey(m.id, c.id, lessonId)]?.completed;
}

export function isChapterMastered(m: Module, c: Chapter): boolean {
  return !!state.chapters[chapterKey(m.id, c.id)]?.mastered;
}

export function isChapterUnlocked(m: Module, index: number): boolean {
  if (state.settings.unlockAll || index === 0) return true;
  return isChapterMastered(m, m.chapters[index - 1]);
}

export function isLessonUnlocked(m: Module, chapterIndex: number, lessonIndex: number): boolean {
  if (!isChapterUnlocked(m, chapterIndex)) return false;
  if (state.settings.unlockAll || lessonIndex === 0) return true;
  const c = m.chapters[chapterIndex];
  return isLessonCompleted(m, c, c.lessons[lessonIndex - 1].id);
}

export function isTestUnlocked(m: Module, chapterIndex: number): boolean {
  if (!isChapterUnlocked(m, chapterIndex)) return false;
  if (state.settings.unlockAll) return true;
  const c = m.chapters[chapterIndex];
  return c.lessons.every((l) => isLessonCompleted(m, c, l.id));
}

// --- Résultats --------------------------------------------------------------

/** Enregistre une réponse à un exercice (leçon, test ou révision). */
export function recordAnswer(key: string, correct: boolean, mode: 'lesson' | 'review', day = today()): void {
  const item = state.srs[key];
  if (!correct) {
    state.srs[key] = fail(day);
    const e = state.errors[key];
    state.errors[key] = { count: (e?.count ?? 0) + 1, last: day, resolved: false };
    return;
  }
  if (!item) {
    state.srs[key] = learn(day);
  } else if (mode === 'review' || isDue(item, day)) {
    state.srs[key] = succeed(item, day);
  }
  // Une erreur est « résolue » après deux révisions réussies d'affilée (J+1 puis J+3).
  const e = state.errors[key];
  if (e && !e.resolved && state.srs[key].step >= 2) e.resolved = true;
}

export function completeLesson(key: string, accuracy: number, xp: number): void {
  const prev = state.lessons[key];
  state.lessons[key] = { completed: true, bestAccuracy: Math.max(accuracy, prev?.bestAccuracy ?? 0) };
  state.xp += xp;
  recordActivity();
  save();
}

export function completeTest(key: string, score: number, threshold: number, xp: number): boolean {
  const prev = state.chapters[key];
  const passed = score >= threshold;
  state.chapters[key] = { mastered: passed || !!prev?.mastered, bestScore: Math.max(score, prev?.bestScore ?? 0) };
  state.xp += xp;
  recordActivity();
  save();
  return passed;
}

export function completeReview(xp: number): void {
  state.xp += xp;
  recordActivity();
  save();
}

// --- Révision -----------------------------------------------------------------

export function dueKeys(catalog: Catalog, day = today()): string[] {
  return Object.entries(state.srs)
    .filter(([k, item]) => catalog.exercises.has(k) && isDue(item, day))
    .sort((a, b) => a[1].due.localeCompare(b[1].due))
    .map(([k]) => k);
}

export function unresolvedErrorKeys(catalog: Catalog): string[] {
  return Object.entries(state.errors)
    .filter(([k, e]) => catalog.exercises.has(k) && !e.resolved)
    .sort((a, b) => b[1].last.localeCompare(a[1].last))
    .map(([k]) => k);
}
