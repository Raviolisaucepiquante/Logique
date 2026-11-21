// Registre des types d'exercices. Pour ajouter un type (preuve, contre-modèle de Kripke…) :
// 1. déclarer son interface dans core/types.ts ; 2. écrire sa vue ; 3. l'inscrire ici.
import type { Exercise, ExerciseType } from '../../core/types';
import { formulaView } from './formula';
import { kripkeBuildView, kripkeTruthView } from './kripke';
import { mcqView } from './mcq';
import { buildModelView, modelTruthView } from './models';
import { proofView } from './proof';
import { truthTableView } from './truthtable';
import type { ExerciseContext, ExerciseFactory, ExerciseView } from './types';
import { valuationView } from './valuation';

const registry: Record<ExerciseType, ExerciseFactory<never>> = {
  mcq: mcqView,
  formula: formulaView,
  formalize: formulaView,
  truthtable: truthTableView,
  valuation: valuationView,
  proof: proofView,
  modeltruth: modelTruthView,
  buildmodel: buildModelView,
  kripketruth: kripkeTruthView,
  kripkebuild: kripkeBuildView,
};

export function renderExercise(ex: Exercise, ctx: ExerciseContext): ExerciseView {
  const factory = registry[ex.type] as ExerciseFactory<Exercise> | undefined;
  if (!factory) throw new Error(`Type d'exercice inconnu : ${(ex as { type: string }).type}`);
  return factory(ex, ctx);
}

export type { CheckOutcome, ExerciseView } from './types';
