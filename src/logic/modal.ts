// Sémantique de Kripke pour la logique modale propositionnelle.
// Un modèle : des mondes, une relation d'accessibilité, et pour chaque monde les lettres vraies.
// □A est vrai en w si A est vrai dans tous les mondes accessibles depuis w ; ◇A s'il l'est dans au moins un.
import { isFirstOrder, sortedAtoms, type Formula } from './formula';

export interface KModel {
  n: number;
  /** R[i][j] : le monde j est accessible depuis le monde i. */
  R: boolean[][];
  /** val[p][i] : p est vraie dans le monde i. */
  val: Record<string, boolean[]>;
  labels?: string[];
}

export type FrameProperty = 'reflexive' | 'symmetric' | 'transitive' | 'serial';
export type ModalSystem = 'K' | 'D' | 'T' | 'B' | 'S4' | 'S5';

export const SYSTEM_FRAMES: Record<ModalSystem, FrameProperty[]> = {
  K: [],
  D: ['serial'],
  T: ['reflexive'],
  B: ['reflexive', 'symmetric'],
  S4: ['reflexive', 'transitive'],
  S5: ['reflexive', 'symmetric', 'transitive'],
};

export const PROPERTY_NAMES: Record<FrameProperty, string> = {
  reflexive: 'réflexive (chaque monde se voit lui-même)',
  symmetric: 'symétrique (si w voit v, v voit w)',
  transitive: 'transitive (si w voit v et v voit u, w voit u)',
  serial: 'sérielle (chaque monde voit au moins un monde)',
};

export const worldLabel = (m: { labels?: string[] }, i: number) => m.labels?.[i] ?? `w${i + 1}`;

export function evalK(f: Formula, m: KModel, w: number): boolean {
  switch (f.k) {
    case 'atom': return !!m.val[f.name]?.[w];
    case 'const': return f.value;
    case 'not': return !evalK(f.a, m, w);
    case 'and': return evalK(f.a, m, w) && evalK(f.b, m, w);
    case 'or': return evalK(f.a, m, w) || evalK(f.b, m, w);
    case 'imp': return !evalK(f.a, m, w) || evalK(f.b, m, w);
    case 'iff': return evalK(f.a, m, w) === evalK(f.b, m, w);
    case 'box': {
      for (let v = 0; v < m.n; v++) if (m.R[w][v] && !evalK(f.a, m, v)) return false;
      return true;
    }
    case 'dia': {
      for (let v = 0; v < m.n; v++) if (m.R[w][v] && evalK(f.a, m, v)) return true;
      return false;
    }
    default:
      throw new Error('Les prédicats ne sont pas évalués dans un modèle de Kripke propositionnel');
  }
}

export function hasProperty(R: boolean[][], p: FrameProperty): boolean {
  const n = R.length;
  const all = (fn: (i: number, j: number, k: number) => boolean) => {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (!fn(i, j, k)) return false;
    return true;
  };
  switch (p) {
    case 'reflexive': return R.every((row, i) => row[i]);
    case 'symmetric': return all((i, j) => !R[i][j] || R[j][i]);
    case 'transitive': return all((i, j, k) => !(R[i][j] && R[j][k]) || R[i][k]);
    case 'serial': return R.every((row) => row.some(Boolean));
  }
}

/** Explique pourquoi une propriété manque (pour le retour à l'élève). */
export function propertyFailure(m: KModel, p: FrameProperty): string | null {
  const R = m.R;
  const n = m.n;
  const L = (i: number) => worldLabel(m, i);
  for (let i = 0; i < n; i++) {
    if (p === 'reflexive' && !R[i][i]) return `${L(i)} ne se voit pas lui-même`;
    if (p === 'serial' && !R[i].some(Boolean)) return `${L(i)} ne voit aucun monde`;
    for (let j = 0; j < n; j++) {
      if (p === 'symmetric' && R[i][j] && !R[j][i]) return `${L(i)} voit ${L(j)} mais ${L(j)} ne voit pas ${L(i)}`;
      for (let k = 0; k < n; k++) {
        if (p === 'transitive' && R[i][j] && R[j][k] && !R[i][k]) return `${L(i)} voit ${L(j)}, ${L(j)} voit ${L(k)}, mais ${L(i)} ne voit pas ${L(k)}`;
      }
    }
  }
  return null;
}

