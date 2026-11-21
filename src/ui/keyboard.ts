// Clavier de symboles logiques, lié à un champ de saisie.
import { normalizeInput } from '../logic/formula';
import { h, icon } from './dom';

export const ALL_SYMBOLS = ['¬', '∧', '∨', '→', '↔', '∀', '∃', '□', '◇', '⊥', '(', ')'];
export const DEFAULT_SYMBOLS = ['¬', '∧', '∨', '→', '↔', '(', ')'];

const LABELS: Record<string, string> = {
  '¬': 'non', '∧': 'et', '∨': 'ou', '→': 'si… alors', '↔': 'si et seulement si',
  '∀': 'pour tout', '∃': 'il existe', '□': 'nécessairement', '◇': 'possiblement', '⊥': 'absurde',
};

function insert(input: HTMLInputElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const pos = start + text.length;
  input.setSelectionRange(pos, pos);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function backspace(input: HTMLInputElement): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  if (start === end && start === 0) return;
  const from = start === end ? start - 1 : start;
  input.value = input.value.slice(0, from) + input.value.slice(end);
  input.setSelectionRange(from, from);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Convertit à la volée « -> », « & », « ~ »… en symboles, en conservant la position du curseur. */
export function liveNormalize(input: HTMLInputElement): void {
  input.addEventListener('input', () => {
    const caret = input.selectionStart ?? input.value.length;
    const before = normalizeInput(input.value.slice(0, caret));
    const all = normalizeInput(input.value);
    if (all !== input.value) {
      input.value = all;
      input.setSelectionRange(before.length, before.length);
    }
  });
}

/** `target` : le champ visé, ou une fonction qui le désigne (plusieurs champs, comme dans une preuve). */
export function symbolKeyboard(
  target: HTMLInputElement | (() => HTMLInputElement | null),
  symbols: string[],
  letters: string[] = [],
): HTMLElement {
  const get = typeof target === 'function' ? target : () => target;
  const key = (label: string | Node, onPress: (input: HTMLInputElement) => void, title?: string, cls = '') => h('button', {
    type: 'button',
    class: `key ${cls}`.trim(),
    title,
    'aria-label': title,
    // mousedown + preventDefault : le champ garde le focus et le curseur.
    onmousedown: (e: MouseEvent) => e.preventDefault(),
    onclick: () => {
      const input = get();
      if (!input || input.readOnly) return;
      onPress(input);
      input.focus();
    },
  }, label);

  return h('div', { class: 'keyboard' },
    h('div', { class: 'keys' },
      ...symbols.map((s) => key(s, (i) => insert(i, s), LABELS[s], 'key-sym')),
      ...letters.map((l) => key(l, (i) => insert(i, l), undefined, 'key-letter')),
      key(icon('backspace'), backspace, 'Effacer', 'key-wide'),
    ),
  );
}
