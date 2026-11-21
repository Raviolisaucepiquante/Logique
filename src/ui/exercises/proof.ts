// Éditeur de preuve en déduction naturelle (style Fitch), vérifié ligne par ligne.
import type { ProofExercise } from '../../core/types';
import { isFirstOrder, parse } from '../../logic/formula';
import { keyLetters } from './formula';
import { checkLines, checkProof, QUANTIFIER_RULES, RULES, USER_RULES, type ProofLine, type RuleId } from '../../logic/proof';
import { clear, formula, h, icon, inlineMarkup } from '../dom';
import { liveNormalize, symbolKeyboard } from '../keyboard';
import { bars, staticProof } from '../proofview';
import type { ExerciseFactory } from './types';

interface Row extends ProofLine {
  lockFormula: boolean;
  lockJust: boolean;
}

export const proofView: ExerciseFactory<ProofExercise> = (ex, ctx) => {
  const rows: Row[] = [
    ...ex.premises.map((f) => ({ depth: 0, formula: f, rule: 'Prém' as const, cites: '', lockFormula: true, lockJust: true })),
    ...(ex.given ?? []).map((g) => ({ depth: g.d, formula: g.f, rule: (g.r ?? '') as RuleId | '', cites: g.c ?? '', lockFormula: true, lockJust: !!g.r })),
  ];
  const fixedCount = rows.length;
  const canAdd = !ex.justifyOnly;
  if (canAdd && rows.length === fixedCount) {
    // Première ligne libre : au niveau principal (ou hypothèse si aucune prémisse).
    rows.push({ depth: ex.premises.length ? 0 : 1, formula: '', rule: ex.premises.length ? '' : 'Hyp', cites: '', lockFormula: false, lockJust: false });
  }
  const firstOrder = [...ex.premises, ex.conclusion].some((f) => isFirstOrder(parse(f)));
  const rules = (ex.rules ?? (firstOrder ? [...USER_RULES, ...QUANTIFIER_RULES] : USER_RULES)).filter((r) => r !== 'Prém');
  let locked = false;
  let lastFocused: HTMLInputElement | null = null;

  const list = h('div', { class: 'proof' });
  const msgs: HTMLElement[] = [];
  const lineEls: HTMLElement[] = [];
  const formulaInputs: (HTMLInputElement | null)[] = [];

  function renderRows(focusIndex?: number) {
    clear(list);
    msgs.length = 0;
    lineEls.length = 0;
    formulaInputs.length = 0;
    rows.forEach((row, i) => {
      const isLastPremise = row.rule === 'Prém' && rows[i + 1]?.rule !== 'Prém';

      let fEl: HTMLElement;
      if (row.lockFormula) {
        fEl = h('span', { class: 'pl-f' }, formula(row.formula));
        formulaInputs.push(null);
      } else {
        const input = h('input', {
          type: 'text', class: 'pl-input f', value: row.formula, autocomplete: 'off', spellcheck: 'false',
          placeholder: row.rule === 'Hyp' ? 'hypothèse' : 'formule', 'aria-label': `Formule de la ligne ${i + 1}`,
        });
        liveNormalize(input);
        input.addEventListener('input', () => { row.formula = input.value; refresh(); });
        input.addEventListener('focus', () => { lastFocused = input; });
        input.addEventListener('keydown', (e) => onEnter(e, () => {
          const next = lineEls[i].querySelector('select') as HTMLElement | null;
          if (next) next.focus(); else nextLine(i);
        }));
        fEl = h('span', { class: 'pl-f' }, input);
        formulaInputs.push(input);
      }

      let justEl: HTMLElement;
      if (row.lockJust) {
        justEl = h('span', { class: 'pl-just' }, row.rule, row.cites ? ` ${row.cites}` : '');
      } else {
        const select = h('select', { class: 'pl-rule', 'aria-label': `Règle de la ligne ${i + 1}` },
          h('option', { value: '' }, 'règle'),
          ...rules.map((r) => h('option', { value: r, title: RULES[r].name, selected: row.rule === r }, r)),
        );
        const cites = h('input', {
          type: 'text', class: 'pl-cites', value: row.cites, inputmode: 'numeric', autocomplete: 'off',
          placeholder: 'lignes', 'aria-label': `Lignes citées, ligne ${i + 1}`,
        });
        const syncCites = () => {
          const needs = row.rule && row.rule !== 'Hyp';
          cites.disabled = !needs;
          cites.title = row.rule ? `${RULES[row.rule as RuleId].name} : ${RULES[row.rule as RuleId].usage}` : '';
          if (!needs && row.cites) { row.cites = ''; cites.value = ''; }
        };
        select.addEventListener('change', () => { row.rule = select.value as RuleId | ''; syncCites(); refresh(); if (!cites.disabled) cites.focus(); });
        select.addEventListener('keydown', (e) => onEnter(e, () => (cites.disabled ? nextLine(i) : cites.focus())));
        cites.addEventListener('input', () => { row.cites = cites.value; refresh(); });
        cites.addEventListener('keydown', (e) => onEnter(e, () => nextLine(i)));
        syncCites();
        justEl = h('span', { class: 'pl-just' }, select, cites);
      }

      const line = h('div', { class: `pl ${row.rule === 'Hyp' || isLastPremise ? 'under' : ''} ${row.lockFormula && row.lockJust ? 'fixed' : ''}` },
        h('span', { class: 'pl-num' }, i + 1),
        bars(row.depth),
        fEl,
        justEl,
        h('span', { class: 'pl-status', 'aria-hidden': 'true' }),
      );
      const msg = h('div', { class: 'pl-msg', role: 'status' });
      lineEls.push(line);
      msgs.push(msg);
      list.append(line, msg);
    });
    refresh();
    if (focusIndex !== undefined) formulaInputs[focusIndex]?.focus();
  }

  /** Entrée passe au champ suivant (et ne déclenche pas « Vérifier » ; Ctrl+Entrée le fait). */
  function onEnter(e: KeyboardEvent, go: () => void) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    go();
  }

  function nextLine(i: number) {
    if (i < rows.length - 1) {
      const next = formulaInputs.slice(i + 1).find(Boolean) ?? lineEls[i + 1]?.querySelector('select');
      (next as HTMLElement | undefined)?.focus();
    } else if (canAdd && !locked) {
      addLine(rows[i].depth, false);
    }
  }

  function refresh() {
    const st = checkLines(rows);
    st.forEach((s, i) => {
      const el = lineEls[i];
      if (!el) return;
      const row = rows[i];
      // Erreur affichée seulement une fois la règle choisie : pas de rouge sur une ligne pas encore traitée.
      const show = s.status === 'error' && row.rule !== '' && row.formula.trim() !== '';
      el.classList.toggle('ok', s.status === 'ok' && !(row.lockFormula && row.lockJust));
      el.classList.toggle('error', show);
      const status = el.querySelector('.pl-status')!;
      clear(status);
      if (s.status === 'ok' && !(row.lockFormula && row.lockJust)) status.append(icon('check'));
      else if (show) status.append(icon('close'));
      msgs[i].textContent = show ? (s as { message: string }).message : '';
    });
    updateButtons();
    ctx.onChange();
  }

  const last = () => rows[rows.length - 1];
  const editableCount = () => rows.length - fixedCount;

  function addLine(depth: number, hyp: boolean) {
    rows.push({ depth, formula: '', rule: hyp ? 'Hyp' : '', cites: '', lockFormula: false, lockJust: false });
    renderRows(rows.length - 1);
  }

  const btn = (label: string, title: string, onclick: () => void) =>
    h('button', { type: 'button', class: 'btn btn-ghost btn-small', title, onclick: () => { if (!locked) onclick(); } }, label);

  const bLine = btn('+ Ligne', 'Ajouter une ligne au même niveau', () => addLine(last()?.depth ?? 0, false));
  const bHyp = btn('+ Hypothèse', 'Ouvrir une sous-preuve avec une hypothèse', () => addLine((last()?.depth ?? 0) + 1, true));
  const bClose = btn('Fermer', 'Fermer la sous-preuve : continuer au niveau inférieur', () => addLine(Math.max(0, last().depth - 1), false));
  const bSibling = btn('Hyp. suivante', 'Fermer la sous-preuve et en ouvrir une autre au même niveau (utile pour ∨E, ↔I)', () => addLine(last().depth, true));
  const bDelete = btn('Supprimer', 'Supprimer la dernière ligne', () => { rows.pop(); renderRows(); });

  function updateButtons() {
    const d = last()?.depth ?? 0;
    bClose.disabled = d === 0;
    bSibling.disabled = d === 0;
    bDelete.disabled = editableCount() <= 0;
  }

  // En logique des prédicats, on propose aussi des noms nouveaux (utiles pour ∀I et ∃E).
  const letters = [...new Set([...[...ex.premises, ex.conclusion].flatMap((f) => keyLetters(undefined, f)), ...(firstOrder ? ['a', 'b', 'c'] : [])])];
  const premisesText = ex.premises.length ? ex.premises.join(', ') : '';

  const el = h('div', { class: 'ex ex-proof' },
    h('h2', { class: 'prompt' }, ex.prompt ? inlineMarkup(ex.prompt) : (ex.justifyOnly ? 'Justifie chaque ligne : règle et lignes citées.' : 'Démontre :')),
    h('p', { class: 'sequent' }, premisesText ? formula(premisesText) : null, h('span', { class: 'turnstile' }, ' ⊢ '), formula(ex.conclusion)),
    list,
    canAdd ? h('div', { class: 'proof-tools' }, bLine, bHyp, bClose, bSibling, bDelete) : null,
    canAdd ? symbolKeyboard(() => lastFocused ?? formulaInputs.filter(Boolean).pop() ?? null, ctx.symbols, letters) : null,
    h('p', { class: 'hint' }, 'Chaque ligne est vérifiée dès que tu choisis sa règle. Entrée passe au champ suivant ; citations : « 1, 2 » ou « 3-5 » pour une sous-preuve.'),
  );

  renderRows();

  return {
    el,
    ready: () => rows.slice(fixedCount).some((r) => r.formula.trim()) || rows.some((r) => !r.lockJust && r.lockFormula && r.rule),
    focus: () => formulaInputs.filter(Boolean).pop()?.focus(),
    check: () => {
      const r = checkProof(rows, ex.conclusion);
      if (r.complete) return { kind: 'graded', correct: true };
      return {
        kind: 'graded',
        correct: false,
        detail: r.reason,
        solution: h('div', { class: 'solution-proof' }, 'une preuve possible :', staticProof(ex.premises, ex.solution)),
      };
    },
    lock: () => {
      locked = true;
      el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((x) => { x.disabled = true; });
    },
  };
};
