// Format de la progression et fusion entre appareils.
//
// Le format est pensé pour qu'une fusion ne perde rien et ne compte rien deux fois :
// - les XP sont rangés par appareil (chaque appareil n'augmente que son compteur) :
//   le total est la somme, et fusionner revient à garder le maximum par appareil ;
// - la série se calcule à partir de l'ensemble des jours d'activité : fusionner = réunir les jours ;
// - pour chaque leçon, chapitre et exercice, on garde le meilleur résultat.
// La fusion est commutative et idempotente : synchroniser deux fois, ou dans n'importe quel
// ordre, donne le même résultat.
import { addDays } from './dates';
import type { SrsItem } from './srs';

export interface ErrorEntry {
  count: number;
  last: string;
  resolved: boolean;
}

export interface Settings {
  hearts: boolean;
  unlockAll: boolean;
}

/** Partie de la progression synchronisée entre appareils (les réglages restent propres à chaque appareil). */
export interface SyncedProgress {
  version: 2;
  /** XP gagnés, par identifiant d'appareil. */
  deviceXp: Record<string, number>;
  /** Jours d'activité (AAAA-MM-JJ), triés. */
  days: string[];
  lessons: Record<string, { completed: boolean; bestAccuracy: number }>;
  chapters: Record<string, { mastered: boolean; bestScore: number }>;
  srs: Record<string, SrsItem>;
  errors: Record<string, ErrorEntry>;
  /** Date ISO de la dernière modification. */
  updatedAt: string;
}

export interface ProgressState extends SyncedProgress {
  settings: Settings;
}

/** On garde au plus deux ans de jours d'activité : largement assez pour la série. */
const MAX_DAYS = 730;

export function emptyProgress(): SyncedProgress {
  return { version: 2, deviceXp: {}, days: [], lessons: {}, chapters: {}, srs: {}, errors: {}, updatedAt: new Date(0).toISOString() };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Lit une progression de n'importe quelle version (v1 = ancien format local, v2 = format actuel).
 * Lève une erreur si les données ne ressemblent pas à une progression.
 */
export function normalizeProgress(raw: unknown, deviceId: string): SyncedProgress {
  if (!isObj(raw)) throw new Error('Données de progression illisibles');
  const out = emptyProgress();
  if (raw.version === 1) {
    // Ancien format : un total d'XP et une série { count, last }.
    const xp = typeof raw.xp === 'number' ? raw.xp : 0;
    if (xp) out.deviceXp[deviceId] = xp;
    const st = raw.streak as { count?: number; last?: string | null } | undefined;
    if (st?.last && st.count) for (let i = st.count - 1; i >= 0; i--) out.days.push(addDays(st.last, -i));
  } else if (raw.version === 2) {
    if (isObj(raw.deviceXp)) for (const [k, v] of Object.entries(raw.deviceXp)) if (typeof v === 'number') out.deviceXp[k] = v;
    if (Array.isArray(raw.days)) out.days = raw.days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (typeof raw.updatedAt === 'string') out.updatedAt = raw.updatedAt;
  } else {
    throw new Error('Fichier de progression non reconnu');
  }
  if (isObj(raw.lessons)) out.lessons = raw.lessons as SyncedProgress['lessons'];
  if (isObj(raw.chapters)) out.chapters = raw.chapters as SyncedProgress['chapters'];
  if (isObj(raw.srs)) out.srs = raw.srs as SyncedProgress['srs'];
  if (isObj(raw.errors)) out.errors = raw.errors as SyncedProgress['errors'];
  out.days = [...new Set(out.days)].sort().slice(-MAX_DAYS);
  return out;
}

/** Ordre « meilleur résultat » d'un exercice en révision : acquis > palier plus haut > révisé plus récemment. */
function srsRank(i: SrsItem): [number, number, string] {
  return [i.graduated ? 1 : 0, i.step, i.due];
}
function better(a: SrsItem, b: SrsItem): SrsItem {
  const ra = srsRank(a);
  const rb = srsRank(b);
  for (let k = 0; k < 3; k++) {
    if (ra[k] > rb[k]) return a;
    if (ra[k] < rb[k]) return b;
  }
  return a;
}

function mergeRecords<T>(a: Record<string, T>, b: Record<string, T>, both: (x: T, y: T, key: string) => T): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? both(a[k], v, k) : v;
  return out;
}

export function mergeProgress(a: SyncedProgress, b: SyncedProgress): SyncedProgress {
  const srs = mergeRecords(a.srs, b.srs, better);
  return {
    version: 2,
    deviceXp: mergeRecords(a.deviceXp, b.deviceXp, (x, y) => Math.max(x, y)),
    days: [...new Set([...a.days, ...b.days])].sort().slice(-MAX_DAYS),
    lessons: mergeRecords(a.lessons, b.lessons, (x, y) => ({
      completed: x.completed || y.completed,
      bestAccuracy: Math.max(x.bestAccuracy, y.bestAccuracy),
    })),
    chapters: mergeRecords(a.chapters, b.chapters, (x, y) => ({
      mastered: x.mastered || y.mastered,
      bestScore: Math.max(x.bestScore, y.bestScore),
    })),
    srs,
    errors: mergeRecords(a.errors, b.errors, (x, y, key) => ({
      count: Math.max(x.count, y.count),
      last: x.last > y.last ? x.last : y.last,
      // Résolue si elle l'est des deux côtés, ou si le meilleur résultat en révision a franchi J+3.
      resolved: (x.resolved && y.resolved) || (srs[key]?.step ?? 0) >= 2,
    })),
    updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
  };
}

/** Deux progressions sont-elles identiques (hors date de modification) ? Évite des envois inutiles. */
export function sameProgress(a: SyncedProgress, b: SyncedProgress): boolean {
  return canonical(a) === canonical(b);
}

/** Sérialisation à clés triées, pour comparer deux objets indépendamment de l'ordre des clés. */
export function canonical(p: SyncedProgress): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (isObj(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])]));
    return x;
  };
  return JSON.stringify(sort({ ...p, updatedAt: '' }));
}

export function totalXp(p: SyncedProgress): number {
  return Object.values(p.deviceXp).reduce((s, x) => s + x, 0);
}

/** Série en cours : jours consécutifs jusqu'à aujourd'hui (ou hier, si on n'a pas encore joué aujourd'hui). */
export function streakFromDays(days: string[], day: string): number {
  const set = new Set(days);
  let d = set.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** Plus longue série jamais atteinte. */
export function longestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  sorted.forEach((d, i) => {
    run = i > 0 && addDays(sorted[i - 1], 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}
