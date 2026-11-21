// Valide tous les fichiers de contenu : identifiants uniques, formules bien formées,
// réponses de référence conformes à leurs propres consignes. À lancer après chaque ajout de chapitre.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFormula, truthTableModel, valuationModel } from '../src/core/check';
import type { Chapter, ContentIndex, Exercise } from '../src/core/types';
import { parse } from '../src/logic/formula';
import { checkLines, checkProof } from '../src/logic/proof';
import { evalFO, findModel, isSentence, modelFromSpec } from '../src/logic/semantics';
import { evalK, findKripke, kripkeFromSpec } from '../src/logic/modal';

const dir = join(__dirname, '..', 'public', 'content');
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as ContentIndex;

function formulasIn(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

function checkExercise(ex: Exercise) {
  switch (ex.type) {
    case 'mcq':
      expect(ex.answer, ex.id).toBeGreaterThanOrEqual(0);
      expect(ex.answer, ex.id).toBeLessThan(ex.choices.length);
      if (ex.formulas) ex.choices.filter((c) => c.length > 1).forEach((c) => parse(c));
      formulasIn(ex.prompt).filter((f) => !/[A-Z](?![a-z])/.test(f)).forEach((f) => parse(f));
      break;
    case 'formula':
    case 'formalize':
      expect(checkFormula(ex, ex.answer), ex.id).toEqual({ status: 'correct' });
      break;
    case 'truthtable':
      expect(truthTableModel(ex).rows.length, ex.id).toBeGreaterThan(0);
      break;
    case 'valuation':
      valuationModel(ex);
      break;
    case 'proof': {
      // La solution modèle doit être une preuve correcte et complète…
      const lines = [
        ...ex.premises.map((f) => ({ depth: 0, formula: f, rule: 'Prém' as const, cites: '' })),
        ...ex.solution.map((l) => ({ depth: l.d, formula: l.f, rule: l.r ?? ('' as const), cites: l.c ?? '' })),
      ];
      expect(checkProof(lines, ex.conclusion), ex.id).toEqual({ complete: true });
      // …n'utiliser que des règles proposées…
      if (ex.rules) ex.solution.forEach((l) => { if (l.r) expect(ex.rules, `${ex.id} : règle ${l.r} absente du menu`).toContain(l.r); });
      // …et prolonger les lignes données.
      (ex.given ?? []).forEach((g, i) => {
        expect(ex.solution[i]?.f, `${ex.id} ligne donnée ${i + 1}`).toBe(g.f);
        expect(ex.solution[i]?.d, `${ex.id} ligne donnée ${i + 1}`).toBe(g.d);
      });
      if (ex.justifyOnly) expect(ex.given?.length, ex.id).toBe(ex.solution.length);
      break;
    }
    case 'modeltruth': {
      const m = modelFromSpec(ex.model);
      ex.sentences.forEach((s) => { expect(isSentence(parse(s)), `${ex.id} : ${s}`).toBe(true); evalFO(parse(s), m); });
      break;
    }
    case 'kripketruth': {
      const m = kripkeFromSpec(ex.model);
      const w = ex.model.worlds.indexOf(ex.world);
      expect(w, `${ex.id} : monde ${ex.world}`).toBeGreaterThanOrEqual(0);
      ex.sentences.forEach((f) => evalK(parse(f), m, w));
      break;
    }
    case 'kripkebuild':
      expect(findKripke(ex.true.map(parse), ex.false.map(parse), ex.system ?? 'K', ex.maxWorlds ?? 3), ex.id).not.toBeNull();
      break;
    case 'buildmodel':
      // Il doit exister un modèle de taille permise.
      expect(findModel(ex.true.map(parse), ex.false.map(parse), ex.maxSize ?? 3), ex.id).not.toBeNull();
      break;
    default:
      throw new Error(`Type inconnu dans ${(ex as Exercise).id}`);
  }
}

for (const mod of index.modules) {
  describe(`module ${mod.id}`, () => {
    const chapters = mod.chapters.map((f) => JSON.parse(readFileSync(join(dir, mod.id, `${f}.json`), 'utf8')) as Chapter);
    const all = chapters.flatMap((c) => [...c.lessons.flatMap((l) => l.exercises), ...(c.test?.exercises ?? [])]);

    it('a des identifiants d\'exercice uniques', () => {
      const ids = all.map((e) => e.id);
      expect(ids.length).toBe(new Set(ids).size);
    });

    for (const c of chapters) {
      it(`${c.id} : leçons de 5 à 10 questions, contenu valide`, () => {
        for (const l of c.lessons) {
          expect(l.exercises.length, `${c.id}/${l.id}`).toBeGreaterThanOrEqual(5);
          expect(l.exercises.length, `${c.id}/${l.id}`).toBeLessThanOrEqual(10);
          l.cours.forEach((card) => {
            // On ne saute que les schémas (A, B, C seuls = métavariables) et les équivalences « ≡ ».
            formulasIn(card.body).forEach((f) => { if (!/≡|[A-Z](?![a-z])/.test(f)) parse(f); });
            card.examples?.forEach((e) => {
              if (e.formula && !/[A-Z](?![a-z])/.test(e.formula)) parse(e.formula);
              if (e.proof) {
                const lines = [
                  ...e.proof.premises.map((f) => ({ depth: 0, formula: f, rule: 'Prém' as const, cites: '' })),
                  ...e.proof.lines.map((x) => ({ depth: x.d, formula: x.f, rule: x.r ?? ('' as const), cites: x.c ?? '' })),
                ];
                expect(checkLines(lines).map((s) => s.status), `exemple de preuve dans ${c.id}/${l.id}`).toEqual(lines.map(() => 'ok'));
              }
            });
          });
        }
        [...c.lessons.flatMap((l) => l.exercises), ...(c.test?.exercises ?? [])].forEach(checkExercise);
      });
    }
  });
}
