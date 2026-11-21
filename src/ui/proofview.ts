// Affichage statique d'une preuve de Fitch (cours, solution montrée après une erreur).
import type { ProofTemplateLine } from '../core/types';
import { formula, h } from './dom';

export function bars(depth: number): HTMLElement {
  return h('span', { class: 'pl-bars' }, ...Array.from({ length: depth + 1 }, () => h('span', { class: 'bar' })));
}

export function staticProof(premises: string[], lines: ProofTemplateLine[]): HTMLElement {
  const all: ProofTemplateLine[] = [...premises.map((f) => ({ d: 0, f, r: 'Prém' as const })), ...lines];
  return h('div', { class: 'proof proof-static' },
    ...all.map((l, i) => {
      const lastPremise = l.r === 'Prém' && all[i + 1]?.r !== 'Prém';
      return h('div', { class: `pl ${l.r === 'Hyp' || lastPremise ? 'under' : ''}` },
        h('span', { class: 'pl-num' }, i + 1),
        bars(l.d),
        h('span', { class: 'pl-f' }, formula(l.f)),
        h('span', { class: 'pl-just' }, l.r ?? '', l.c ? ` ${l.c}` : ''),
      );
    }),
  );
}
