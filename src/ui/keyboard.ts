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

// Sur écran tactile, le clavier natif du téléphone cacherait le clavier de symboles :
// par défaut on le désactive (inputmode="none"), et une touche permet de le rappeler.
const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
let nativeKeyboard = false;
const FORMULA_INPUTS = '.formula-input, .pl-input';

function applyInputMode(input: HTMLInputElement): void {
  if (isTouch() && !nativeKeyboard) input.setAttribute('inputmode', 'none');
  else input.removeAttribute('inputmode');
}

/** Convertit à la volée « -> », « & », « ~ »… en symboles, en conservant la position du curseur. */
export function liveNormalize(input: HTMLInputElement): void {
  applyInputMode(input);
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
      isTouch() ? h('button', {
        type: 'button',
        class: `key key-native ${nativeKeyboard ? 'on' : ''}`,
        title: 'Clavier du téléphone',
        'aria-label': 'Afficher ou masquer le clavier du téléphone',
        'aria-pressed': String(nativeKeyboard),
        onmousedown: (e: MouseEvent) => e.preventDefault(),
        onclick: (e: MouseEvent) => {
          nativeKeyboard = !nativeKeyboard;
          document.querySelectorAll<HTMLInputElement>(FORMULA_INPUTS).forEach(applyInputMode);
          document.querySelectorAll('.key-native').forEach((k) => { k.classList.toggle('on', nativeKeyboard); k.setAttribute('aria-pressed', String(nativeKeyboard)); });
          void e;
          const input = get();
          // Le changement d'inputmode ne prend effet qu'au prochain focus.
          if (input) { input.blur(); setTimeout(() => input.focus(), 30); }
        },
      }, icon('keyboard')) : null,
      key(icon('backspace'), backspace, 'Effacer', 'key-wide'),
    ),
  );
}
