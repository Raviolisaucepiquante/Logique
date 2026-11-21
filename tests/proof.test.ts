import { describe, expect, it } from 'vitest';
import { checkLines, checkProof, parseCites, type ProofLine, type RuleId } from '../src/logic/proof';

/** Petite notation : [profondeur, formule, règle, citations] */
type Row = [number, string, RuleId | '', string?];
const proof = (rows: Row[]): ProofLine[] => rows.map(([depth, formula, rule, cites]) => ({ depth, formula, rule, cites: cites ?? '' }));
const statuses = (rows: Row[]) => checkLines(proof(rows)).map((s) => s.status);

describe('citations', () => {
  it('lit lignes et intervalles', () => {
    expect(parseCites('1, 3-5')).toEqual([{ kind: 'line', n: 1 }, { kind: 'sub', from: 3, to: 5 }]);
    expect(parseCites('2–4')).toEqual([{ kind: 'sub', from: 2, to: 4 }]);
    expect(parseCites('a')).toBeNull();
  });
});

describe('règles de base', () => {
  it('modus ponens', () => {
    const p = proof([[0, 'p → q', 'Prém'], [0, 'p', 'Prém'], [0, 'q', '→E', '1, 2']]);
    expect(checkProof(p, 'q')).toEqual({ complete: true });
  });
  it('refuse une mauvaise application', () => {
    const p = proof([[0, 'p → q', 'Prém'], [0, 'q', 'Prém'], [0, 'p', '→E', '1, 2']]);
    expect(checkProof(p, 'p').complete).toBe(false);
  });
  it('∧I et ∧E', () => {
    expect(statuses([[0, 'p ∧ q', 'Prém'], [0, 'q', '∧E', '1'], [0, 'p', '∧E', '1'], [0, 'q ∧ p', '∧I', '2, 3']])).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(statuses([[0, 'p ∧ q', 'Prém'], [0, 'r', '∧E', '1']])).toEqual(['ok', 'error']);
  });
  it('vérifie le nombre de citations', () => {
    expect(statuses([[0, 'p', 'Prém'], [0, 'q', 'Prém'], [0, 'p ∧ q', '∧I', '1']])[2]).toBe('error');
  });
});

describe('sous-preuves', () => {
  it('→I et syllogisme hypothétique', () => {
    const p = proof([
      [0, 'p → q', 'Prém'],
      [0, 'q → r', 'Prém'],
      [1, 'p', 'Hyp'],
      [1, 'q', '→E', '1, 3'],
      [1, 'r', '→E', '2, 4'],
      [0, 'p → r', '→I', '3-5'],
    ]);
    expect(checkProof(p, 'p → r')).toEqual({ complete: true });
  });
  it('interdit de citer une ligne d\'une sous-preuve fermée', () => {
    const s = statuses([
      [0, 'q', 'Prém'],
      [1, 'p', 'Hyp'],
      [1, 'q', 'R', '1'],
      [0, 'p → q', '→I', '2-3'],
      [0, 'p', 'R', '2'],
    ]);
    expect(s).toEqual(['ok', 'ok', 'ok', 'ok', 'error']);
  });
  it('interdit de citer une sous-preuve encore ouverte', () => {
    const s = statuses([[1, 'p', 'Hyp'], [1, 'p → p', '→I', '1-1']]);
    expect(s[1]).toBe('error');
  });
  it('∨E avec deux sous-preuves voisines', () => {
    const p = proof([
      [0, 'p ∨ q', 'Prém'],
      [1, 'p', 'Hyp'],
      [1, 'q ∨ p', '∨I', '2'],
      [1, 'q', 'Hyp'],
      [1, 'q ∨ p', '∨I', '4'],
      [0, 'q ∨ p', '∨E', '1, 2-3, 4-5'],
    ]);
    expect(checkProof(p, 'q ∨ p')).toEqual({ complete: true });
  });
  it('refuse une conclusion restée dans une sous-preuve', () => {
    const p = proof([[1, 'p', 'Hyp'], [1, 'p', 'R', '1']]);
    expect(checkProof(p, 'p').complete).toBe(false);
  });
});

