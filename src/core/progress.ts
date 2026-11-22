// Progression de l'élève, enregistrée dans le navigateur (localStorage), toujours en premier :
// l'application marche hors ligne et sans compte. La synchronisation en ligne (sync.ts) vient en plus.
import { chapterKey, lessonKey, type Catalog } from './content';
import { today } from './dates';
import {
  emptyProgress, mergeProgress, normalizeProgress, streakFromDays, totalXp,
  type ProgressState, type Settings, type SyncedProgress,
} from './merge';
import { fail, isDue, learn, succeed } from './srs';
import type { Chapter, Module } from './types';

export type { ErrorEntry, ProgressState, Settings, SyncedProgress } from './merge';

const STORAGE_KEY = 'logiquepe:progress';
const DEVICE_KEY = 'logiquepe:device';
export const DEFAULT_THRESHOLD = 0.85;

const DEFAULT_SETTINGS: Settings = { hearts: true, unlockAll: false };

/** Identifiant de cet appareil (pour compter ses XP séparément de ceux des autres appareils). */
export const deviceId: string = (() => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'appareil-local';
  }
})();

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...emptyProgress(), settings: { ...DEFAULT_SETTINGS } };
    const data = JSON.parse(raw) as { settings?: Partial<Settings> };
    return { ...normalizeProgress(data, deviceId), settings: { ...DEFAULT_SETTINGS, ...data.settings } };
  } catch {
    return { ...emptyProgress(), settings: { ...DEFAULT_SETTINGS } };
  }
}

export const state: ProgressState = load();

const saveListeners = new Set<() => void>();
/** Prévenir quand la progression change (la synchronisation s'y abonne). */
export function onSave(fn: () => void): void {
  saveListeners.add(fn);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible (navigation privée…) : la progression reste en mémoire */
  }
}

/** Enregistre une modification de la progression. */
export function save(): void {
  state.updatedAt = new Date().toISOString();
  persist();
  saveListeners.forEach((fn) => fn());
}

/** Enregistre seulement un changement de réglage (les réglages ne sont pas synchronisés). */
export function saveSettings(): void {
  persist();
}

/** Partie synchronisée de la progression locale. */
export function syncedPart(): SyncedProgress {
  const { settings: _settings, ...rest } = state;
  void _settings;
  return JSON.parse(JSON.stringify(rest)) as SyncedProgress;
}

/** Remplace la partie synchronisée (après fusion avec la sauvegarde en ligne), sans toucher aux réglages. */
export function applySynced(p: SyncedProgress): void {
  Object.assign(state, p);
  persist();
}

export function totalXpLocal(): number {
  return totalXp(state);
}

export function addXp(n: number): void {
  state.deviceXp[deviceId] = (state.deviceXp[deviceId] ?? 0) + n;
}

// --- Sauvegarde manuelle en fichier -----------------------------------------------

export function exportProgress(): string {
  return JSON.stringify({ app: 'logique', exportedAt: new Date().toISOString(), ...syncedPart() }, null, 2);
}

/** Importe un fichier de sauvegarde en le FUSIONNANT avec la progression actuelle (rien n'est perdu). */
export function importProgress(json: string): void {
  let data: unknown;
  try { data = JSON.parse(json); } catch { throw new Error('ce fichier n\'est pas une sauvegarde valide (JSON illisible)'); }
  const incoming = normalizeProgress(data, deviceId);
  applySynced(mergeProgress(syncedPart(), incoming));
  save();
}

export function resetProgress(): void {
  // On garde l'historique d'XP des autres appareils seulement s'ils se resynchronisent : ici tout repart de zéro.
  Object.assign(state, emptyProgress());
  save();
}

// --- Série de jours -------------------------------------------------------

export function recordActivity(day = today()): void {
  if (!state.days.includes(day)) state.days = [...state.days, day].sort();
}

/** Série affichée : jours consécutifs jusqu'à aujourd'hui (ou hier). */
export function currentStreak(day = today()): number {
  return streakFromDays(state.days, day);
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
  addXp(xp);
  recordActivity();
  save();
}

export function completeTest(key: string, score: number, threshold: number, xp: number): boolean {
  const prev = state.chapters[key];
  const passed = score >= threshold;
  state.chapters[key] = { mastered: passed || !!prev?.mastered, bestScore: Math.max(score, prev?.bestScore ?? 0) };
  addXp(xp);
  recordActivity();
  save();
  return passed;
}

export function completeReview(xp: number): void {
  addXp(xp);
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
