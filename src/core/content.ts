// Chargement du contenu (fichiers JSON de public/content/) et index des exercices.
import type { Chapter, ContentIndex, Exercise, Lesson, Module } from './types';

export interface ExerciseRef {
  key: string;
  exercise: Exercise;
  module: Module;
  chapter: Chapter;
  lesson?: Lesson;
}

export interface Catalog {
  modules: Module[];
  exercises: Map<string, ExerciseRef>;
}

export const exerciseKey = (moduleId: string, exId: string) => `${moduleId}/${exId}`;
export const lessonKey = (moduleId: string, chapterId: string, lessonId: string) => `${moduleId}/${chapterId}/${lessonId}`;
export const chapterKey = (moduleId: string, chapterId: string) => `${moduleId}/${chapterId}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(import.meta.env.BASE_URL + path);
  if (!res.ok) throw new Error(`Impossible de charger ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export function buildCatalog(modules: Module[]): Catalog {
  const exercises = new Map<string, ExerciseRef>();
  const add = (ref: ExerciseRef) => {
    if (exercises.has(ref.key)) console.warn(`Identifiant d'exercice en double : ${ref.key}`);
    exercises.set(ref.key, ref);
  };
  for (const module of modules) {
    for (const chapter of module.chapters) {
      for (const lesson of chapter.lessons) {
        for (const exercise of lesson.exercises) add({ key: exerciseKey(module.id, exercise.id), exercise, module, chapter, lesson });
      }
      for (const exercise of chapter.test?.exercises ?? []) add({ key: exerciseKey(module.id, exercise.id), exercise, module, chapter });
    }
  }
  return { modules, exercises };
}

/** Contenu intégré par le build autonome (Logique.html), qui s'ouvre sans serveur. */
export interface EmbeddedContent {
  index: ContentIndex;
  /** Clé : « <module>/<fichier> », ex. « logique/ch1 ». */
  chapters: Record<string, Chapter>;
}

declare global {
  interface Window { __LOGIQUE_CONTENT__?: EmbeddedContent }
}

export async function loadCatalog(): Promise<Catalog> {
  const embedded = window.__LOGIQUE_CONTENT__;
  if (embedded) {
    return buildCatalog(embedded.index.modules.map((ref) => ({
      ...ref,
      chapters: ref.chapters.map((file) => embedded.chapters[`${ref.id}/${file}`]),
    })));
  }
  const index = await getJson<ContentIndex>('content/index.json');
  const modules = await Promise.all(index.modules.map(async (ref) => ({
    ...ref,
    chapters: await Promise.all(ref.chapters.map((file) => getJson<Chapter>(`content/${ref.id}/${file}.json`))),
  })));
  return buildCatalog(modules);
}
