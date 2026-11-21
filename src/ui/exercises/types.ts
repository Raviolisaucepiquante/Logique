import type { Exercise } from '../../core/types';

export type CheckOutcome =
  | { kind: 'invalid'; message: string }
  | {
    kind: 'graded';
    correct: boolean;
    /** Bonne réponse à afficher en cas d'erreur (nœud DOM ou texte). */
    solution?: Node | string;
    /** Précision sur l'erreur (contre-exemple, case fausse…). */
    detail?: string;
  };

export interface ExerciseContext {
  /** Prévenir le lecteur que l'état « prêt à vérifier » a pu changer. */
  onChange: () => void;
  symbols: string[];
}

export interface ExerciseView {
  el: HTMLElement;
  /** Vrai quand l'élève a donné une réponse complète. */
  ready(): boolean;
  check(): CheckOutcome;
  /** Fige la saisie après correction. */
  lock(): void;
  /** Élément à mettre au point au démarrage (champ de saisie). */
  focus?(): void;
}

export type ExerciseFactory<E extends Exercise = Exercise> = (ex: E, ctx: ExerciseContext) => ExerciseView;
