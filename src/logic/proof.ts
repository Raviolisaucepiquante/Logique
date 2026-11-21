// Vérificateur de preuves en déduction naturelle, style Fitch (règles de forall x: Calgary).
// Chaque ligne est vérifiée séparément : formule bien formée, règle applicable,
// lignes et sous-preuves citées accessibles.
import { constants, parse, show, type Formula } from './formula';

export type RuleId =
  | 'Prém' | 'Hyp' | 'R'
  | '∧I' | '∧E' | '∨I' | '∨E' | '→I' | '→E' | '↔I' | '↔E'
  | '¬I' | '¬E' | 'X' | 'RA'
  | 'MT' | 'DS' | 'DNE' | 'TND'
  | '∀E' | '∀I' | '∃I' | '∃E' | 'CQ';

export interface RuleInfo {
  name: string;
  /** Forme des citations attendues, pour les messages d'aide. */
  usage: string;
  lines: number;
  subproofs: number;
}

export const RULES: Record<RuleId, RuleInfo> = {
  'Prém': { name: 'Prémisse', usage: 'aucune citation', lines: 0, subproofs: 0 },
  'Hyp': { name: 'Hypothèse', usage: 'aucune citation', lines: 0, subproofs: 0 },
  'R': { name: 'Réitération', usage: 'une ligne (ex. 2)', lines: 1, subproofs: 0 },
  '∧I': { name: 'Introduction de ∧', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  '∧E': { name: 'Élimination de ∧', usage: 'une ligne (ex. 1)', lines: 1, subproofs: 0 },
  '∨I': { name: 'Introduction de ∨', usage: 'une ligne (ex. 1)', lines: 1, subproofs: 0 },
  '∨E': { name: 'Élimination de ∨', usage: 'une ligne et deux sous-preuves (ex. 1, 2-4, 5-7)', lines: 1, subproofs: 2 },
  '→I': { name: 'Introduction de →', usage: 'une sous-preuve (ex. 2-4)', lines: 0, subproofs: 1 },
  '→E': { name: 'Élimination de → (modus ponens)', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  '↔I': { name: 'Introduction de ↔', usage: 'deux sous-preuves (ex. 1-3, 4-6)', lines: 0, subproofs: 2 },
  '↔E': { name: 'Élimination de ↔', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  '¬I': { name: 'Introduction de ¬', usage: 'une sous-preuve (ex. 2-4)', lines: 0, subproofs: 1 },
  '¬E': { name: 'Élimination de ¬', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  'X': { name: 'Ex falso (explosion)', usage: 'une ligne (ex. 3)', lines: 1, subproofs: 0 },
  'RA': { name: 'Raisonnement par l\'absurde', usage: 'une sous-preuve (ex. 2-4)', lines: 0, subproofs: 1 },
  'MT': { name: 'Modus tollens', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  'DS': { name: 'Syllogisme disjonctif', usage: 'deux lignes (ex. 1, 2)', lines: 2, subproofs: 0 },
  'DNE': { name: 'Élimination de la double négation', usage: 'une ligne (ex. 1)', lines: 1, subproofs: 0 },
  'TND': { name: 'Tiers exclu', usage: 'deux sous-preuves (ex. 1-3, 4-6)', lines: 0, subproofs: 2 },
  '∀E': { name: 'Élimination de ∀', usage: 'une ligne (ex. 1)', lines: 1, subproofs: 0 },
  '∀I': { name: 'Introduction de ∀', usage: 'une ligne (ex. 3)', lines: 1, subproofs: 0 },
  '∃I': { name: 'Introduction de ∃', usage: 'une ligne (ex. 2)', lines: 1, subproofs: 0 },
  '∃E': { name: 'Élimination de ∃', usage: 'une ligne et une sous-preuve (ex. 1, 2-4)', lines: 1, subproofs: 1 },
  'CQ': { name: 'Conversion des quantificateurs', usage: 'une ligne (ex. 1)', lines: 1, subproofs: 0 },
};

/** Règles que l'élève peut choisir (Prém est réservée aux prémisses données). */
export const USER_RULES: RuleId[] = ['Hyp', 'R', '∧I', '∧E', '∨I', '∨E', '→I', '→E', '↔I', '↔E', '¬I', '¬E', 'X', 'RA', 'MT', 'DS', 'DNE', 'TND'];
/** Règles des quantificateurs, ajoutées au menu quand la preuve contient des prédicats. */
export const QUANTIFIER_RULES: RuleId[] = ['∀E', '∀I', '∃I', '∃E', 'CQ'];

export interface ProofLine {
  depth: number;
  formula: string;
  rule: RuleId | '';
  cites: string;
}

export type LineStatus =
  | { status: 'empty' }
  | { status: 'ok' }
  | { status: 'error'; message: string };

type Cite = { kind: 'line'; n: number } | { kind: 'sub'; from: number; to: number };

export function same(a: Formula, b: Formula): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'atom': return a.name === (b as typeof a).name;
    case 'const': return a.value === (b as typeof a).value;
    case 'pred': {
      const bb = b as typeof a;
      return a.name === bb.name && a.args.length === bb.args.length && a.args.every((t, i) => t.k === bb.args[i].k && t.name === bb.args[i].name);
    }
    case 'forall': case 'exists': return a.v === (b as typeof a).v && same(a.a, (b as typeof a).a);
    case 'not': case 'box': case 'dia': return same(a.a, (b as typeof a).a);
    default: return same(a.a, (b as typeof a).a) && same(a.b, (b as typeof a).b);
  }
}

/**
 * La formule `target` est-elle `pattern` où les occurrences libres de `x` sont remplacées par un même nom ?
 * Renvoie ce nom (ou undefined si `x` n'apparaît pas), ou false si ce n'est pas une instance.
 */
export function instanceName(pattern: Formula, x: string, target: Formula): string | undefined | false {
  let name: string | undefined;
  let ok = true;
  const go = (p: Formula, t: Formula, bound: boolean): void => {
    if (!ok) return;
    if (p.k !== t.k) { ok = false; return; }
    switch (p.k) {
      case 'atom': if (p.name !== (t as typeof p).name) ok = false; return;
      case 'const': if (p.value !== (t as typeof p).value) ok = false; return;
      case 'pred': {
        const tt = t as typeof p;
        if (p.name !== tt.name || p.args.length !== tt.args.length) { ok = false; return; }
        p.args.forEach((a, i) => {
          const b = tt.args[i];
          if (a.k === 'var' && a.name === x && !bound) {
            if (b.k !== 'cst' || (name !== undefined && name !== b.name)) ok = false;
            else name = b.name;
          } else if (a.k !== b.k || a.name !== b.name) ok = false;
        });
        return;
      }
      case 'forall': case 'exists': {
        const tt = t as typeof p;
        if (p.v !== tt.v) { ok = false; return; }
        go(p.a, tt.a, bound || p.v === x);
        return;
      }
      case 'not': case 'box': case 'dia': go(p.a, (t as typeof p).a, bound); return;
      default: go(p.a, (t as typeof p).a, bound); go(p.b, (t as typeof p).b, bound);
    }
  };
  go(pattern, target, false);
  return ok ? name : false;
}

const FALSUM: Formula = { k: 'const', value: false };

/** Lit « 1, 3-5 » ; renvoie null si la saisie est illisible. Numéros à partir de 1. */
export function parseCites(s: string): Cite[] | null {
  const parts = s.split(/[,;\s]+/).filter(Boolean);
  const out: Cite[] = [];
  for (const p of parts) {
    const range = p.match(/^(\d+)[-–—](\d+)$/);
    if (range) { out.push({ kind: 'sub', from: +range[1], to: +range[2] }); continue; }
    if (/^\d+$/.test(p)) { out.push({ kind: 'line', n: +p }); continue; }
    return null;
  }
  return out;
}

interface Structure {
  /** Pour chaque ligne : pile des hypothèses (indices 0-based) des sous-preuves ouvertes. */
  scope: number[][];
  errors: (string | null)[];
}

function analyseStructure(lines: ProofLine[]): Structure {
  const stack: number[] = [];
  const scope: number[][] = [];
  const errors: (string | null)[] = [];
  let premisesOver = false;
  lines.forEach((l, i) => {
    let err: string | null = null;
    if (l.rule === 'Prém') {
      if (premisesOver || l.depth !== 0) err = 'Les prémisses se placent au début, hors de toute sous-preuve.';
    } else {
      premisesOver = true;
    }
    if (l.rule === 'Hyp') {
      if (l.depth < 1 || l.depth > stack.length + 1) err = 'Une hypothèse ouvre une sous-preuve d\'un niveau plus profond.';
      stack.length = Math.max(0, Math.min(stack.length, l.depth - 1));
      stack.push(i);
    } else if (l.depth > stack.length) {
      err = 'Cette ligne n\'appartient à aucune sous-preuve ouverte : commence par une hypothèse.';
    } else {
      stack.length = l.depth;
    }
    scope.push([...stack]);
    errors.push(err);
  });
  return { scope, errors };
}

const isPrefix = (a: number[], b: number[]) => a.length <= b.length && a.every((x, i) => b[i] === x);

/** Vérifie chaque ligne. Une ligne sans formule ni règle est « vide ». */
export function checkLines(lines: ProofLine[]): LineStatus[] {
  const { scope, errors } = analyseStructure(lines);
  const parsed: (Formula | null)[] = lines.map((l) => {
    try { return l.formula.trim() ? parse(l.formula) : null; } catch { return null; }
  });

  return lines.map((line, k): LineStatus => {
    if (!line.formula.trim() && !line.rule && !line.cites.trim()) return { status: 'empty' };
    if (errors[k]) return { status: 'error', message: errors[k]! };
    let f: Formula;
    try { f = parse(line.formula); } catch (e) {
      return { status: 'error', message: line.formula.trim() ? `Formule mal formée : ${(e as Error).message}` : 'Écris une formule.' };
    }
    if (!line.rule) return { status: 'error', message: 'Choisis la règle utilisée.' };
    const info = RULES[line.rule];
    if (line.rule === 'Prém' || line.rule === 'Hyp') {
      return line.cites.trim() ? { status: 'error', message: `${info.name} : pas de citation.` } : { status: 'ok' };
    }

    const cites = parseCites(line.cites);
    if (!cites) return { status: 'error', message: 'Citation illisible : écris par exemple « 1, 3 » ou « 2-4 ».' };

    const ls: Formula[] = [];
    const subs: { hyp: Formula; last: Formula }[] = [];
    for (const c of cites) {
      if (c.kind === 'line') {
        const m = c.n - 1;
        if (m < 0 || m >= k) return { status: 'error', message: `On ne peut citer que des lignes précédentes (ligne ${c.n}).` };
        if (!isPrefix(scope[m], scope[k])) return { status: 'error', message: `La ligne ${c.n} est dans une sous-preuve fermée : elle n'est plus accessible.` };
        if (!parsed[m]) return { status: 'error', message: `La ligne ${c.n} ne contient pas de formule correcte.` };
        ls.push(parsed[m]!);
      } else {
        const i = c.from - 1;
        const j = c.to - 1;
        if (i < 0 || j >= k || i > j) return { status: 'error', message: `La sous-preuve ${c.from}-${c.to} n'existe pas avant cette ligne.` };
        if (lines[i].rule !== 'Hyp') return { status: 'error', message: `Une sous-preuve citée commence par une hypothèse : la ligne ${c.from} n'en est pas une.` };
        const sc = scope[i];
        if (scope[j].length !== sc.length || !isPrefix(sc, scope[j])) return { status: 'error', message: `La ligne ${c.to} n'est pas au premier niveau de la sous-preuve ouverte en ${c.from}.` };
        if (j + 1 < k && isPrefix(sc, scope[j + 1])) return { status: 'error', message: `La sous-preuve ouverte en ${c.from} continue après la ligne ${c.to} : cite-la jusqu'à sa dernière ligne.` };
        if (scope[k].includes(i)) return { status: 'error', message: `La sous-preuve ${c.from}-${c.to} n'est pas encore fermée.` };
        if (!isPrefix(sc.slice(0, -1), scope[k])) return { status: 'error', message: `La sous-preuve ${c.from}-${c.to} n'est pas accessible ici.` };
        if (!parsed[i] || !parsed[j]) return { status: 'error', message: `La sous-preuve ${c.from}-${c.to} contient une formule incorrecte.` };
        subs.push({ hyp: parsed[i]!, last: parsed[j]! });
      }
    }
    if (ls.length !== info.lines || subs.length !== info.subproofs) {
      return { status: 'error', message: `${line.rule} demande ${info.usage}.` };
    }
    // Hypothèses non déchargées à cette ligne : prémisses + hypothèses des sous-preuves ouvertes.
    const assumptions = [
      ...lines.flatMap((l, i) => (l.rule === 'Prém' && parsed[i] ? [parsed[i]!] : [])),
      ...scope[k].filter((i) => i !== k && parsed[i]).map((i) => parsed[i]!),
    ];
    const msg = applyRule(line.rule, f, ls, subs, assumptions);
    return msg ? { status: 'error', message: msg } : { status: 'ok' };
  });
}

/** Renvoie null si la règle s'applique, sinon une explication. */
function applyRule(rule: RuleId, c: Formula, ls: Formula[], subs: { hyp: Formula; last: Formula }[], assumptions: Formula[]): string | null {
  const [a, b] = ls;
  const sh = show;
  switch (rule) {
    case 'R':
      return same(a, c) ? null : 'La réitération recopie exactement la ligne citée.';
    case '∧I':
      return c.k === 'and' && ((same(c.a, a) && same(c.b, b)) || (same(c.a, b) && same(c.b, a)))
        ? null : `∧I : la formule doit être la conjonction des deux lignes citées (${sh(a)} ∧ ${sh(b)}).`;
    case '∧E':
      if (a.k !== 'and') return '∧E : la ligne citée doit être une conjonction.';
      return same(c, a.a) || same(c, a.b) ? null : `∧E : on obtient ${sh(a.a)} ou ${sh(a.b)}.`;
    case '∨I':
      if (c.k !== 'or') return '∨I : la formule obtenue doit être une disjonction.';
      return same(c.a, a) || same(c.b, a) ? null : `∨I : l'un des deux membres de la disjonction doit être ${sh(a)}.`;
    case '∨E': {
      if (a.k !== 'or') return '∨E : la ligne citée doit être une disjonction.';
      const [s1, s2] = subs;
      const okOrder = (x: typeof s1, y: typeof s1) => same(x.hyp, (a as { a: Formula }).a) && same(y.hyp, (a as { b: Formula }).b);
      if (!okOrder(s1, s2) && !okOrder(s2, s1)) return `∨E : les sous-preuves doivent supposer ${sh(a.a)} et ${sh(a.b)}.`;
      return same(s1.last, c) && same(s2.last, c) ? null : '∨E : les deux sous-preuves doivent aboutir à la formule de cette ligne.';
    }
    case '→I': {
      const s = subs[0];
      return c.k === 'imp' && same(c.a, s.hyp) && same(c.b, s.last)
        ? null : `→I : la sous-preuve citée donne ${sh({ k: 'imp', a: s.hyp, b: s.last })}.`;
    }
    case '→E': {
      const fits = (imp: Formula, ant: Formula) => imp.k === 'imp' && same(imp.a, ant) && same(imp.b, c);
      if (fits(a, b) || fits(b, a)) return null;
      if (a.k !== 'imp' && b.k !== 'imp') return '→E : l\'une des lignes citées doit être une implication.';
      return '→E : il faut une implication A → B et son antécédent A ; on obtient alors B.';
    }
    case '↔I': {
      if (c.k !== 'iff') return '↔I : la formule obtenue doit être un biconditionnel.';
      const [s1, s2] = subs;
      const fits = (x: typeof s1, y: typeof s1) => same(x.hyp, (c as { a: Formula }).a) && same(x.last, (c as { b: Formula }).b) && same(y.hyp, (c as { b: Formula }).b) && same(y.last, (c as { a: Formula }).a);
      return fits(s1, s2) || fits(s2, s1) ? null : `↔I : il faut une sous-preuve de ${sh(c.a)} à ${sh(c.b)} et une de ${sh(c.b)} à ${sh(c.a)}.`;
    }
    case '↔E': {
      const fits = (bi: Formula, x: Formula) => bi.k === 'iff' && ((same(bi.a, x) && same(bi.b, c)) || (same(bi.b, x) && same(bi.a, c)));
      return fits(a, b) || fits(b, a) ? null : '↔E : il faut un biconditionnel A ↔ B et l\'un de ses membres ; on obtient l\'autre.';
    }
    case '¬I': {
      const s = subs[0];
      if (!same(s.last, FALSUM)) return '¬I : la sous-preuve doit aboutir à ⊥.';
      return c.k === 'not' && same(c.a, s.hyp) ? null : `¬I : on obtient la négation de l'hypothèse, ${sh({ k: 'not', a: s.hyp })}.`;
    }
    case '¬E': {
      if (!same(c, FALSUM)) return '¬E : on obtient ⊥.';
      const contra = (x: Formula, y: Formula) => y.k === 'not' && same(y.a, x);
      return contra(a, b) || contra(b, a) ? null : '¬E : il faut une formule A et sa négation ¬A.';
    }
    case 'X':
      return same(a, FALSUM) ? null : 'X : la ligne citée doit être ⊥.';
    case 'RA': {
      const s = subs[0];
      if (!same(s.last, FALSUM)) return 'RA : la sous-preuve doit aboutir à ⊥.';
      return s.hyp.k === 'not' && same(s.hyp.a, c) ? null : `RA : l'hypothèse doit être la négation de la formule obtenue, ${sh({ k: 'not', a: c })}.`;
    }
    case 'MT': {
      const fits = (imp: Formula, neg: Formula) => imp.k === 'imp' && neg.k === 'not' && same(neg.a, imp.b) && c.k === 'not' && same(c.a, imp.a);
      return fits(a, b) || fits(b, a) ? null : 'MT : de A → B et ¬B, on obtient ¬A.';
    }
    case 'DS': {
      const fits = (or: Formula, neg: Formula) => or.k === 'or' && neg.k === 'not' &&
        ((same(neg.a, or.a) && same(c, or.b)) || (same(neg.a, or.b) && same(c, or.a)));
      return fits(a, b) || fits(b, a) ? null : 'DS : de A ∨ B et ¬A, on obtient B.';
    }
    case 'DNE':
      return a.k === 'not' && a.a.k === 'not' && same(a.a.a, c) ? null : 'DNE : de ¬¬A, on obtient A.';
    case 'TND': {
      const [s1, s2] = subs;
      const fits = (x: typeof s1, y: typeof s1) => y.hyp.k === 'not' && same(y.hyp.a, x.hyp);
      if (!fits(s1, s2) && !fits(s2, s1)) return 'TND : les sous-preuves doivent supposer A et ¬A.';
      return same(s1.last, c) && same(s2.last, c) ? null : 'TND : les deux sous-preuves doivent aboutir à la formule de cette ligne.';
    }
    case '∀E': {
      if (a.k !== 'forall') return '∀E : la ligne citée doit commencer par ∀.';
      return instanceName(a.a, a.v, c) === false ? `∀E : la formule doit être ${sh(a.a)} où ${a.v} est remplacé par un nom.` : null;
    }
    case '∃I': {
      if (c.k !== 'exists') return '∃I : la formule obtenue doit commencer par ∃.';
      return instanceName(c.a, c.v, a) === false
        ? `∃I : la ligne citée doit être ${sh(c.a)} où ${c.v} est remplacé par un nom.` : null;
    }
    case '∀I': {
      if (c.k !== 'forall') return '∀I : la formule obtenue doit commencer par ∀.';
      const n = instanceName(c.a, c.v, a);
      if (n === false) return `∀I : la ligne citée doit être ${sh(c.a)} où ${c.v} est remplacé par un nom.`;
      if (n !== undefined) {
        if (constants(c).has(n)) return `∀I : le nom ${n} ne doit plus apparaître dans la formule obtenue.`;
        const where = assumptions.find((h) => constants(h).has(n));
        if (where) return `∀I : le nom ${n} apparaît dans ${sh(where)}, une prémisse ou une hypothèse en cours ; il n'est pas arbitraire.`;
      }
      return null;
    }
    case '∃E': {
      if (a.k !== 'exists') return '∃E : la ligne citée doit commencer par ∃.';
      const s = subs[0];
      const n = instanceName(a.a, a.v, s.hyp);
      if (n === false) return `∃E : l'hypothèse doit être ${sh(a.a)} où ${a.v} est remplacé par un nouveau nom.`;
      if (!same(s.last, c)) return '∃E : la sous-preuve doit aboutir à la formule de cette ligne.';
      if (n !== undefined) {
        if (constants(a).has(n)) return `∃E : le nom ${n} ne doit pas apparaître dans ${sh(a)}.`;
        if (constants(c).has(n)) return `∃E : le nom ${n} ne doit pas apparaître dans la conclusion obtenue.`;
        const where = assumptions.find((h) => constants(h).has(n));
        if (where) return `∃E : le nom ${n} apparaît déjà dans ${sh(where)} ; il faut un nom nouveau.`;
      }
      return null;
    }
    case 'CQ': {
      const neg = (f: Formula): Formula => ({ k: 'not', a: f });
      const pairs = (q: Formula): Formula[] => {
        const out: Formula[] = [];
        // ∀x¬A ↔ ¬∃xA ; ∃x¬A ↔ ¬∀xA ; ¬∃x¬A ↔ ∀xA ; ¬∀x¬A ↔ ∃xA
        if ((q.k === 'forall' || q.k === 'exists') && q.a.k === 'not') out.push(neg({ k: q.k === 'forall' ? 'exists' : 'forall', v: q.v, a: q.a.a }));
        if (q.k === 'not' && (q.a.k === 'forall' || q.a.k === 'exists')) out.push({ k: q.a.k === 'forall' ? 'exists' : 'forall', v: q.a.v, a: neg(q.a.a) });
        if (q.k === 'forall' || q.k === 'exists') out.push(neg({ k: q.k === 'forall' ? 'exists' : 'forall', v: q.v, a: neg(q.a) }));
        if (q.k === 'not' && (q.a.k === 'forall' || q.a.k === 'exists') && q.a.a.k === 'not') out.push({ k: q.a.k === 'forall' ? 'exists' : 'forall', v: q.a.v, a: q.a.a.a });
        return out;
      };
      return pairs(a).some((x) => same(x, c)) ? null : 'CQ : ¬∃x A devient ∀x ¬A, et ¬∀x A devient ∃x ¬A (et inversement).';
    }
    default:
      return 'Règle inconnue.';
  }
}

export type ProofResult =
  | { complete: true }
  | { complete: false; reason: string; badLine?: number };

/** Une preuve est terminée si toutes les lignes sont correctes et que la dernière, hors sous-preuve, est la conclusion. */
export function checkProof(lines: ProofLine[], conclusion: string): ProofResult {
  const statuses = checkLines(lines);
  const bad = statuses.findIndex((s) => s.status === 'error');
  if (bad >= 0) return { complete: false, reason: `Ligne ${bad + 1} : ${(statuses[bad] as { message: string }).message}`, badLine: bad };
  const filled = lines.filter((_, i) => statuses[i].status === 'ok');
  if (filled.length !== lines.length) {
    const empty = statuses.findIndex((s) => s.status === 'empty');
    return { complete: false, reason: `La ligne ${empty + 1} est vide.`, badLine: empty };
  }
  const last = lines[lines.length - 1];
  if (!last) return { complete: false, reason: 'La preuve est vide.' };
  if (last.depth !== 0) return { complete: false, reason: 'La dernière ligne est encore dans une sous-preuve : ferme-la.' };
  if (!same(parse(last.formula), parse(conclusion))) return { complete: false, reason: `La dernière ligne doit être la conclusion, ${show(parse(conclusion))}.` };
  return { complete: true };
}