describe('négation', () => {
  it('¬I, ¬E et RA', () => {
    const p = proof([
      [0, '¬¬p', 'Prém'],
      [1, '¬p', 'Hyp'],
      [1, '⊥', '¬E', '2, 1'],
      [0, 'p', 'RA', '2-3'],
    ]);
    expect(checkProof(p, 'p')).toEqual({ complete: true });
    const q = proof([
      [0, 'p', 'Prém'],
      [1, '¬p', 'Hyp'],
      [1, '⊥', '¬E', '1, 2'],
      [0, '¬¬p', '¬I', '2-3'],
    ]);
    expect(checkProof(q, '¬¬p')).toEqual({ complete: true });
  });
  it('règles dérivées', () => {
    expect(statuses([[0, 'p → q', 'Prém'], [0, '¬q', 'Prém'], [0, '¬p', 'MT', '1, 2']])).toEqual(['ok', 'ok', 'ok']);
    expect(statuses([[0, 'p ∨ q', 'Prém'], [0, '¬q', 'Prém'], [0, 'p', 'DS', '1, 2']])).toEqual(['ok', 'ok', 'ok']);
    expect(statuses([[0, '⊥', 'Prém'], [0, 'r', 'X', '1']])).toEqual(['ok', 'ok']);
  });
});

describe('quantificateurs', () => {
  it('∀E puis →E', () => {
    const p = proof([[0, '∀x(Fx → Gx)', 'Prém'], [0, 'Fa', 'Prém'], [0, 'Fa → Ga', '∀E', '1'], [0, 'Ga', '→E', '3, 2']]);
    expect(checkProof(p, 'Ga')).toEqual({ complete: true });
  });
  it('∀E refuse un remplacement incohérent', () => {
    expect(statuses([[0, '∀x Rxx', 'Prém'], [0, 'Rab', '∀E', '1']])[1]).toBe('error');
  });
  it('∃I peut ne remplacer qu\'une partie des occurrences', () => {
    expect(statuses([[0, 'Raa', 'Prém'], [0, '∃x Rxa', '∃I', '1']])).toEqual(['ok', 'ok']);
  });
  it('∀I exige un nom arbitraire', () => {
    const ok = proof([[0, '∀x(Fx ∧ Gx)', 'Prém'], [0, 'Fa ∧ Ga', '∀E', '1'], [0, 'Fa', '∧E', '2'], [0, '∀x Fx', '∀I', '3']]);
    expect(checkProof(ok, '∀x Fx')).toEqual({ complete: true });
    expect(statuses([[0, 'Fa', 'Prém'], [0, '∀x Fx', '∀I', '1']])[1]).toBe('error');
  });
  it('∃E exige un nom nouveau', () => {
    const ok = proof([
      [0, '∃x Fx', 'Prém'],
      [0, '∀x(Fx → Gx)', 'Prém'],
      [1, 'Fa', 'Hyp'],
      [1, 'Fa → Ga', '∀E', '2'],
      [1, 'Ga', '→E', '4, 3'],
      [1, '∃x Gx', '∃I', '5'],
      [0, '∃x Gx', '∃E', '1, 3-6'],
    ]);
    expect(checkProof(ok, '∃x Gx')).toEqual({ complete: true });
    const bad = statuses([[0, '∃x Fx', 'Prém'], [0, 'Ga', 'Prém'], [1, 'Fa', 'Hyp'], [1, 'Fa ∧ Ga', '∧I', '3, 2'], [1, '∃x(Fx ∧ Gx)', '∃I', '4'], [0, '∃x(Fx ∧ Gx)', '∃E', '1, 3-5']]);
    expect(bad[5]).toBe('error');
  });
  it('conversion des quantificateurs', () => {
    expect(statuses([[0, '¬∀x Fx', 'Prém'], [0, '∃x¬Fx', 'CQ', '1']])).toEqual(['ok', 'ok']);
    expect(statuses([[0, '∀x¬Fx', 'Prém'], [0, '¬∃x Fx', 'CQ', '1']])).toEqual(['ok', 'ok']);
    expect(statuses([[0, '∀x Fx', 'Prém'], [0, '∃x Fx', 'CQ', '1']])[1]).toBe('error');
  });
});
