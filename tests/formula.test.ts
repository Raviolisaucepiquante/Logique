import { describe, expect, it } from 'vitest';
import { classify, counterexample, equivalent, normalizeInput, parse, show, tryParse } from '../src/logic/formula';

const eq = (a: string, b: string) => equivalent(parse(a), parse(b)).equivalent;

describe('analyse syntaxique', () => {
  it('accepte les symboles et l\'ASCII', () => {
    expect(show(parse('p -> q'))).toBe('p → q');
    expect(show(parse('~(p & q) <-> (!p | ~q)'))).toBe('¬(p ∧ q) ↔ (¬p ∨ ¬q)');
    expect(normalizeInput('p <=> q')).toBe('p ↔ q');
  });
  it('respecte les priorités usuelles', () => {
    expect(show(parse('¬p ∧ q ∨ r'))).toBe('(¬p ∧ q) ∨ r');
    expect(show(parse('p → q → r'))).toBe('p → (q → r)');
    expect(show(parse('p ∧ q ∧ r'))).toBe('p ∧ q ∧ r');
  });
  it('signale les erreurs en français', () => {
    expect(tryParse('p ∧')).toEqual({ ok: false, error: 'La formule est incomplète' });
    expect(tryParse('(p ∧ q')).toMatchObject({ ok: false });
    expect(tryParse('p q')).toMatchObject({ ok: false });
    expect(tryParse('p ∧ q)')).toMatchObject({ ok: false });
    expect(tryParse('')).toMatchObject({ ok: false });
  });
  it('lit les opérateurs modaux', () => {
    expect(show(parse('[]p -> <>p'))).toBe('□p → ◇p');
  });
});

describe('sémantique', () => {
  it('De Morgan et équivalences classiques', () => {
    expect(eq('¬(p ∧ q)', '¬p ∨ ¬q')).toBe(true);
    expect(eq('¬(p ∨ q)', '¬p ∧ ¬q')).toBe(true);
    expect(eq('p → q', '¬q → ¬p')).toBe(true);
    expect(eq('p → q', '¬p ∨ q')).toBe(true);
    expect(eq('p → q', 'q → p')).toBe(false);
    expect(eq('p ∧ (q ∨ r)', '(p ∧ q) ∨ (p ∧ r)')).toBe(true);
  });
  it('compare des formules sur des lettres différentes', () => {
    expect(eq('p', 'p ∧ (q ∨ ¬q)')).toBe(true);
    expect(eq('p', 'q')).toBe(false);
  });
  it('donne un contre-exemple', () => {
    const r = equivalent(parse('p → q'), parse('q → p'));
    expect(r.equivalent).toBe(false);
  });
  it('classe les formules', () => {
    expect(classify(parse('p ∨ ¬p'))).toBe('tautologie');
    expect(classify(parse('p ∧ ¬p'))).toBe('contradiction');
    expect(classify(parse('p → q'))).toBe('contingente');
  });
  it('trouve les contre-exemples d\'arguments', () => {
    expect(counterexample([parse('p → q'), parse('q')], parse('p'))).toEqual({ p: false, q: true });
    expect(counterexample([parse('p → q'), parse('p')], parse('q'))).toBeNull();
  });
});

import { findModel, generalEquivalent, evalFO, modelFromSpec } from '../src/logic/semantics';
import { freeVariables } from '../src/logic/formula';

