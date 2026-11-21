// Sémantique de la logique des prédicats : modèles finis, évaluation, équivalence, recherche de modèles.
//
// L'équivalence en logique des prédicats est indécidable en général. On compare donc les formules
// sur tous les modèles de 1 à 4 éléments (ou sur un large échantillon quand ils sont trop nombreux).
// Pour des exercices d'initiation, une différence apparaît toujours sur de si petits modèles.
import {
  constants, equivalent, formatValuation, freeVariables, isFirstOrder, isModal, predicates, sortedAtoms,
  type Formula, type Term,
} from './formula';
import { modalEquivalent } from './modal';

export interface FOModel {
  size: number;
  /** Noms affichés des éléments (défaut : 1, 2, 3…). */
  labels?: string[];
  consts: Record<string, number>;
  /** Extension de chaque prédicat : ensemble de n-uplets codés « 0,1 ». */
  preds: Record<string, Set<string>>;
  props: Record<string, boolean>;
}

export interface Signature {
  preds: Map<string, number>;
  consts: string[];
  props: string[];
}

export function signatureOf(...fs: Formula[]): Signature {
  const preds = new Map<string, number>();
  const cs = new Set<string>();
  fs.forEach((f) => { predicates(f, preds); constants(f, cs); });
  return { preds, consts: [...cs].sort(), props: sortedAtoms(...fs) };
}

export function evalFO(f: Formula, m: FOModel, g: Record<string, number> = {}): boolean {
  const val = (t: Term): number => {
    if (t.k === 'var') {
      if (!(t.name in g)) throw new Error(`La variable ${t.name} est libre`);
      return g[t.name];
    }
    if (!(t.name in m.consts)) throw new Error(`Le nom ${t.name} ne désigne rien dans ce modèle`);
    return m.consts[t.name];
  };
  switch (f.k) {
    case 'atom': return !!m.props[f.name];
    case 'const': return f.value;
    case 'pred': return !!m.preds[f.name]?.has(f.args.map(val).join(','));
    case 'not': return !evalFO(f.a, m, g);
    case 'and': return evalFO(f.a, m, g) && evalFO(f.b, m, g);
    case 'or': return evalFO(f.a, m, g) || evalFO(f.b, m, g);
    case 'imp': return !evalFO(f.a, m, g) || evalFO(f.b, m, g);
    case 'iff': return evalFO(f.a, m, g) === evalFO(f.b, m, g);
    case 'forall': {
      for (let d = 0; d < m.size; d++) if (!evalFO(f.a, m, { ...g, [f.v]: d })) return false;
      return true;
    }
    case 'exists': {
      for (let d = 0; d < m.size; d++) if (evalFO(f.a, m, { ...g, [f.v]: d })) return true;
      return false;
    }
    case 'box': case 'dia':
      throw new Error('Les modalités ne sont pas évaluées dans un modèle des prédicats');
  }
}

/** Générateur pseudo-aléatoire reproductible (les tests ne doivent pas dépendre du hasard). */
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

function tuples(n: number, arity: number): string[] {
  let out: number[][] = [[]];
  for (let i = 0; i < arity; i++) out = out.flatMap((t) => Array.from({ length: n }, (_, d) => [...t, d]));
  return out.map((t) => t.join(','));
}

const EXHAUSTIVE_LIMIT = 60000;
const SAMPLES = 4000;

/** Modèles de taille n pour une signature : tous, ou un échantillon s'ils sont trop nombreux. */
export function* models(sig: Signature, n: number, seed = 1): Generator<FOModel> {
  const slots: { pred: string; tuple: string }[] = [];
  for (const [p, ar] of sig.preds) for (const t of tuples(n, ar)) slots.push({ pred: p, tuple: t });
  const bits = slots.length + sig.props.length;
  const total = 2 ** bits * n ** sig.consts.length;

  const build = (bitAt: (i: number) => boolean, constAt: (i: number) => number): FOModel => {
    const preds: Record<string, Set<string>> = {};
    for (const p of sig.preds.keys()) preds[p] = new Set();
    slots.forEach((s, i) => { if (bitAt(i)) preds[s.pred].add(s.tuple); });
    const props: Record<string, boolean> = {};
    sig.props.forEach((p, i) => { props[p] = bitAt(slots.length + i); });
    const consts: Record<string, number> = {};
    sig.consts.forEach((c, i) => { consts[c] = constAt(i); });
    return { size: n, preds, props, consts };
  };

  if (total <= EXHAUSTIVE_LIMIT) {
    for (let k = 0; k < total; k++) {
      let rest = k;
      const cvals = sig.consts.map(() => { const d = rest % n; rest = Math.floor(rest / n); return d; });
      const word = rest;
      yield build((i) => Math.floor(word / 2 ** i) % 2 === 1, (i) => cvals[i]);
    }
  } else {
    const r = rng(seed * 7919 + n);
    for (let k = 0; k < SAMPLES; k++) {
      const b = Array.from({ length: bits }, () => r() < 0.5);
      const c = sig.consts.map(() => Math.floor(r() * n));
      yield build((i) => b[i], (i) => c[i]);
    }
  }
}

