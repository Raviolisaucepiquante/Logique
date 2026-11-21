// Écrans hors leçon : chemin des leçons, page de cours, révision et carnet d'erreurs, réglages.
import { chapterKey, type Catalog } from '../core/content';
import { today } from '../core/dates';
import {
  currentStreak, dueKeys, exportProgress, importProgress, isChapterMastered, isChapterUnlocked,
  isLessonCompleted, isLessonUnlocked, isTestUnlocked, resetProgress, save, state, unresolvedErrorKeys,
} from '../core/progress';
import type { Chapter, Exercise, Module } from '../core/types';
import { pretty } from '../logic/formula';
import { formula, h, icon } from './dom';
import { courseCard } from './player';

export interface Nav {
  go: (hash: string) => void;
}

function topBar(catalog: Catalog, active: 'path' | 'review' | 'settings', nav: Nav): HTMLElement {
  const due = dueKeys(catalog).length;
  const link = (id: typeof active, label: string, hash: string, badge?: number) => h('a', {
    href: hash,
    class: `nav-link ${active === id ? 'active' : ''}`,
    onclick: (e: Event) => { e.preventDefault(); nav.go(hash); },
  }, label, badge ? h('span', { class: 'badge' }, badge) : null);

  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-inner' },
      h('a', { href: '#/', class: 'brand', onclick: (e: Event) => { e.preventDefault(); nav.go('#/'); } }, 'Logique'),
      h('nav', { class: 'nav' },
        link('path', 'Parcours', '#/'),
        link('review', 'Révision', '#/revision', due),
        link('settings', 'Réglages', '#/reglages'),
      ),
      h('div', { class: 'meta', title: 'Série de jours · points d\'expérience' },
        h('span', { class: `streak ${currentStreak() ? 'on' : ''}` }, icon('flame'), currentStreak()),
        h('span', { class: 'xp' }, `${state.xp} XP`),
      ),
    ),
  );
}

function page(catalog: Catalog, active: 'path' | 'review' | 'settings', nav: Nav, ...content: (Node | null)[]): HTMLElement {
  return h('div', { class: 'app' }, topBar(catalog, active, nav), h('main', { class: 'page' }, ...content));
}

// --- Chemin --------------------------------------------------------------------

function chapterBlock(m: Module, c: Chapter, ci: number, nav: Nav): HTMLElement {
  const unlocked = isChapterUnlocked(m, ci);
  const mastered = isChapterMastered(m, c);
  const nodes: HTMLElement[] = [];

  c.lessons.forEach((l, li) => {
    const done = isLessonCompleted(m, c, l.id);
    const open = isLessonUnlocked(m, ci, li);
    const cls = done ? 'done' : open ? 'open' : 'locked';
    nodes.push(h('div', { class: `node-wrap off-${li % 4}` },
      h('button', {
        type: 'button',
        class: `node ${cls}`,
        disabled: !open,
        'aria-label': `${l.title}${done ? ' (terminée)' : open ? '' : ' (verrouillée)'}`,
        onclick: () => nav.go(`#/lecon/${m.id}/${c.id}/${l.id}`),
      }, icon(done ? 'check' : open ? 'play' : 'lock')),
      h('span', { class: 'node-label' }, l.title),
    ));
  });

  const testOpen = isTestUnlocked(m, ci);
  const best = state.chapters[chapterKey(m.id, c.id)]?.bestScore;
  nodes.push(h('div', { class: 'node-wrap off-test' },
    h('button', {
      type: 'button',
      class: `node node-test ${mastered ? 'done' : testOpen ? 'open' : 'locked'}`,
      disabled: !testOpen,
      'aria-label': 'Test du chapitre',
      onclick: () => nav.go(`#/test/${m.id}/${c.id}`),
    }, icon(mastered ? 'star' : testOpen ? 'star' : 'lock')),
    h('span', { class: 'node-label' }, mastered ? 'Chapitre maîtrisé' : 'Test du chapitre',
      best !== undefined && !mastered ? h('small', null, ` · meilleur : ${Math.round(best * 100)} %`) : null),
  ));

  return h('section', { class: `chapter ${unlocked ? '' : 'is-locked'} ${mastered ? 'is-mastered' : ''}` },
    h('div', { class: 'chapter-head' },
      h('div', null,
        h('p', { class: 'kicker' }, `Chapitre ${ci}`),
        h('h2', null, c.title),
        h('p', { class: 'chapter-summary' }, c.summary),
      ),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost btn-small',
        disabled: !unlocked,
        onclick: () => nav.go(`#/cours/${m.id}/${c.id}`),
      }, icon('book'), 'Cours'),
    ),
    unlocked ? null : h('p', { class: 'lock-note' }, icon('lock'), 'Maîtrise le chapitre précédent pour débloquer celui-ci.'),
    h('div', { class: 'path' }, ...nodes),
  );
}

