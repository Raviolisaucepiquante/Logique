// Saisie d'une formule (réponse écrite ou formalisation), corrigée par équivalence logique.
import { checkFormula } from '../../core/check';
import type { FormalizeExercise, FormulaExercise } from '../../core/types';
import { constants, parse, predicates, sortedAtoms } from '../../logic/formula';

/** Touches de lettres : celles de la légende (« Fx » donne F), sinon celles de la réponse. */
export function keyLetters(legend: Record<string, string> | undefined, answer: string): string[] {
  if (legend) return Object.keys(legend).map((k) => (/^[A-Z][a-z]+$/.test(k) ? k[0] : k));
  const f = parse(answer);
  return [...predicates(f).keys(), ...constants(f), ...sortedAtoms(f)];
}
import { formula, h, inlineMarkup } from '../dom';
import { liveNormalize, symbolKeyboard } from '../keyboard';
import type { ExerciseFactory } from './types';

function legendTable(legend: Record<string, string>): HTMLElement {
  return h('dl', { class: 'legend' },
    ...Object.entries(legend).flatMap(([k, v]) => [h('dt', null, formula(k)), h('dd', null, v)]),
  );
}

export const formulaView: ExerciseFactory<FormulaExercise | FormalizeExercise> = (ex, ctx) => {
  const input = h('input', {
    type: 'text',
    class: 'formula-input f',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'Écris ta formule…',
    'aria-label': 'Ta formule',
  });
  liveNormalize(input);
  input.addEventListener('input', () => { msg.textContent = ''; ctx.onChange(); });
  const msg = h('p', { class: 'input-msg', role: 'status' });

  const letters = keyLetters(ex.legend, ex.answer);
  const header = ex.type === 'formalize'
    ? [h('p', { class: 'kicker' }, 'Formalise la phrase'), h('blockquote', { class: 'sentence' }, ex.sentence)]
    : [h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt))];

  const el = h('div', { class: `ex ex-${ex.type}` },
    ...header,
    ex.legend ? legendTable(ex.legend) : null,
    input,
    msg,
    symbolKeyboard(input, ctx.symbols, letters),
  );

  return {
    el,
    ready: () => input.value.trim().length > 0,
    focus: () => input.focus(),
    check: () => {
      const r = checkFormula(ex, input.value);
      if (r.status === 'invalid') {
        msg.textContent = r.message;
        return { kind: 'invalid', message: r.message };
      }
      return {
        kind: 'graded',
        correct: r.status === 'correct',
        solution: formula(ex.answer),
        detail: r.status === 'wrong' ? r.reason : undefined,
      };
    },
    lock: () => {
      input.readOnly = true;
      el.querySelectorAll<HTMLButtonElement>('.key').forEach((b) => { b.disabled = true; });
    },
  };
};
