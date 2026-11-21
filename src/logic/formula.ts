// Moteur de formules : analyse syntaxique, affichage, évaluation propositionnelle.
// Syntaxe (celle de forall x) :
//   - lettres de proposition : p, q, r… (minuscule isolée) ;
//   - prédicats : majuscule suivie de ses arguments collés, ex. Fa, Rxy ;
//   - variables : u, v, w, x, y, z ; constantes (noms) : les autres minuscules ;
//   - quantificateurs : ∀x, ∃x, qui portent sur ce qui suit immédiatement : ∀x(Fx → Gx).
// La sémantique des prédicats (modèles) est dans semantics.ts.

export type BinaryKind = 'and' | 'or' | 'imp' | 'iff';
export type UnaryKind = 'not' | 'box' | 'dia';
export type QuantKind = 'forall' | 'exists';

export type Term = { k: 'var'; name: string } | { k: 'cst'; name: string };

export type Formula =
  | { k: 'atom'; name: string }
  | { k: 'const'; value: boolean }
  | { k: 'pred'; name: string; args: Term[] }
  | { k: UnaryKind; a: Formula }
  | { k: QuantKind; v: string; a: Formula }
  | { k: BinaryKind; a: Formula; b: Formula };

export type Valuation = Record<string, boolean>;

export const SYMBOL: Record<BinaryKind | UnaryKind | QuantKind, string> = {
  not: '¬',
  and: '∧',
  or: '∨',
  imp: '→',
  iff: '↔',
  box: '□',
  dia: '◇',
  forall: '∀',
  exists: '∃',
};

export const isVariable = (name: string) => /^[u-z]$/.test(name);
export const term = (name: string): Term => (isVariable(name) ? { k: 'var', name } : { k: 'cst', name });

/** Remplace les saisies ASCII par les symboles logiques (utilisable en direct pendant la frappe). */
export function normalizeInput(s: string): string {
  return s
    .replace(/<->|<=>/g, '↔')
    .replace(/->|=>/g, '→')
    .replace(/\/\\|&/g, '∧')
    .replace(/\\\/|\|/g, '∨')
    .replace(/[~!]/g, '¬')
    .replace(/\[\]/g, '□')
    .replace(/<>/g, '◇')
    .replace(/\\A/g, '∀')
    .replace(/\\E/g, '∃');
}

export class ParseError extends Error {
  constructor(message: string, public pos: number) {
    super(message);
  }
}

type Token =
  | { t: 'atom'; v: string; pos: number }
  | { t: 'pred'; v: string; args: string[]; pos: number }
  | { t: 'quant'; v: QuantKind; x: string; pos: number }
  | { t: 'const'; v: boolean; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: '('; pos: number }
  | { t: ')'; pos: number }
  | { t: 'end'; pos: number };