export function describeModel(m: FOModel): string {
  const lab = (d: number) => m.labels?.[d] ?? String(d + 1);
  const parts = [`domaine {${Array.from({ length: m.size }, (_, d) => lab(d)).join(', ')}}`];
  for (const [c, d] of Object.entries(m.consts)) parts.push(`${c} = ${lab(d)}`);
  for (const [p, ext] of Object.entries(m.preds)) {
    const items = [...ext].sort().map((t) => {
      const ds = t.split(',').map((x) => lab(+x));
      return ds.length === 1 ? ds[0] : `⟨${ds.join(',')}⟩`;
    });
    parts.push(`${p} = {${items.join(', ')}}`);
  }
  for (const [p, v] of Object.entries(m.props)) parts.push(`${p} = ${v ? 'V' : 'F'}`);
  return parts.join(' ; ');
}

export type GeneralEquiv =
  | { equivalent: true }
  | { equivalent: false; where: string; valueA: boolean; valueB: boolean };

/** Équivalence : exacte en logique propositionnelle, sur les petits modèles en logique des prédicats et modale. */
export function generalEquivalent(a: Formula, b: Formula, maxSize = 4): GeneralEquiv {
  if (isModal(a) || isModal(b)) return modalEquivalent(a, b);
  if (!isFirstOrder(a) && !isFirstOrder(b)) {
    const r = equivalent(a, b);
    return r.equivalent ? r : { equivalent: false, where: `la valuation ${formatValuation(r.counter)}`, valueA: r.valueA, valueB: r.valueB };
  }
  const sig = signatureOf(a, b);
  for (let n = 1; n <= maxSize; n++) {
    for (const m of models(sig, n)) {
      const va = evalFO(a, m);
      const vb = evalFO(b, m);
      if (va !== vb) return { equivalent: false, where: `le modèle [${describeModel(m)}]`, valueA: va, valueB: vb };
    }
  }
  return { equivalent: true };
}

/** Cherche un modèle où toutes les formules `trues` sont vraies et toutes les `falses` fausses. */
export function findModel(trues: Formula[], falses: Formula[], maxSize = 3, minSize = 1): FOModel | null {
  const sig = signatureOf(...trues, ...falses);
  for (let n = minSize; n <= maxSize; n++) {
    for (const m of models(sig, n)) {
      if (trues.every((f) => evalFO(f, m)) && falses.every((f) => !evalFO(f, m))) return m;
    }
  }
  return null;
}

export function isSentence(f: Formula): boolean {
  return freeVariables(f).size === 0;
}

// --- Modèles écrits dans le contenu -----------------------------------------------

/** Format JSON : éléments nommés, constantes, extensions (liste d'éléments, ou de paires pour une relation). */
export interface ModelSpec {
  domain: string[];
  constants?: Record<string, string>;
  predicates?: Record<string, (string | string[])[]>;
}

export function modelFromSpec(spec: ModelSpec): FOModel {
  const idx = (e: string) => {
    const i = spec.domain.indexOf(e);
    if (i < 0) throw new Error(`Élément inconnu dans le modèle : ${e}`);
    return i;
  };
  const preds: Record<string, Set<string>> = {};
  for (const [p, ext] of Object.entries(spec.predicates ?? {})) {
    preds[p] = new Set(ext.map((t) => (Array.isArray(t) ? t : [t]).map(idx).join(',')));
  }
  const consts: Record<string, number> = {};
  for (const [c, e] of Object.entries(spec.constants ?? {})) consts[c] = idx(e);
  return { size: spec.domain.length, labels: spec.domain, consts, preds, props: {} };
}
