import './styles.css';
import { exerciseKey, lessonKey, chapterKey, loadCatalog, type Catalog } from './core/content';
import {
  completeLesson, completeReview, completeTest, DEFAULT_THRESHOLD, dueKeys, isLessonCompleted,
  isLessonUnlocked, isTestUnlocked, state, unresolvedErrorKeys,
} from './core/progress';
import { shuffle, type SessionItem } from './core/session';
import { clear, h } from './ui/dom';
import { DEFAULT_SYMBOLS } from './ui/keyboard';
import { playSession, type PlayerConfig } from './ui/player';
import { courseScreen, pathScreen, reviewScreen, settingsScreen, type Nav } from './ui/screens';
import { initPwa, onPwaChange } from './ui/pwa';

const root = document.getElementById('app')!;
let catalog: Catalog;

// Route courante, gardée en mémoire : la navigation marche même là où l'adresse ne peut pas
// changer (fichier ouvert dans certains aperçus). L'adresse est mise à jour quand c'est possible.
let route = location.hash || '#/';

const nav: Nav = {
  go: (hash) => {
    route = hash;
    try {
      if (location.hash !== hash) history.pushState(null, '', hash);
    } catch {
      /* adresse non modifiable : on continue avec la route en mémoire */
    }
    render();
  },
};

function syncFromLocation() {
  route = location.hash || '#/';
  render();
}

function show(el: HTMLElement) {
  clear(root);
  root.append(el);
  window.scrollTo(0, 0);
}

function symbolsFor(key: string): string[] {
  return catalog.exercises.get(key)?.chapter.symbols ?? DEFAULT_SYMBOLS;
}

function play(cfg: Omit<PlayerConfig, 'symbolsFor' | 'onExit' | 'onRestart'>) {
  playSession(root, {
    ...cfg,
    symbolsFor,
    onExit: () => nav.go('#/'),
    onRestart: () => render(),
  });
}

function findChapter(mId: string, cId: string) {
  const m = catalog.modules.find((x) => x.id === mId);
  const ci = m?.chapters.findIndex((x) => x.id === cId) ?? -1;
  return m && ci >= 0 ? { m, c: m.chapters[ci], ci } : null;
}

function startLesson(mId: string, cId: string, lId: string) {
  const found = findChapter(mId, cId);
  const li = found?.c.lessons.findIndex((l) => l.id === lId) ?? -1;
  if (!found || li < 0 || !isLessonUnlocked(found.m, found.ci, li)) return nav.go('#/');
  const { m, c } = found;
  const lesson = c.lessons[li];
  const key = lessonKey(m.id, c.id, lesson.id);
  const alreadyDone = isLessonCompleted(m, c, lesson.id);
  play({
    mode: 'lesson',
    // Le cours précède les exercices la première fois ; ensuite on passe directement à la pratique.
    cards: alreadyDone ? [] : lesson.cours,
    items: lesson.exercises.map((exercise) => ({ key: exerciseKey(m.id, exercise.id), exercise })),
    hearts: state.settings.hearts,
    onComplete: (s) => {
      const xp = s.xp();
      completeLesson(key, s.accuracy, xp);
      return {
        success: true,
        headline: 'Leçon terminée',
        message: s.accuracy === 1 ? 'Sans faute !' : 'Les questions ratées reviendront en révision dès demain.',
        xp,
      };
    },
  });
}

function startTest(mId: string, cId: string) {
  const found = findChapter(mId, cId);
  if (!found || !isTestUnlocked(found.m, found.ci)) return nav.go('#/');
  const { m, c } = found;
  const size = c.test?.size ?? 10;
  const threshold = c.test?.threshold ?? DEFAULT_THRESHOLD;
  const own = (c.test?.exercises ?? []).map((exercise) => ({ key: exerciseKey(m.id, exercise.id), exercise }));
  const fromLessons = shuffle(c.lessons.flatMap((l) => l.exercises.map((exercise) => ({ key: exerciseKey(m.id, exercise.id), exercise }))));
  const items = shuffle([...own, ...fromLessons].slice(0, Math.max(size, own.length)));
  play({
    mode: 'test',
    cards: [],
    items,
    hearts: false,
    onComplete: (s) => {
      const passed = s.accuracy >= threshold;
      const xp = s.firstTryCorrect + (passed ? 20 : 0);
      completeTest(chapterKey(m.id, c.id), s.accuracy, threshold, xp);
      return passed
        ? { success: true, headline: 'Chapitre maîtrisé', message: 'Le chapitre suivant est débloqué.', xp }
        : { success: false, headline: 'Pas encore maîtrisé', message: `Il faut ${Math.round(threshold * 100)} % de bonnes réponses du premier coup. Revois tes erreurs, puis retente le test.`, xp };
    },
  });
}

function startReview(kind: 'revision' | 'erreurs') {
  const keys = kind === 'revision' ? dueKeys(catalog).slice(0, 12) : unresolvedErrorKeys(catalog).slice(0, 10);
  if (!keys.length) return nav.go('#/revision');
  const items: SessionItem[] = shuffle(keys).map((key) => ({ key, exercise: catalog.exercises.get(key)!.exercise }));
  play({
    mode: 'review',
    cards: [],
    items,
    hearts: false,
    onComplete: (s) => {
      const xp = 5 + s.firstTryCorrect;
      completeReview(xp);
      return { success: true, headline: 'Révision terminée', message: 'Chaque exercice réussi s\'espace davantage ; chaque erreur reviendra demain.', xp };
    },
  });
}

function render() {
  const parts = route.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [page, a, b, c] = parts;
  switch (page) {
    case 'lecon': return startLesson(a, b, c);
    case 'test': return startTest(a, b);
    case 'session': return startReview(a === 'erreurs' ? 'erreurs' : 'revision');
    // Développement seulement : #/demo/<module>/<id d'exercice> ouvre un exercice isolé.
    case 'demo': {
      const ref = import.meta.env.DEV ? catalog.exercises.get(`${a}/${b}`) : undefined;
      if (!ref) return nav.go('#/');
      return play({ mode: 'review', cards: [], items: [{ key: ref.key, exercise: ref.exercise }], hearts: false, onComplete: (s) => ({ success: true, headline: 'Démo', xp: s.xp() }) });
    }
    case 'cours': {
      const found = findChapter(a, b);
      return found ? show(courseScreen(catalog, found.m, found.c, nav)) : nav.go('#/');
    }
    case 'revision': return show(reviewScreen(catalog, nav));
    case 'reglages': return show(settingsScreen(catalog, nav, render));
    default: return show(pathScreen(catalog, nav));
  }
}

async function boot() {
  try {
    catalog = await loadCatalog();
  } catch (e) {
    show(h('div', { class: 'page' }, h('p', { class: 'empty' }, `Le contenu n'a pas pu être chargé : ${(e as Error).message}`)));
    return;
  }
  initPwa();
  onPwaChange(() => { if (route === '#/reglages') render(); });
  window.addEventListener('hashchange', syncFromLocation);
  window.addEventListener('popstate', syncFromLocation);
  render();
}

boot();