function tokenize(input: string): Token[] {
  const s = normalizeInput(input);
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(' || c === '[') { out.push({ t: '(', pos: i }); i++; continue; }
    if (c === ')' || c === ']') { out.push({ t: ')', pos: i }); i++; continue; }
    if ('¬∧∨→↔□◇'.includes(c)) { out.push({ t: 'op', v: c, pos: i }); i++; continue; }
    if (c === '⊤') { out.push({ t: 'const', v: true, pos: i }); i++; continue; }
    if (c === '⊥') { out.push({ t: 'const', v: false, pos: i }); i++; continue; }
    if (c === '∀' || c === '∃') {
      let j = i + 1;
      while (j < s.length && s[j] === ' ') j++;
      if (!/[a-z]/.test(s[j] ?? '')) throw new ParseError(`${c} doit être suivi d'une variable, par exemple ${c}x`, i);
      if (!isVariable(s[j])) throw new ParseError(`« ${s[j]} » n'est pas une variable : utilise x, y, z (ou u, v, w)`, j);
      out.push({ t: 'quant', v: c === '∀' ? 'forall' : 'exists', x: s[j], pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Z]/.test(c)) {
      // Prédicat : majuscule suivie de ses arguments (minuscules collées).
      let j = i + 1;
      while (j < s.length && /[a-z]/.test(s[j])) j++;
      if (j > i + 1) out.push({ t: 'pred', v: c, args: s.slice(i + 1, j).split(''), pos: i });
      else out.push({ t: 'atom', v: c, pos: i });
      i = j;
      continue;
    }
    if (/[a-z]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9₀-₉']/.test(s[j])) j++;
      if (j === i + 1 && /[a-z]/.test(s[j] ?? '')) {
        throw new ParseError(`« ${s.slice(i, i + 2)} » : sépare les lettres par un connecteur (ou écris le prédicat en majuscule, ex. F${s[j]})`, i);
      }
      out.push({ t: 'atom', v: s.slice(i, j), pos: i });
      i = j;
      continue;
    }
    throw new ParseError(`Symbole inconnu « ${c} »`, i);
  }
  out.push({ t: 'end', pos: s.length });
  return out;
}

export function parse(input: string): Formula {
  if (!input.trim()) throw new ParseError('La formule est vide', 0);
  const toks = tokenize(input);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = peek(); return t.t === 'op' && t.v === v; };

  function parseIff(): Formula {
    let left = parseImp();
    while (isOp('↔')) { p++; left = { k: 'iff', a: left, b: parseImp() }; }
    return left;
  }
  function parseImp(): Formula {
    const left = parseOr();
    if (isOp('→')) { p++; return { k: 'imp', a: left, b: parseImp() }; }
    return left;
  }
  function parseOr(): Formula {
    let left = parseAnd();
    while (isOp('∨')) { p++; left = { k: 'or', a: left, b: parseAnd() }; }
    return left;
  }
  function parseAnd(): Formula {
    let left = parseUnary();
    while (isOp('∧')) { p++; left = { k: 'and', a: left, b: parseUnary() }; }
    return left;
  }
  function parseUnary(): Formula {
    if (isOp('¬')) { p++; return { k: 'not', a: parseUnary() }; }
    if (isOp('□')) { p++; return { k: 'box', a: parseUnary() }; }
    if (isOp('◇')) { p++; return { k: 'dia', a: parseUnary() }; }
    const t = peek();
    if (t.t === 'quant') { p++; return { k: t.v, v: t.x, a: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary(): Formula {
    const t = peek();
    if (t.t === 'atom') { p++; return { k: 'atom', name: t.v }; }
    if (t.t === 'pred') { p++; return { k: 'pred', name: t.v, args: t.args.map(term) }; }
    if (t.t === 'const') { p++; return { k: 'const', value: t.v }; }
    if (t.t === '(') {
      p++;
      const f = parseIff();
      if (peek().t !== ')') throw new ParseError('Parenthèse fermante manquante', peek().pos);
      p++;
      return f;
    }
    if (t.t === 'end') throw new ParseError('La formule est incomplète', t.pos);
    if (t.t === ')') throw new ParseError('Parenthèse fermante en trop', t.pos);
    throw new ParseError(`« ${(t as { v: string }).v} » est mal placé`, t.pos);
  }

  const f = parseIff();
  const t = peek();
  if (t.t !== 'end') {
    if (t.t === ')') throw new ParseError('Parenthèse fermante en trop', t.pos);
    throw new ParseError('Il manque un connecteur entre deux parties de la formule', t.pos);
  }
  return f;
}

/** Analyse sans lever d'exception. */
export function tryParse(input: string): { ok: true; f: Formula } | { ok: false; error: string } {
  try {
    return { ok: true, f: parse(input) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const PREC: Record<Formula['k'], number> = {
  iff: 1, imp: 2, or: 3, and: 4, not: 5, box: 5, dia: 5, forall: 5, exists: 5, atom: 6, const: 6, pred: 6,
};

/** Affiche une formule ; les sous-formules binaires sont parenthésées, sauf chaînes de ∧ ou de ∨. */
export function show(f: Formula): string {
  switch (f.k) {
    case 'atom': return f.name;
    case 'const': return f.value ? '⊤' : '⊥';
    case 'pred': return f.name + f.args.map((t) => t.name).join('');
    case 'not': case 'box': case 'dia': case 'forall': case 'exists': {
      const inner = show(f.a);
      const head = f.k === 'forall' || f.k === 'exists' ? SYMBOL[f.k] + f.v : SYMBOL[f.k];
      return head + (PREC[f.a.k] < 5 ? `(${inner})` : inner);
    }
    default: {
      const wrap = (g: Formula) => {
        const s = show(g);
        const binary = PREC[g.k] < 5;
        const sameAssoc = g.k === f.k && (f.k === 'and' || f.k === 'or');
        return binary && !sameAssoc ? `(${s})` : s;
      };
      return `${wrap(f.a)} ${SYMBOL[f.k]} ${wrap(f.b)}`;
    }
  }
}

/** Forme canonique d'une saisie (pour l'affichage d'une réponse attendue). */
export function pretty(input: string): string {
  const r = tryParse(input);
  return r.ok ? show(r.f) : input;
}

/** Applique `fn` à chaque sous-formule (parcours préfixe). */
export function walk(f: Formula, fn: (g: Formula) => void): void {
  fn(f);
  switch (f.k) {
    case 'atom': case 'const': case 'pred': return;
    case 'not': case 'box': case 'dia': case 'forall': case 'exists': walk(f.a, fn); return;
    default: walk(f.a, fn); walk(f.b, fn);
  }
}

/** Lettres de proposition (pas les prédicats). */
export function atoms(f: Formula, acc: Set<string> = new Set()): Set<string> {
  walk(f, (g) => { if (g.k === 'atom') acc.add(g.name); });
  return acc;
}

export function sortedAtoms(...fs: Formula[]): string[] {
  const s = new Set<string>();
  fs.forEach((f) => atoms(f, s));
  return [...s].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
}

export function isModal(f: Formula): boolean {
  let m = false;
  walk(f, (g) => { if (g.k === 'box' || g.k === 'dia') m = true; });
  return m;
}

/** Vrai si la formule contient un prédicat ou un quantificateur. */
export function isFirstOrder(f: Formula): boolean {
  let fo = false;
  walk(f, (g) => { if (g.k === 'pred' || g.k === 'forall' || g.k === 'exists') fo = true; });
  return fo;
}

/** Constantes (noms) apparaissant dans la formule. */
export function constants(f: Formula, acc: Set<string> = new Set()): Set<string> {
  walk(f, (g) => { if (g.k === 'pred') g.args.forEach((t) => { if (t.k === 'cst') acc.add(t.name); }); });
  return acc;
}

/** Prédicats et leur arité ; lève une erreur si un prédicat est employé avec deux arités. */
export function predicates(f: Formula, acc: Map<string, number> = new Map()): Map<string, number> {
  walk(f, (g) => {
    if (g.k !== 'pred') return;
    const prev = acc.get(g.name);
    if (prev !== undefined && prev !== g.args.length) {
      throw new Error(`Le prédicat ${g.name} est employé avec ${prev} puis ${g.args.length} argument(s)`);
    }
    acc.set(g.name, g.args.length);
  });
  return acc;
}

/** Variables libres (non liées par un quantificateur). */
export function freeVariables(f: Formula, bound: Set<string> = new Set(), acc: Set<string> = new Set()): Set<string> {
  switch (f.k) {
    case 'atom': case 'const': break;
    case 'pred': f.args.forEach((t) => { if (t.k === 'var' && !bound.has(t.name)) acc.add(t.name); }); break;
    case 'forall': case 'exists': freeVariables(f.a, new Set([...bound, f.v]), acc); break;
    case 'not': case 'box': case 'dia': freeVariables(f.a, bound, acc); break;
    default: freeVariables(f.a, bound, acc); freeVariables(f.b, bound, acc);
  }
  return acc;
}

/** Remplace les occurrences libres de la variable `x` par le nom `c`. */
export function substitute(f: Formula, x: string, c: string): Formula {
  switch (f.k) {
    case 'atom': case 'const': return f;
    case 'pred': return { ...f, args: f.args.map((t) => (t.k === 'var' && t.name === x ? { k: 'cst', name: c } : t)) };
    case 'forall': case 'exists': return f.v === x ? f : { ...f, a: substitute(f.a, x, c) };
    case 'not': case 'box': case 'dia': return { ...f, a: substitute(f.a, x, c) };
    default: return { ...f, a: substitute(f.a, x, c), b: substitute(f.b, x, c) };
  }
}

export function evaluate(f: Formula, v: Valuation): boolean {
  switch (f.k) {
    case 'atom':
      if (!(f.name in v)) throw new Error(`Pas de valeur pour ${f.name}`);
      return v[f.name];
    case 'const': return f.value;
    case 'not': return !evaluate(f.a, v);
    case 'and': return evaluate(f.a, v) && evaluate(f.b, v);
    case 'or': return evaluate(f.a, v) || evaluate(f.b, v);
    case 'imp': return !evaluate(f.a, v) || evaluate(f.b, v);
    case 'iff': return evaluate(f.a, v) === evaluate(f.b, v);
    default:
      throw new Error('Cette formule ne s\'évalue pas avec une simple valuation (prédicats ou modalités)');
  }
}

/** Toutes les valuations, dans l'ordre usuel : première lettre la plus lente, V avant F. */
export function valuations(names: string[]): Valuation[] {
  const n = names.length;
  const rows: Valuation[] = [];
  for (let i = 0; i < 1 << n; i++) {
    const v: Valuation = {};
    names.forEach((name, j) => { v[name] = ((i >> (n - 1 - j)) & 1) === 0; });
    rows.push(v);
  }
  return rows;
}

export type EquivResult =
  | { equivalent: true }
  | { equivalent: false; counter: Valuation; valueA: boolean; valueB: boolean };

/** Équivalence logique exacte (propositionnelle), par examen de toutes les valuations. */
export function equivalent(a: Formula, b: Formula): EquivResult {
  if (isModal(a) || isModal(b) || isFirstOrder(a) || isFirstOrder(b)) {
    throw new Error('Équivalence propositionnelle seulement : utilise semantics.ts');
  }
  const names = sortedAtoms(a, b);
  if (names.length > 14) throw new Error('Trop de lettres de proposition');
  for (const v of valuations(names)) {
    const va = evaluate(a, v);
    const vb = evaluate(b, v);
    if (va !== vb) return { equivalent: false, counter: v, valueA: va, valueB: vb };
  }
  return { equivalent: true };
}

export type Status = 'tautologie' | 'contradiction' | 'contingente';

export function classify(f: Formula): Status {
  const vals = valuations(sortedAtoms(f)).map((v) => evaluate(f, v));
  if (vals.every(Boolean)) return 'tautologie';
  if (vals.every((x) => !x)) return 'contradiction';
  return 'contingente';
}

/** Cherche une valuation rendant toutes les prémisses vraies et la conclusion fausse. */
export function counterexample(premises: Formula[], conclusion: Formula): Valuation | null {
  for (const v of valuations(sortedAtoms(...premises, conclusion))) {
    if (premises.every((p) => evaluate(p, v)) && !evaluate(conclusion, v)) return v;
  }
  return null;
}

/** Connecteurs (et quantificateurs) utilisés dans une formule. */
export function connectives(f: Formula, acc: Set<string> = new Set()): Set<string> {
  walk(f, (g) => {
    if (g.k !== 'atom' && g.k !== 'const' && g.k !== 'pred') acc.add(SYMBOL[g.k]);
  });
  return acc;
}

export function mainConnective(f: Formula): string | null {
  return f.k === 'atom' || f.k === 'const' || f.k === 'pred' ? null : SYMBOL[f.k];
}

export function formatValuation(v: Valuation): string {
  return Object.entries(v).map(([k, b]) => `${k} = ${b ? 'V' : 'F'}`).join(', ');
}
