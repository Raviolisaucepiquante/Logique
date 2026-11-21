// Logique modale : graphe d'un modèle de Kripke, et deux exercices :
// - « kripketruth » : vrai ou faux à un monde donné ;
// - « kripkebuild » : construire un modèle (contre-modèle), éventuellement dans un système (T, S4, S5…).
import type { KripkeBuildExercise, KripkeTruthExercise } from '../../core/types';
import { parse, sortedAtoms } from '../../logic/formula';
import {
  describeKripke, evalK, findKripke, kripkeFromSpec, propertyFailure, PROPERTY_NAMES, SYSTEM_FRAMES,
  worldLabel, type KModel,
} from '../../logic/modal';
import { clear, formula, h, icon, inlineMarkup } from '../dom';
import type { ExerciseFactory } from './types';

const SVG = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...kids: (SVGElement | string)[]) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  kids.forEach((c) => el.append(c));
  return el;
}

let markerSeq = 0;

/** Dessine les mondes (cercles), l'accessibilité (flèches) et les lettres vraies sous chaque monde. */
export function kripkeGraph(m: KModel, highlight = 0): SVGSVGElement {
  const W = 320;
  const H = m.n <= 2 ? 170 : 260;
  const r = 26;
  // Marges suffisantes pour les boucles (au-dessus des mondes du haut, au-dessous de ceux du bas).
  const pos: [number, number][] = m.n === 1 ? [[W / 2, 85]]
    : m.n === 2 ? [[80, 85], [240, 85]]
      : m.n === 3 ? [[W / 2, 68], [70, 192], [250, 192]]
        : [[80, 68], [240, 68], [240, 192], [80, 192]];
  const id = `arrow${++markerSeq}`;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kripke-graph', role: 'img', 'aria-label': describeKripke(m) });
  svg.append(s('defs', {}, s('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'kg-head' }))));

  for (let i = 0; i < m.n; i++) {
    for (let j = 0; j < m.n; j++) {
      if (!m.R[i][j]) continue;
      const [x1, y1] = pos[i];
      if (i === j) {
        // Boucle au-dessus (ou au-dessous pour les mondes du bas).
        const up = y1 < H / 2 ? -1 : 1;
        const sy = y1 + up * r * 0.6;
        svg.append(s('path', { d: `M${x1 - 10},${sy} C${x1 - 30},${y1 + up * 62} ${x1 + 30},${y1 + up * 62} ${x1 + 10},${sy}`, class: 'kg-edge', 'marker-end': `url(#${id})` }));
        continue;
      }
      const [x2, y2] = pos[j];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      // Flèches dans les deux sens : on les écarte un peu l'une de l'autre.
      const off = m.R[j][i] ? 7 : 0;
      const ox = -uy * off;
      const oy = ux * off;
      svg.append(s('line', {
        x1: x1 + ux * r + ox, y1: y1 + uy * r + oy, x2: x2 - ux * (r + 2) + ox, y2: y2 - uy * (r + 2) + oy,
        class: 'kg-edge', 'marker-end': `url(#${id})`,
      }));
    }
  }
  for (let i = 0; i < m.n; i++) {
    const [x, y] = pos[i];
    const trues = Object.keys(m.val).filter((p) => m.val[p][i]).sort();
    // Nom du monde en haut du cercle, lettres vraies en dessous, à l'intérieur : rien ne chevauche les flèches.
    svg.append(
      s('circle', { cx: x, cy: y, r, class: `kg-node ${i === highlight ? 'kg-current' : ''}` }),
      s('text', { x, y: y - 3, class: 'kg-label', 'text-anchor': 'middle' }, worldLabel(m, i)),
      s('text', { x, y: y + 13, class: 'kg-val', 'text-anchor': 'middle' }, trues.length ? trues.join(',') : '∅'),
    );
  }
  return svg;
}

export const kripkeTruthView: ExerciseFactory<KripkeTruthExercise> = (ex, ctx) => {
  const model = kripkeFromSpec(ex.model);
  const w = ex.model.worlds.indexOf(ex.world);
  const truth = ex.sentences.map((f) => evalK(parse(f), model, w));
  const answers: (boolean | null)[] = ex.sentences.map(() => null);
  const groups: HTMLButtonElement[][] = [];
  const rowEls: HTMLElement[] = [];
  let locked = false;

  const rows = ex.sentences.map((f, i) => {
    groups[i] = [true, false].map((b) => h('button', {
      type: 'button', class: 'seg',
      onclick: () => {
        if (locked) return;
        answers[i] = b;
        groups[i].forEach((x, j) => x.classList.toggle('selected', (j === 0) === b));
        ctx.onChange();
      },
    }, b ? 'V' : 'F'));
    const row = h('div', { class: 'mt-row' }, formula(f), h('div', { class: 'segmented' }, ...groups[i]));
    rowEls.push(row);
    return row;
  });

  const el = h('div', { class: 'ex ex-kripketruth' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? `Au monde ${ex.world}, chaque formule est-elle vraie ou fausse ?`)),
    h('div', { class: 'graph-wrap' }, kripkeGraph(model, w)),
    h('p', { class: 'hint' }, 'Les flèches indiquent les mondes accessibles ; dans chaque monde, les lettres qui y sont vraies (∅ : aucune).'),
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

export const kripkeBuildView: ExerciseFactory<KripkeBuildExercise> = (ex, ctx) => {
  const trues = ex.true.map(parse);
  const falses = ex.false.map(parse);
  const atoms = sortedAtoms(...trues, ...falses);
  const maxWorlds = ex.maxWorlds ?? 3;
  const system = ex.system ?? 'K';
  const props = SYSTEM_FRAMES[system];
  let locked = false;
  let touched = false;

  let n = 2;
  const R = Array.from({ length: maxWorlds }, () => Array.from({ length: maxWorlds }, () => false));
  const val: Record<string, boolean[]> = Object.fromEntries(atoms.map((p) => [p, Array.from({ length: maxWorlds }, () => false)]));

  const current = (): KModel => ({
    n,
    R: R.slice(0, n).map((row) => row.slice(0, n)),
    val: Object.fromEntries(Object.entries(val).map(([p, v]) => [p, v.slice(0, n)])),
  });

  const status = h('div', { class: 'bm-status' });
  const graph = h('div', { class: 'graph-wrap' });
  const editor = h('div', { class: 'bm-editor' });

  const chip = (label: string, on: boolean, onclick: () => void, title?: string) =>
    h('button', { type: 'button', class: `chip ${on ? 'on' : ''}`, title, onclick: () => { if (!locked) { touched = true; onclick(); render(); } } }, label);

  function render() {
    clear(editor);
    const ws = Array.from({ length: n }, (_, i) => i);
    editor.append(h('div', { class: 'bm-row' },
      h('span', { class: 'bm-label' }, 'Mondes'),
      h('div', { class: 'chips' }, ...Array.from({ length: maxWorlds }, (_, i) => chip(`${i + 1} monde${i ? 's' : ''}`, n === i + 1, () => { n = i + 1; }))),
    ));
    editor.append(h('div', { class: 'bm-row bm-rel' },
      h('span', { class: 'bm-label' }, 'Accès : la ligne voit la colonne'),
      h('table', { class: 'rel-grid' },
        h('tr', null, h('th', null, ''), ...ws.map((j) => h('th', null, `w${j + 1}`))),
        ...ws.map((i) => h('tr', null, h('th', null, `w${i + 1}`), ...ws.map((j) =>
          h('td', null, chip(R[i][j] ? '→' : '', R[i][j], () => { R[i][j] = !R[i][j]; }, `w${i + 1} voit w${j + 1}`))))),
      ),
    ));
    for (const p of atoms) {
      editor.append(h('div', { class: 'bm-row' },
        h('span', { class: 'bm-label' }, formula(p), ' est vraie en'),
        h('div', { class: 'chips' }, ...ws.map((i) => chip(`w${i + 1}`, val[p][i], () => { val[p][i] = !val[p][i]; }))),
      ));
    }
    const m = current();
    clear(graph);
    graph.append(kripkeGraph(m, 0));
    renderStatus(m);
    ctx.onChange();
  }

  function renderStatus(m: KModel) {
    clear(status);
    const item = (good: boolean, content: (Node | string)[], note: string) =>
      h('li', { class: good ? 'ok' : 'bad' }, icon(good ? 'check' : 'close'), ...content, h('span', { class: 'bm-want' }, note));
    status.append(h('ul', null,
      ...ex.true.map((f) => item(evalK(parse(f), m, 0), [formula(f)], 'doit être vraie en w1')),
      ...ex.false.map((f) => item(!evalK(parse(f), m, 0), [formula(f)], 'doit être fausse en w1')),
      ...props.map((p) => {
        const fail = propertyFailure(m, p);
        return item(!fail, [`Relation ${PROPERTY_NAMES[p].split(' (')[0]}`], fail ?? `cadre ${system}`);
      }),
    ));
  }

  const el = h('div', { class: 'ex ex-kripkebuild' },
    h('h2', { class: 'prompt' }, inlineMarkup(ex.prompt ?? 'Construis un modèle de Kripke qui satisfait les conditions, évaluées au monde w1.')),
    status,
    graph,
    editor,
  );
  render();

  const ok = () => {
    const m = current();
    return trues.every((f) => evalK(f, m, 0)) && falses.every((f) => !evalK(f, m, 0)) && props.every((p) => !propertyFailure(m, p));
  };

  return {
    el,
    ready: () => touched,
    check: () => {
      if (ok()) return { kind: 'graded', correct: true };
      const sol = findKripke(trues, falses, system, maxWorlds);
      return {
        kind: 'graded',
        correct: false,
        detail: 'Au moins une condition n\'est pas remplie (voir les croix).',
        solution: sol ? h('span', { class: 'solution-graph' }, 'par exemple :', kripkeGraph(sol, 0)) : undefined,
      };
    },
    lock: () => {
      locked = true;
      el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => { b.disabled = true; });
    },
  };
};
