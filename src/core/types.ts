import type { RuleId } from '../logic/proof';
import type { ModelSpec } from '../logic/semantics';
import type { KripkeSpec, ModalSystem } from '../logic/modal';

// Modèle de contenu. Les fichiers JSON de public/content/ suivent ces types.
// Hiérarchie : module (logique, plus tard métaphysique, scolastique…) > chapitre > leçon > exercice.

export interface ContentIndex {
  modules: ModuleRef[];
}

export interface ModuleRef {
  id: string;
  title: string;
  description?: string;
  /** Noms des fichiers de chapitre dans public/content/<id>/, dans l'ordre du parcours. */
  chapters: string[];
}

export interface Module extends Omit<ModuleRef, 'chapters'> {
  chapters: Chapter[];
}

export interface Chapter {
  id: string;
  title: string;
  summary: string;
  /** Touches du clavier de symboles proposées dans ce chapitre. */
  symbols?: string[];
  lessons: Lesson[];
  test?: ChapterTest;
}

export interface ChapterTest {
  /** Nombre de questions tirées (défaut : 10). */
  size?: number;
  /** Précision requise pour maîtriser le chapitre (défaut : 0,85). */
  threshold?: number;
  /** Questions propres au test, ajoutées au tirage parmi les leçons. */
  exercises?: Exercise[];
}

export interface Lesson {
  id: string;
  title: string;
  /** Fiches de cours montrées avant les exercices et regroupées dans la page « Cours ». */
  cours: CourseCard[];
  exercises: Exercise[];
}

export interface CourseCard {
  title: string;
  /** Mini-balisage : paragraphes séparés par une ligne vide, **gras**, *italique*, `formule`, listes « - ». */
  body: string;
  examples?: { formula?: string; text?: string; note?: string; proof?: { premises: string[]; lines: ProofTemplateLine[] } }[];
}

interface ExerciseBase {
  /** Identifiant unique dans le module (sert à la répétition espacée : ne pas le changer). */
  id: string;
  explanation?: string;
}

export interface McqExercise extends ExerciseBase {
  type: 'mcq';
  prompt: string;
  choices: string[];
  /** Index de la bonne réponse (à partir de 0). */
  answer: number;
  /** Afficher les choix en police de formule. */
  formulas?: boolean;
}

export interface FormulaExercise extends ExerciseBase {
  type: 'formula';
  prompt: string;
  /** Une formule de référence : toute réponse équivalente est acceptée. */
  answer: string;
  /** Connecteurs interdits dans la réponse, ex. ["∧"]. */
  forbid?: string[];
  /** Connecteurs que la réponse doit contenir. */
  require?: string[];
  /** Exiger une forme où ¬ ne porte que sur des lettres (pas de ¬ devant une parenthèse). */
  negationOnAtoms?: boolean;
  legend?: Record<string, string>;
}

export interface FormalizeExercise extends ExerciseBase {
  type: 'formalize';
  sentence: string;
  legend: Record<string, string>;
  answer: string;
}

export interface TruthTableExercise extends ExerciseBase {
  type: 'truthtable';
  prompt?: string;
  formula: string;
  /** Colonnes à remplir, dans l'ordre ; la dernière est en général la formule entière. */
  columns?: string[];
}

export interface ValuationExercise extends ExerciseBase {
  type: 'valuation';
  prompt?: string;
  premises: string[];
  conclusion: string;
}

/** Ligne de preuve écrite dans le contenu : profondeur, formule, règle, citations. */
export interface ProofTemplateLine {
  d: number;
  f: string;
  r?: RuleId;
  c?: string;
}

export interface ProofExercise extends ExerciseBase {
  type: 'proof';
  prompt?: string;
  premises: string[];
  conclusion: string;
  /** Règles proposées dans le menu (défaut : toutes). */
  rules?: RuleId[];
  /**
   * Lignes déjà écrites après les prémisses. Une ligne sans règle (`r`) est à justifier par l'élève ;
   * une ligne avec règle est entièrement donnée.
   */
  given?: ProofTemplateLine[];
  /** Avec `given` : l'élève ne fait que justifier, sans ajouter de lignes. */
  justifyOnly?: boolean;
  /** Une preuve modèle (lignes après les prémisses), montrée en cas d'erreur et vérifiée par les tests. */
  solution: ProofTemplateLine[];
}

/** Dire si des énoncés sont vrais ou faux dans un modèle donné. */
export interface ModelTruthExercise extends ExerciseBase {
  type: 'modeltruth';
  prompt?: string;
  model: ModelSpec;
  sentences: string[];
}

/** Construire un modèle où certains énoncés sont vrais et d'autres faux (contre-modèle). */
export interface BuildModelExercise extends ExerciseBase {
  type: 'buildmodel';
  prompt?: string;
  true: string[];
  false: string[];
  /** Taille maximale du domaine proposée (défaut : 3). */
  maxSize?: number;
}

/** Dire si des formules modales sont vraies à un monde d'un modèle de Kripke donné. */
export interface KripkeTruthExercise extends ExerciseBase {
  type: 'kripketruth';
  prompt?: string;
  model: KripkeSpec;
  /** Monde d'évaluation. */
  world: string;
  sentences: string[];
}

/** Construire un modèle de Kripke (mondes, accès, valuation) : au monde w1, `true` vraies et `false` fausses. */
export interface KripkeBuildExercise extends ExerciseBase {
  type: 'kripkebuild';
  prompt?: string;
  true: string[];
  false: string[];
  /** Le cadre doit appartenir à ce système (défaut : K, aucune contrainte). */
  system?: ModalSystem;
  /** Nombre maximal de mondes (défaut : 3). */
  maxWorlds?: number;
}

export type Exercise =
  | KripkeTruthExercise
  | KripkeBuildExercise
  | McqExercise
  | FormulaExercise
  | FormalizeExercise
  | TruthTableExercise
  | ValuationExercise
  | ProofExercise
  | ModelTruthExercise
  | BuildModelExercise;

export type ExerciseType = Exercise['type'];
