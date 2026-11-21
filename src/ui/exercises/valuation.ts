// Chercher un contre-exemple : une valuation qui rend les prémisses vraies et la conclusion fausse,
// ou déclarer l'argument valide.
import { checkValuation, valuationModel } from '../../core/check';
import type { ValuationExercise } from '../../core/types';
import { formatValuation, type Valuation } from '../../logic/formula';
import { formula, h, inlineMarkup } from '../dom';
import type { ExerciseFactory } from './types';

export const valuationView: ExerciseFactory<ValuationExercise> = (ex, ctx) => {
  const model = valuationModel(ex);
  const v: Partial<Valuation> = {};
  let claimValid = false;
  let locked = false;
  const groups: Record<string, HTMLButtonElement[]> = {};

  const rows = model.atoms.map((a) => {
    groups[a] = [true, false].map((b) => h('button', {
      type: 'button',
      class: 'seg',
      onclick: () => set(a, b),
    }, b ? 'V' : 'F'));
    return h('div', { class: 'val-row' }, formula(a), h('div', { class: 'segmented' }, ...groups[a]));
  });

  const validBtn = h('button', {
    type: 'button',
    class: 'choice valid-claim',
    onclick: () => {
      if (locked) return;
      claimValid = !claimValid;
      validBtn.classList.toggle('selected', claimValid);
      grid.classList.toggle('muted', claimValid);
      ctx.onChange();
    },
  }, 'Aucune : l\'argument est valide');

  function set(a: string, b: boolean) {
    if (locked) return;
    v[a] = b;
    groups[a].forEach((btn, i) => btn.classList.toggle('selected', (i === 0) === b));
    if (claimValid) { claimValid = false; validBtn.classList.remove('selected'); grid.classList.remove('muted'); }
    ctx.onChange();
  }

  const grid = h('div', { class: 'val-grid' }, ...rows);

  const el = h('div', { class: 'ex ex-valuation' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? 'Trouve une valuation qui rend les prémisses vraies et la conclusion fausse.')),
    h('div', { class: 'argument' },
      ...ex.premises.map((p) => h('div', { class: 'premise' }, formula(p))),
      h('div', { class: 'conclusion' }, h('span', { class: 'therefore' }, '∴'), formula(ex.conclusion)),
    ),
    grid,
    validBtn,
  );

  const complete = () => model.atoms.every((a) => v[a] !== undefined);

  return {
    el,
    ready: () => claimValid || complete(),
    check: () => {
      const ref = model.reference;
      const solution = ref ? `Par exemple : ${formatValuation(ref)}` : 'L\'argument est valide : aucun contre-exemple.';
      if (claimValid) {
        return ref
          ? { kind: 'graded', correct: false, solution, detail: 'L\'argument n\'est pas valide : un contre-exemple existe.' }
          : { kind: 'graded', correct: true };
      }
      const r = checkValuation(ex, v as Valuation);
      return { kind: 'graded', correct: r.correct, solution, detail: r.reason };
    },
    lock: () => {
      locked = true;
      el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.disabled = true; });
    },
  };
};
