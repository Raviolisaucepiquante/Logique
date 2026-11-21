// Correction des réponses, indépendante de l'interface (donc testable).
import {
  connectives, constants, counterexample, evaluate, freeVariables, isFirstOrder, parse, predicates, show,
  sortedAtoms, tryParse, valuations, type Formula, type Valuation,
} from '../logic/formula';
import { generalEquivalent, isSentence } from '../logic/semantics';
import type { FormulaExercise, FormalizeExercise, TruthTableExercise, ValuationExercise } from './types';

/** Vrai si chaque ¬ s'applique directement à une lettre ou à une constante. */
export function negationOnAtoms(f: Formula): boolean {
  switch (f.k) {
    case 'atom': case 'const': case 'pred': return true;
    case 'not': return f.a.k === 'atom' || f.a.k === 'const' || f.a.k === 'pred';
    case 'box': case 'dia': case 'forall': case 'exists': return negationOnAtoms(f.a);
    default: return negationOnAtoms(f.a) && negationOnAtoms(f.b);
  }
}

export type FormulaCheck =
  | { status: 'invalid'; message: string }
  | { status: 'correct' }
  | { status: 'wrong'; reason: string };

/** Corrige une formule par équivalence logique avec la réponse de référence. */
export function checkFormula(ex: FormulaExercise | FormalizeExercise, input: string): FormulaCheck {
  const r = tryParse(input);
  if (!r.ok) return { status: 'invalid', message: r.error };
  const expected = parse(ex.answer);

  const symbolError = checkSymbols(r.f, ex.legend);
  if (symbolError) return { status: 'invalid', message: symbolError };
  if (isFirstOrder(expected) && !isSentence(r.f)) {
    const free = [...freeVariables(r.f)].join(', ');
    return { status: 'invalid', message: `Variable libre : ${free}. Chaque variable doit être liée par un quantificateur (∀${free[0]} ou ∃${free[0]}).` };
  }

  if (ex.type === 'formula' && ex.forbid?.length) {
    const used = connectives(r.f);
    const bad = ex.forbid.filter((c) => used.has(c));
    if (bad.length) return { status: 'wrong', reason: `La consigne interdit ${bad.join(' et ')}.` };
  }
  if (ex.type === 'formula' && ex.require?.length) {
    const used = connectives(r.f);
    const missing = ex.require.filter((c) => !used.has(c));
    if (missing.length) return { status: 'wrong', reason: `La consigne demande d'utiliser ${missing.join(' et ')}.` };
  }
  if (ex.type === 'formula' && ex.negationOnAtoms && !negationOnAtoms(r.f)) {
    return { status: 'wrong', reason: 'La consigne demande que ¬ ne porte que sur des lettres, jamais sur une parenthèse.' };
  }

  const eq = generalEquivalent(r.f, expected);
  if (eq.equivalent) return { status: 'correct' };
  return {
    status: 'wrong',
    reason: `Dans ${eq.where}, ta formule est ${eq.valueA ? 'vraie' : 'fausse'} alors qu'elle devrait être ${eq.valueB ? 'vraie' : 'fausse'}.`,
  };
}

/**
 * Vérifie que la formule n'emploie que les symboles de la légende. Clés de légende :
 * « p » (proposition), « a » (nom), « Fx » ou « Rxy » (prédicat, avec son arité).
 */
export function checkSymbols(f: Formula, legend?: Record<string, string>): string | null {
  let preds: Map<string, number>;
  try { preds = predicates(f); } catch (e) { return (e as Error).message; }
  if (!legend) return null;
  const allowedPreds = new Map<string, number>();
  const allowedNames = new Set<string>();
  for (const key of Object.keys(legend)) {
    if (/^[A-Z][a-z]+$/.test(key)) allowedPreds.set(key[0], key.length - 1);
    else allowedNames.add(key);
  }
  const unknown = [...sortedAtoms(f), ...constants(f)].filter((a) => !allowedNames.has(a));
  for (const [p, ar] of preds) {
    if (!allowedPreds.has(p)) unknown.push(p);
    else if (allowedPreds.get(p) !== ar) return `${p} prend ${allowedPreds.get(p)} argument(s), pas ${ar}.`;
  }
  if (!unknown.length) return null;
  const list = Object.keys(legend).map((k) => (/^[A-Z]/.test(k) ? k[0] : k)).join(', ');
  return `Symbole${unknown.length > 1 ? 's' : ''} inconnu${unknown.length > 1 ? 's' : ''} : ${[...new Set(unknown)].join(', ')}. Utilise ${list}.`;
}

export interface TruthTableModel {
  atoms: string[];
  columns: string[];
  rows: Valuation[];
  /** values[ligne][colonne] */
  values: boolean[][];
}

export function truthTableModel(ex: TruthTableExercise): TruthTableModel {
  const main = parse(ex.formula);
  const cols = (ex.columns?.length ? ex.columns : [ex.formula]).map((c) => parse(c));
  const atomNames = sortedAtoms(main, ...cols);
  const rows = valuations(atomNames);
  return {
    atoms: atomNames,
    columns: cols.map(show),
    rows,
    values: rows.map((v) => cols.map((c) => evaluate(c, v))),
  };
}

/** Renvoie la liste des cases fausses (ligne, colonne) ; une case vide compte comme fausse. */
export function checkTruthTable(model: TruthTableModel, answers: (boolean | null)[][]): [number, number][] {
  const wrong: [number, number][] = [];
  model.values.forEach((row, i) => row.forEach((val, j) => {
    if (answers[i]?.[j] !== val) wrong.push([i, j]);
  }));
  return wrong;
}

export interface ValuationModel {
  atoms: string[];
  /** Contre-exemple de référence, ou null si l'argument est valide. */
  reference: Valuation | null;
}

export function valuationModel(ex: ValuationExercise): ValuationModel {
  const ps = ex.premises.map(parse);
  const c = parse(ex.conclusion);
  return { atoms: sortedAtoms(...ps, c), reference: counterexample(ps, c) };
}

/** Vérifie qu'une valuation proposée rend les prémisses vraies et la conclusion fausse. */
export function checkValuation(ex: ValuationExercise, v: Valuation): { correct: boolean; reason?: string } {
  const falsePremise = ex.premises.find((p) => !evaluate(parse(p), v));
  if (falsePremise) return { correct: false, reason: `Avec cette valuation, la prémisse ${show(parse(falsePremise))} est fausse.` };
  if (evaluate(parse(ex.conclusion), v)) return { correct: false, reason: `Avec cette valuation, la conclusion ${show(parse(ex.conclusion))} est vraie.` };
  return { correct: true };
}
