// Exercices sur les modèles de la logique des prédicats :
// - « modeltruth » : dire si des énoncés sont vrais dans un modèle donné ;
// - « buildmodel » : construire un modèle (domaine, noms, extensions) qui rend certains énoncés vrais et d'autres faux.
import type { BuildModelExercise, ModelTruthExercise } from '../../core/types';
import { parse } from '../../logic/formula';
import { describeModel, evalFO, findModel, modelFromSpec, signatureOf, type FOModel } from '../../logic/semantics';
import { clear, formula, h, icon, inlineMarkup } from '../dom';
import type { ExerciseFactory } from './types';

/** Présentation d'un modèle : domaine, noms, extensions. */
export function modelCard(m: FOModel): HTMLElement {
  const lab = (d: number) => m.labels?.[d] ?? String(d + 1);
  const rows: [string, string][] = [['Domaine', `{${Array.from({ length: m.size }, (_, d) => lab(d)).join(', ')}}`]];
  for (const [c, d] of Object.entries(m.consts)) rows.push([c, `désigne ${lab(d)}`]);
  for (const [p, ext] of Object.entries(m.preds)) {
    const items = [...ext].sort().map((t) => {
      const ds = t.split(',').map((x) => lab(+x));
      return ds.length === 1 ? ds[0] : `⟨${ds.join(', ')}⟩`;
    });
    rows.push([p, `{${items.join(', ')}}`]);
  }
  return h('dl', { class: 'model-card' }, ...rows.flatMap(([k, v]) => [h('dt', null, k === 'Domaine' ? k : formula(k)), h('dd', null, v)]));
}

export const modelTruthView: ExerciseFactory<ModelTruthExercise> = (ex, ctx) => {
  const model = modelFromSpec(ex.model);
  const truth = ex.sentences.map((s) => evalFO(parse(s), model));
  const answers: (boolean | null)[] = ex.sentences.map(() => null);
  const groups: HTMLButtonElement[][] = [];
  const rowEls: HTMLElement[] = [];
  let locked = false;

  const rows = ex.sentences.map((s, i) => {
    groups[i] = [true, false].map((b) => h('button', {
      type: 'button', class: 'seg',
      onclick: () => {
        if (locked) return;
        answers[i] = b;
        groups[i].forEach((x, j) => x.classList.toggle('selected', (j === 0) === b));
        ctx.onChange();
      },
    }, b ? 'V' : 'F'));
    const row = h('div', { class: 'mt-row' }, formula(s), h('div', { class: 'segmented' }, ...groups[i]));
    rowEls.push(row);
    return row;
  });

  const el = h('div', { class: 'ex ex-modeltruth' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? 'Dans ce modèle, chaque énoncé est-il vrai ou faux ?')),
    modelCard(model),
    h('div', { class: 'mt-list' }, ...rows),
  );

  return {
    el,
    ready: () => answers.every((a) => a !== null),
    check: () => {
      const wrong = truth.filter((t, i) => answers[i] !== t).length;
      return wrong
        ? { kind: 'graded', correct: false, detail: `${wrong} réponse${wrong > 1 ? 's' : ''} fausse${wrong > 1 ? 's' : ''}, corrigée${wrong > 1 ? 's' : ''} ci-dessus.` }
        : { kind: 'graded', correct: true };
    },
    lock: () => {
      locked = true;
      truth.forEach((t, i) => {
        groups[i].forEach((b) => { b.disabled = true; });
        rowEls[i].classList.add(answers[i] === t ? 'ok' : 'bad');
        if (answers[i] !== t) groups[i].forEach((b, j) => b.classList.toggle('selected', (j === 0) === t));
      });
    },
  };
};