export function pathScreen(catalog: Catalog, nav: Nav): HTMLElement {
  const due = dueKeys(catalog).length;
  return page(catalog, 'path', nav,
    due ? h('a', {
      href: '#/revision',
      class: 'review-callout',
      onclick: (e: Event) => { e.preventDefault(); nav.go('#/revision'); },
    }, `${due} exercice${due > 1 ? 's' : ''} à revoir aujourd'hui`, h('span', { class: 'arrow' }, '→')) : null,
    ...catalog.modules.map((m) => h('div', { class: 'module' },
      catalog.modules.length > 1 ? h('h1', { class: 'module-title' }, m.title) : null,
      ...m.chapters.map((c, ci) => chapterBlock(m, c, ci, nav)),
    )),
  );
}

// --- Cours ---------------------------------------------------------------------

export function courseScreen(catalog: Catalog, m: Module, c: Chapter, nav: Nav): HTMLElement {
  return page(catalog, 'path', nav,
    h('div', { class: 'course-page' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-small back', onclick: () => nav.go('#/') }, icon('back'), 'Parcours'),
      h('p', { class: 'kicker' }, m.title),
      h('h1', null, c.title),
      h('p', { class: 'chapter-summary' }, c.summary),
      ...c.lessons.map((l) => h('section', { class: 'course-lesson' },
        h('h2', { class: 'course-lesson-title' }, l.title),
        ...l.cours.map(courseCard),
      )),
    ),
  );
}

// --- Révision et carnet d'erreurs ----------------------------------------------

function exerciseSummary(ex: Exercise): Node {
  switch (ex.type) {
    case 'mcq': case 'formula': return h('span', null, ex.prompt.replace(/`([^`]+)`/g, (_, f: string) => pretty(f)).replace(/\*/g, ''));
    case 'formalize': return h('span', null, `Formaliser : « ${ex.sentence} »`);
    case 'truthtable': return h('span', null, 'Table de vérité de ', formula(ex.formula));
    case 'valuation': return h('span', null, 'Contre-exemple pour ', formula(`${ex.premises.join(', ')}`), ' ∴ ', formula(ex.conclusion));
    case 'modeltruth': return h('span', null, 'Vrai ou faux dans un modèle : ', formula(ex.sentences[0]), ex.sentences.length > 1 ? '…' : '');
    case 'buildmodel': return h('span', null, 'Construire un modèle pour ', formula([...ex.true, ...ex.false].join(', ')));
    case 'kripketruth': return h('span', null, `Vrai ou faux au monde ${ex.world} : `, formula(ex.sentences[0]), ex.sentences.length > 1 ? '…' : '');
    case 'kripkebuild': return h('span', null, 'Construire un modèle de Kripke pour ', formula([...ex.true, ...ex.false].join(', ')));
    case 'proof': return h('span', null, ex.justifyOnly ? 'Justifier la preuve de ' : 'Démontrer ', formula(`${ex.premises.join(', ')}`), ' ⊢ ', formula(ex.conclusion));
  }
}

function frDate(day: string): string {
  if (day <= today()) return 'aujourd\'hui';
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function reviewScreen(catalog: Catalog, nav: Nav): HTMLElement {
  const due = dueKeys(catalog);
  const errors = unresolvedErrorKeys(catalog);
  const learned = Object.keys(state.srs).filter((k) => catalog.exercises.has(k)).length;
  const graduated = Object.entries(state.srs).filter(([k, i]) => catalog.exercises.has(k) && i.graduated).length;

  const byChapter = new Map<string, string[]>();
  for (const k of errors) {
    const ref = catalog.exercises.get(k)!;
    const title = ref.chapter.title;
    byChapter.set(title, [...(byChapter.get(title) ?? []), k]);
  }

  return page(catalog, 'review', nav,
    h('section', { class: 'panel' },
      h('h1', null, 'Révision'),
      h('p', { class: 'muted' }, 'Chaque exercice réussi revient à J+1, J+3, J+7, J+14 puis J+30. Une erreur le ramène à J+1. Les révisions mélangent les chapitres.'),
      h('div', { class: 'stats stats-inline' },
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, due.length), h('span', { class: 'stat-label' }, 'à revoir aujourd\'hui')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, learned), h('span', { class: 'stat-label' }, 'exercices suivis')),
        h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, graduated), h('span', { class: 'stat-label' }, 'acquis durablement')),
      ),
      due.length
        ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => nav.go('#/session/revision') }, `Commencer la révision (${Math.min(due.length, 12)})`)
        : h('p', { class: 'empty' }, learned ? 'Rien à revoir aujourd\'hui. Reviens demain !' : 'Termine une leçon : ses exercices viendront ensuite en révision.'),
    ),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h2', null, 'Carnet d\'erreurs'),
        errors.length ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => nav.go('#/session/erreurs') }, `Réviser mes erreurs (${Math.min(errors.length, 10)})`) : null,
      ),
      h('p', { class: 'muted' }, 'Un exercice sort du carnet après deux révisions réussies d\'affilée.'),
      errors.length
        ? h('div', null, ...[...byChapter.entries()].map(([title, keys]) => h('div', { class: 'error-group' },
          h('h3', null, title),
          h('ul', { class: 'error-list' }, ...keys.map((k) => {
            const ref = catalog.exercises.get(k)!;
            const e = state.errors[k];
            return h('li', null,
              h('span', { class: 'error-text' }, exerciseSummary(ref.exercise)),
              h('span', { class: 'error-meta' }, `${e.count} erreur${e.count > 1 ? 's' : ''} · à revoir ${frDate(state.srs[k]?.due ?? today())}`),
            );
          })),
        )))
        : h('p', { class: 'empty' }, 'Aucune erreur en attente.'),
    ),
  );
}

// --- Réglages ------------------------------------------------------------------

function toggle(label: string, desc: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch', checked: value, onchange: () => onChange(input.checked) });
  return h('label', { class: 'setting' }, h('span', null, h('strong', null, label), h('small', null, desc)), input);
}

export function settingsScreen(catalog: Catalog, nav: Nav, rerender: () => void): HTMLElement {
  const file = h('input', {
    type: 'file',
    accept: 'application/json',
    class: 'visually-hidden',
    onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      try { importProgress(await f.text()); rerender(); alert('Progression importée.'); } catch (e) { alert(`Import impossible : ${(e as Error).message}`); }
    },
  });

  return page(catalog, 'settings', nav,
    h('section', { class: 'panel' },
      h('h1', null, 'Réglages'),
      toggle('Cœurs', 'Cinq cœurs par leçon ; on en perd un à chaque erreur.', state.settings.hearts, (v) => { state.settings.hearts = v; save(); }),
      toggle('Tout débloquer', 'Accéder librement à tous les chapitres et leçons, sans condition de maîtrise.', state.settings.unlockAll, (v) => { state.settings.unlockAll = v; save(); }),
    ),
    h('section', { class: 'panel' },
      h('h2', null, 'Sauvegarde'),
      h('p', { class: 'muted' }, 'La progression est enregistrée dans ce navigateur. Exporte-la pour la transférer ou la garder.'),
      h('div', { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn btn-ghost btn-small',
          onclick: () => {
            const blob = new Blob([exportProgress()], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `logique-progression-${today()}.json` });
            a.click();
            URL.revokeObjectURL(a.href);
          },
        }, 'Exporter'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => file.click() }, 'Importer'),
        file,
        h('button', {
          type: 'button',
          class: 'btn btn-danger btn-small',
          onclick: () => {
            if (confirm('Effacer toute la progression (XP, leçons, révisions, carnet) ? Cette action est définitive.')) { resetProgress(); rerender(); }
          },
        }, 'Tout effacer'),
      ),
    ),
  );
}