describe('logique des prédicats', () => {
  const geq = (a: string, b: string) => generalEquivalent(parse(a), parse(b)).equivalent;
  it('analyse prédicats et quantificateurs', () => {
    expect(show(parse('∀x(Fx → Gx)'))).toBe('∀x(Fx → Gx)');
    expect(show(parse('∀x∃y Rxy'))).toBe('∀x∃yRxy');
    expect(show(parse('¬∃x Fx ∧ Ga'))).toBe('¬∃xFx ∧ Ga');
    expect([...freeVariables(parse('∀x Rxy'))]).toEqual(['y']);
    expect(tryParse('∀a Fa')).toMatchObject({ ok: false });
  });
  it('équivalences classiques', () => {
    expect(geq('¬∀x Fx', '∃x ¬Fx')).toBe(true);
    expect(geq('¬∃x Fx', '∀x ¬Fx')).toBe(true);
    expect(geq('∀x(Fx ∧ Gx)', '∀x Fx ∧ ∀x Gx')).toBe(true);
    expect(geq('∃x(Fx ∧ Gx)', '∃x Fx ∧ ∃x Gx')).toBe(false);
    expect(geq('∀x(Fx → Gx)', '∀y(Fy → Gy)')).toBe(true);
    expect(geq('∀x(Fx → Gx)', '∀x(Fx ∧ Gx)')).toBe(false);
    expect(geq('∀x∃y Rxy', '∃y∀x Rxy')).toBe(false);
  });
  it('évalue dans un modèle donné', () => {
    const m = modelFromSpec({ domain: ['1', '2'], constants: { a: '1' }, predicates: { F: ['1'], R: [['1', '2'], ['2', '2']] } });
    expect(evalFO(parse('Fa'), m)).toBe(true);
    expect(evalFO(parse('∀x Fx'), m)).toBe(false);
    expect(evalFO(parse('∀x∃y Rxy'), m)).toBe(true);
    expect(evalFO(parse('∃x Rxa'), m)).toBe(false);
  });
  it('trouve des contre-modèles', () => {
    expect(findModel([parse('∃x Fx'), parse('∃x Gx')], [parse('∃x(Fx ∧ Gx)')])).not.toBeNull();
    expect(findModel([parse('∀x(Fx → Gx)'), parse('Fa')], [parse('Ga')])).toBeNull();
  });
});

import { evalK, kripkeFromSpec, validityCounter } from '../src/logic/modal';

describe('logique modale', () => {
  const geq = (a: string, b: string) => generalEquivalent(parse(a), parse(b)).equivalent;
  it('dualité de □ et ◇', () => {
    expect(geq('◇p', '¬□¬p')).toBe(true);
    expect(geq('□p', '¬◇¬p')).toBe(true);
    expect(geq('□(p ∧ q)', '□p ∧ □q')).toBe(true);
    expect(geq('◇(p ∧ q)', '◇p ∧ ◇q')).toBe(false);
    expect(geq('□p', 'p')).toBe(false);
  });
  it('évalue dans un modèle donné', () => {
    const m = kripkeFromSpec({ worlds: ['w1', 'w2', 'w3'], access: [['w1', 'w2'], ['w1', 'w3'], ['w2', 'w2']], valuation: { w1: [], w2: ['p'], w3: ['p', 'q'] } });
    expect(evalK(parse('□p'), m, 0)).toBe(true);
    expect(evalK(parse('◇q'), m, 0)).toBe(true);
    expect(evalK(parse('□q'), m, 0)).toBe(false);
    expect(evalK(parse('□p'), m, 2)).toBe(true); // w3 ne voit rien : □ est vrai « à vide »
    expect(evalK(parse('◇p'), m, 2)).toBe(false);
  });
  it('axiomes et systèmes', () => {
    const valid = (f: string, s: 'K' | 'D' | 'T' | 'B' | 'S4' | 'S5') => validityCounter(parse(f), s) === null;
    expect(valid('□(p → q) → (□p → □q)', 'K')).toBe(true);   // K
    expect(valid('□p → p', 'K')).toBe(false);
    expect(valid('□p → p', 'T')).toBe(true);                  // T
    expect(valid('□p → ◇p', 'D')).toBe(true);                 // D
    expect(valid('□p → □□p', 'T')).toBe(false);
    expect(valid('□p → □□p', 'S4')).toBe(true);               // 4
    expect(valid('◇p → □◇p', 'S4')).toBe(false);
    expect(valid('◇p → □◇p', 'S5')).toBe(true);               // 5
    expect(valid('p → □◇p', 'B')).toBe(true);                 // B
    expect(valid('p → □◇p', 'S4')).toBe(false);
  });
});