export const buildModelView: ExerciseFactory<BuildModelExercise> = (ex, ctx) => {
  const trues = ex.true.map(parse);
  const falses = ex.false.map(parse);
  const sig = signatureOf(...trues, ...falses);
  const maxSize = ex.maxSize ?? 3;
  let locked = false;

  // État du modèle en construction.
  let size = 2;
  const consts: Record<string, number> = Object.fromEntries(sig.consts.map((c) => [c, 0]));
  const preds: Record<string, Set<string>> = Object.fromEntries([...sig.preds.keys()].map((p) => [p, new Set<string>()]));
  const props: Record<string, boolean> = Object.fromEntries(sig.props.map((p) => [p, false]));
  let touched = false;

  const current = (): FOModel => {
    // On ignore les n-uplets qui sortent du domaine après une réduction de taille.
    const inDomain = (t: string) => t.split(',').every((x) => +x < size);
    return {
      size,
      consts: Object.fromEntries(Object.entries(consts).map(([c, d]) => [c, Math.min(d, size - 1)])),
      preds: Object.fromEntries(Object.entries(preds).map(([p, s]) => [p, new Set([...s].filter(inDomain))])),
      props: { ...props },
    };
  };

  const editor = h('div', { class: 'bm-editor' });
  const status = h('div', { class: 'bm-status' });

  function chip(label: string, on: boolean, onclick: () => void, title?: string) {
    return h('button', { type: 'button', class: `chip ${on ? 'on' : ''}`, title, onclick: () => { if (!locked) { touched = true; onclick(); render(); } } }, label);
  }

  function render() {
    clear(editor);
    const elems = Array.from({ length: size }, (_, d) => d);
    editor.append(h('div', { class: 'bm-row' },
      h('span', { class: 'bm-label' }, 'Domaine'),
      h('div', { class: 'chips' }, ...Array.from({ length: maxSize }, (_, i) => chip(`${i + 1} élément${i ? 's' : ''}`, size === i + 1, () => { size = i + 1; }))),
    ));
    for (const c of sig.consts) {
      editor.append(h('div', { class: 'bm-row' },
        h('span', { class: 'bm-label' }, formula(c), ' désigne'),
        h('div', { class: 'chips' }, ...elems.map((d) => chip(String(d + 1), Math.min(consts[c], size - 1) === d, () => { consts[c] = d; }))),
      ));
    }
    for (const [p, ar] of sig.preds) {
      const ext = preds[p];
      const toggle = (t: string) => () => { if (ext.has(t)) ext.delete(t); else ext.add(t); };
      if (ar === 1) {
        editor.append(h('div', { class: 'bm-row' },
          h('span', { class: 'bm-label' }, formula(p), ' est vrai de'),
          h('div', { class: 'chips' }, ...elems.map((d) => chip(String(d + 1), ext.has(String(d)), toggle(String(d))))),
        ));
      } else if (ar === 2) {
        editor.append(h('div', { class: 'bm-row bm-rel' },
          h('span', { class: 'bm-label' }, formula(p), ' : coche ⟨ligne, colonne⟩'),
          h('table', { class: 'rel-grid' },
            h('tr', null, h('th', null, ''), ...elems.map((d) => h('th', null, d + 1))),
            ...elems.map((x) => h('tr', null, h('th', null, x + 1), ...elems.map((y) => {
              const t = `${x},${y}`;
              return h('td', null, chip(ext.has(t) ? '✓' : '', ext.has(t), toggle(t), `⟨${x + 1}, ${y + 1}⟩`));
            }))),
          ),
        ));
      }
    }
    for (const p of sig.props) {
      editor.append(h('div', { class: 'bm-row' },
        h('span', { class: 'bm-label' }, formula(p)),
        h('div', { class: 'chips' }, chip('V', props[p], () => { props[p] = true; }), chip('F', !props[p], () => { props[p] = false; })),
      ));
    }
    renderStatus();
    ctx.onChange();
  }

  /** Retour immédiat : l'état de chaque énoncé dans le modèle en cours. */
  function renderStatus() {
    clear(status);
    const m = current();
    const item = (f: string, want: boolean) => {
      const val = evalFO(parse(f), m);
      const good = val === want;
      return h('li', { class: good ? 'ok' : 'bad' }, icon(good ? 'check' : 'close'), formula(f), h('span', { class: 'bm-want' }, want ? 'doit être vrai' : 'doit être faux'));
    };
    status.append(h('ul', null, ...ex.true.map((f) => item(f, true)), ...ex.false.map((f) => item(f, false))));
  }

  const el = h('div', { class: 'ex ex-buildmodel' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? 'Construis un modèle qui rend vrais et faux les énoncés indiqués.')),
    status,
    editor,
  );
  render();

  const ok = () => {
    const m = current();
    return trues.every((f) => evalFO(f, m)) && falses.every((f) => !evalFO(f, m));
  };

  return {
    el,
    ready: () => touched,
    check: () => {
      if (ok()) return { kind: 'graded', correct: true };
      const sol = findModel(trues, falses, maxSize);
      return {
        kind: 'graded',
        correct: false,
        detail: 'Au moins un énoncé n\'a pas la valeur demandée dans ton modèle (voir les croix).',
        solution: sol ? `par exemple ${describeModel(sol)}` : undefined,
      };
    },
    lock: () => {
      locked = true;
      el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.disabled = true; });
    },
  };
};