export function frameOk(R: boolean[][], system: ModalSystem): boolean {
  return SYSTEM_FRAMES[system].every((p) => hasProperty(R, p));
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXHAUSTIVE_LIMIT = 70000;
const SAMPLES = 6000;

/** Modèles de Kripke à n mondes, dont le cadre appartient au système donné. */
export function* kripkeModels(atoms: string[], n: number, system: ModalSystem = 'K', seed = 1): Generator<KModel> {
  const rbits = n * n;
  const vbits = n * atoms.length;
  const total = 2 ** (rbits + vbits);
  const build = (bit: (i: number) => boolean): KModel => {
    const R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => bit(i * n + j)));
    const val: Record<string, boolean[]> = {};
    atoms.forEach((p, a) => { val[p] = Array.from({ length: n }, (_, w) => bit(rbits + a * n + w)); });
    return { n, R, val };
  };
  if (total <= EXHAUSTIVE_LIMIT) {
    for (let k = 0; k < total; k++) {
      const m = build((i) => Math.floor(k / 2 ** i) % 2 === 1);
      if (frameOk(m.R, system)) yield m;
    }
  } else {
    const r = rng(seed * 31 + n);
    let produced = 0;
    for (let tries = 0; produced < SAMPLES && tries < SAMPLES * 20; tries++) {
      const bits = Array.from({ length: rbits + vbits }, () => r() < 0.5);
      // On impose directement la réflexivité quand le système l'exige, pour ne pas tout rejeter.
      if (SYSTEM_FRAMES[system].includes('reflexive')) for (let i = 0; i < n; i++) bits[i * n + i] = true;
      const m = build((i) => bits[i]);
      if (frameOk(m.R, system)) { produced++; yield m; }
    }
  }
}

export function describeKripke(m: KModel): string {
  const L = (i: number) => worldLabel(m, i);
  const worlds = Array.from({ length: m.n }, (_, i) => i);
  const arrows = worlds.flatMap((i) => worlds.filter((j) => m.R[i][j]).map((j) => `${L(i)}→${L(j)}`));
  const vals = worlds.map((i) => {
    const t = Object.keys(m.val).filter((p) => m.val[p][i]);
    return `${L(i)} : ${t.length ? t.join(', ') : 'aucune lettre vraie'}`;
  });
  return `mondes ${worlds.map(L).join(', ')} ; accès ${arrows.length ? arrows.join(', ') : 'aucun'} ; ${vals.join(' ; ')}`;
}

/** Cherche un modèle où, au premier monde, les `trues` sont vraies et les `falses` fausses. */
export function findKripke(trues: Formula[], falses: Formula[], system: ModalSystem = 'K', maxWorlds = 3): KModel | null {
  const atoms = sortedAtoms(...trues, ...falses);
  for (let n = 1; n <= maxWorlds; n++) {
    for (const m of kripkeModels(atoms, n, system)) {
      if (trues.every((f) => evalK(f, m, 0)) && falses.every((f) => !evalK(f, m, 0))) return m;
    }
  }
  return null;
}

/** Contre-modèle à la validité de f dans le système (ou null si f est valide sur les petits modèles). */
export function validityCounter(f: Formula, system: ModalSystem = 'K', maxWorlds = 3): KModel | null {
  return findKripke([], [f], system, maxWorlds);
}

export type ModalEquiv =
  | { equivalent: true }
  | { equivalent: false; where: string; valueA: boolean; valueB: boolean };

/** Équivalence en logique modale K : même valeur dans chaque monde de chaque petit modèle. */
export function modalEquivalent(a: Formula, b: Formula, maxWorlds = 3): ModalEquiv {
  if (isFirstOrder(a) || isFirstOrder(b)) throw new Error('Logique modale des prédicats : non prise en charge');
  const atoms = sortedAtoms(a, b);
  for (let n = 1; n <= maxWorlds; n++) {
    for (const m of kripkeModels(atoms, n)) {
      for (let w = 0; w < n; w++) {
        const va = evalK(a, m, w);
        const vb = evalK(b, m, w);
        if (va !== vb) return { equivalent: false, where: `le modèle [${describeKripke(m)}], au monde ${worldLabel(m, w)}`, valueA: va, valueB: vb };
      }
    }
  }
  return { equivalent: true };
}

// --- Modèles écrits dans le contenu -------------------------------------------------

export interface KripkeSpec {
  worlds: string[];
  /** Flèches [de, vers]. */
  access: [string, string][];
  /** Lettres vraies dans chaque monde. */
  valuation: Record<string, string[]>;
}

export function kripkeFromSpec(spec: KripkeSpec): KModel {
  const idx = (w: string) => {
    const i = spec.worlds.indexOf(w);
    if (i < 0) throw new Error(`Monde inconnu : ${w}`);
    return i;
  };
  const n = spec.worlds.length;
  const R = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  spec.access.forEach(([a, b]) => { R[idx(a)][idx(b)] = true; });
  const val: Record<string, boolean[]> = {};
  for (const [w, ps] of Object.entries(spec.valuation)) {
    for (const p of ps) {
      val[p] ??= Array.from({ length: n }, () => false);
      val[p][idx(w)] = true;
    }
  }
  return { n, R, val, labels: spec.worlds };
}
