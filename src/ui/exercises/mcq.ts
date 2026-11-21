import { shuffle } from '../../core/session';
import type { McqExercise } from '../../core/types';
import { formula, h, inlineMarkup } from '../dom';
import type { ExerciseFactory } from './types';

export const mcqView: ExerciseFactory<McqExercise> = (ex, ctx) => {
  let selected: number | null = null;
  let locked = false;
  const order = shuffle(ex.choices.map((_, i) => i));
  const label = (i: number) => (ex.formulas ? formula(ex.choices[i]) : inlineMarkup(ex.choices[i]));

  const buttons = order.map((i, pos) => h('button', {
    type: 'button',
    class: 'choice',
    'data-key': pos + 1,
    onclick: () => select(i),
  }, h('span', { class: 'choice-num' }, pos + 1), label(i)));

  function select(i: number) {
    if (locked) return;
    selected = i;
    buttons.forEach((b, pos) => b.classList.toggle('selected', order[pos] === i));
    ctx.onChange();
  }

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected) { document.removeEventListener('keydown', onKey); return; }
    const n = Number(e.key);
    if (!locked && n >= 1 && n <= order.length) select(order[n - 1]);
  };
  document.addEventListener('keydown', onKey);

  const el = h('div', { class: 'ex ex-mcq' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt)),
    h('div', { class: 'choices' }, ...buttons),
  );

  return {
    el,
    ready: () => selected !== null,
    check: () => ({
      kind: 'graded',
      correct: selected === ex.answer,
      solution: label(ex.answer),
    }),
    lock: () => {
      locked = true;
      document.removeEventListener('keydown', onKey);
      buttons.forEach((b, pos) => {
        b.disabled = true;
        if (order[pos] === ex.answer) b.classList.add('is-answer');
        else if (order[pos] === selected) b.classList.add('is-wrong');
      });
    },
  };
};
