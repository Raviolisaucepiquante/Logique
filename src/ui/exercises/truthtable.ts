// Table de vérité à remplir case par case (clic : vide → V → F → V…).
import { checkTruthTable, truthTableModel } from '../../core/check';
import type { TruthTableExercise } from '../../core/types';
import { formula, h, inlineMarkup } from '../dom';
import type { ExerciseFactory } from './types';

const tv = (b: boolean) => (b ? 'V' : 'F');

export const truthTableView: ExerciseFactory<TruthTableExercise> = (ex, ctx) => {
  const model = truthTableModel(ex);
  const answers: (boolean | null)[][] = model.rows.map(() => model.columns.map(() => null));
  const cells: HTMLButtonElement[][] = [];
  let locked = false;

  const thead = h('thead', null, h('tr', null,
    ...model.atoms.map((a) => h('th', { class: 'atom' }, formula(a))),
    ...model.columns.map((c) => h('th', null, formula(c))),
  ));

  const tbody = h('tbody', null, ...model.rows.map((row, i) => {
    cells[i] = model.columns.map((_, j) => h('button', {
      type: 'button',
      class: 'cell',
      'aria-label': `Ligne ${i + 1}, colonne ${model.columns[j]}`,
      onclick: () => toggle(i, j),
    }, ''));
    return h('tr', null,
      ...model.atoms.map((a) => h('td', { class: 'atom' }, tv(row[a]))),
      ...cells[i].map((c) => h('td', null, c)),
    );
  }));

  function toggle(i: number, j: number) {
    if (locked) return;
    const v = answers[i][j];
    answers[i][j] = v === null ? true : !v;
    const c = cells[i][j];
    c.textContent = tv(answers[i][j]!);
    c.classList.add('filled');
    c.classList.remove('pop');
    void c.offsetWidth; // relance l'animation
    c.classList.add('pop');
    ctx.onChange();
  }

  const el = h('div', { class: 'ex ex-truthtable' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? `Complète la table de vérité de \`${ex.formula}\`.`)),
    h('p', { class: 'hint' }, 'Touche une case pour alterner entre V et F.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'truth' }, thead, tbody)),
  );

  return {
    el,
    ready: () => answers.every((r) => r.every((v) => v !== null)),
    check: () => {
      const wrong = checkTruthTable(model, answers);
      if (!wrong.length) return { kind: 'graded', correct: true };
      return {
        kind: 'graded',
        correct: false,
        detail: `${wrong.length} case${wrong.length > 1 ? 's' : ''} fausse${wrong.length > 1 ? 's' : ''}, corrigée${wrong.length > 1 ? 's' : ''} dans la table.`,
      };
    },
    lock: () => {
      locked = true;
      model.values.forEach((row, i) => row.forEach((val, j) => {
        const c = cells[i][j];
        c.disabled = true;
        if (answers[i][j] === val) c.classList.add('ok');
        else { c.classList.add('bad'); c.textContent = tv(val); c.title = 'Valeur correcte'; }
      }));
    },
  };
};
