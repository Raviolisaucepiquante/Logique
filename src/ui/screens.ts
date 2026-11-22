// Écrans hors leçon : chemin des leçons, page de cours, révision et carnet d'erreurs, réglages.
import { chapterKey, type Catalog } from '../core/content';
import { today } from '../core/dates';
import {
  currentStreak, dueKeys, exportProgress, importProgress, isChapterMastered, isChapterUnlocked,
  isLessonCompleted, isLessonUnlocked, isTestUnlocked, resetProgress, saveSettings, state, totalXpLocal, unresolvedErrorKeys,
} from '../core/progress';
import type { Chapter, Exercise, Module } from '../core/types';
import { pretty } from '../logic/formula';
import { formula, h, icon } from './dom';
import { courseCard } from './player';
import { installState, offlineReady, promptInstall } from './pwa';
import { googleAvailable, signInWithEmail, signInWithGoogle, signOut, syncNow, syncStatus, userEmail } from '../core/sync';

export interface Nav {
  go: (hash: string) => void;
}

type Tab = 'path' | 'review' | 'settings';
const TABS: { id: Tab; label: string; hash: string; icon: string }[] = [
  { id: 'path', label: 'Parcours', hash: '#/', icon: 'map' },
  { id: 'review', label: 'Révision', hash: '#/revision', icon: 'refresh' },
  { id: 'settings', label: 'Réglages', hash: '#/reglages', icon: 'gear' },
];

/** Liens de navigation : en haut sur grand écran, en barre d'onglets en bas sur téléphone. */
function navLinks(catalog: Catalog, active: Tab, nav: Nav, cls: string): HTMLElement {
  const due = dueKeys(catalog).length;
  return h('nav', { class: cls, 'aria-label': 'Navigation principale' }, ...TABS.map((t) => h('a', {
    href: t.hash,
    class: `nav-link ${active === t.id ? 'active' : ''}`,
    'aria-current': active === t.id ? 'page' : null,
    onclick: (e: Event) => { e.preventDefault(); nav.go(t.hash); },
  }, icon(t.icon, 'nav-icon'), h('span', { class: 'nav-label' }, t.label), t.id === 'review' && due ? h('span', { class: 'badge' }, due) : null)));
}

/** Petit nuage dans l'en-tête quand on est connecté : synchronisé, en cours, hors ligne ou en erreur. */
function syncBadge(): HTMLElement | null {
  const s = syncStatus();
  if (s.kind === 'unavailable' || s.kind === 'signed-out') return null;
  const labels = {
    syncing: 'Synchronisation…',
    synced: 'Progression synchronisée',
    offline: 'Hors ligne : synchronisation au retour du réseau',
    error: 'Synchronisation impossible (voir Réglages)',
  };
  const label = labels[s.kind];
  return h('span', { class: `sync-badge ${s.kind}`, title: label, 'aria-label': label }, icon(s.kind === 'offline' || s.kind === 'error' ? 'cloud-off' : 'cloud'));
}

function topBar(catalog: Catalog, active: Tab, nav: Nav): HTMLElement {
  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-inner' },
      h('a', { href: '#/', class: 'brand', onclick: (e: Event) => { e.preventDefault(); nav.go('#/'); } }, 'Logique'),
      navLinks(catalog, active, nav, 'nav'),
      h('div', { class: 'meta', title: 'Série de jours · points d\'expérience' },
        h('span', { class: `streak ${currentStreak() ? 'on' : ''}` }, icon('flame'), currentStreak()),
        h('span', { class: 'xp' }, `${totalXpLocal()} XP`),
        syncBadge(),
      ),
    ),
  );
}

function page(catalog: Catalog, active: Tab, nav: Nav, ...content: (Node | null)[]): HTMLElement {
  return pageWithAside(catalog, active, nav, null, ...content);
}

/** Page avec une colonne latérale, affichée seulement sur grand écran. */
function pageWithAside(catalog: Catalog, active: Tab, nav: Nav, aside: HTMLElement | null, ...content: (Node | null)[]): HTMLElement {
  return h('div', { class: `app ${aside ? 'has-aside' : ''}` },
    topBar(catalog, active, nav),
    h('div', { class: 'layout' },
      h('main', { class: 'page' }, ...content),
      aside ? h('aside', { class: 'aside' }, aside) : null,
    ),
    navLinks(catalog, active, nav, 'tabbar'),
  );
}

function summaryAside(catalog: Catalog, nav: Nav): HTMLElement {
  const due = dueKeys(catalog).length;
  const blocks: HTMLElement[] = [];
  blocks.push(h('section', { class: 'panel aside-card' },
    h('h2', null, "Aujourd'hui"),
    h('div', { class: 'aside-stats' },
      h('div', null, h('strong', null, currentStreak()), h('span', null, 'jours de série')),
      h('div', null, h('strong', null, totalXpLocal()), h('span', null, 'XP')),
      h('div', null, h('strong', null, due), h('span', null, 'à revoir')),
    ),
    due ? h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: () => nav.go('#/session/revision') }, 'Réviser maintenant') : null,
  ));
  for (const m of catalog.modules) {
    const total = m.chapters.reduce((n, c) => n + c.lessons.length, 0);
    const done = m.chapters.reduce((n, c) => n + c.lessons.filter((l) => isLessonCompleted(m, c, l.id)).length, 0);
    blocks.push(h('section', { class: 'panel aside-card' },
      h('h2', null, m.title),
      h('div', { class: 'aside-progress' }, h('div', { class: 'aside-bar', style: `width:${Math.round((done / total) * 100)}%` })),
      h('p', { class: 'muted' }, `${done} leçon${done > 1 ? 's' : ''} sur ${total}`),
      h('ol', { class: 'aside-chapters' }, ...m.chapters.map((c, ci) => {
        const mastered = isChapterMastered(m, c);
        const open = isChapterUnlocked(m, ci);
        return h('li', { class: mastered ? 'mastered' : open ? 'open' : 'locked' },
          icon(mastered ? 'star' : open ? 'play' : 'lock'), h('span', null, c.title));
      })),
    ));
  }
  return h('div', null, ...blocks);
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
  return pageWithAside(catalog, 'path', nav, summaryAside(catalog, nav),
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

function syncLine(): HTMLElement {
  const s = syncStatus();
  const time = (iso: string) => new Date(iso).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  switch (s.kind) {
    case 'syncing': return h('p', { class: 'sync-line' }, icon('refresh', 'spin'), 'Synchronisation en cours…');
    case 'synced': return h('p', { class: 'sync-line ok' }, icon('check'), `Synchronisé (${time(s.at)})`);
    case 'offline': return h('p', { class: 'sync-line' }, icon('cloud-off'), 'Hors ligne : ta progression est enregistrée ici et sera synchronisée au retour du réseau.');
    case 'error': return h('p', { class: 'sync-line bad' }, icon('close'), `Synchronisation impossible : ${s.message}`);
    default: return h('p', { class: 'sync-line' }, '');
  }
}

/** Connexion (optionnelle) et synchronisation entre appareils. */
function accountPanel(): HTMLElement {
  const s = syncStatus();
  const head = h('h2', null, 'Compte et synchronisation');
  if (s.kind === 'unavailable') {
    return h('section', { class: 'panel' }, head,
      h('p', { class: 'muted' }, s.reason === 'file'
        ? "Ce fichier est ouvert depuis le disque : pour synchroniser ta progression, utilise la version en ligne de l'application."
        : "La synchronisation en ligne n'est pas configurée pour cette version. Tout fonctionne sans compte : ta progression reste sur cet appareil."));
  }
  const email = userEmail();
  if (email) {
    return h('section', { class: 'panel' }, head,
      h('p', null, 'Connecté : ', h('strong', null, email)),
      syncLine(),
      h('p', { class: 'muted' }, 'Sur tes autres appareils, connecte-toi avec le même compte : les progressions sont fusionnées (meilleur résultat par exercice, XP additionnés, jours de série réunis).'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => { void syncNow(); } }, icon('refresh'), 'Synchroniser maintenant'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => { void signOut(); } }, 'Se déconnecter'),
      ),
    );
  }
  const msg = h('p', { class: 'auth-msg', role: 'status' });
  const input = h('input', { type: 'email', class: 'text-input', placeholder: 'ton@adresse.fr', autocomplete: 'email', 'aria-label': 'Adresse e-mail' });
  const send = h('button', { type: 'submit', class: 'btn btn-ghost' }, 'Recevoir un lien de connexion');
  const form = h('form', {
    class: 'email-form',
    onsubmit: async (e: Event) => {
      e.preventDefault();
      const value = input.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(value)) { msg.textContent = 'Adresse e-mail invalide.'; return; }
      send.disabled = true;
      msg.className = 'auth-msg';
      msg.textContent = 'Envoi…';
      const err = await signInWithEmail(value);
      send.disabled = false;
      msg.className = `auth-msg ${err ? 'bad' : 'ok'}`;
      msg.textContent = err ?? `Lien envoyé à ${value}. Ouvre-le sur cet appareil pour te connecter (regarde aussi dans les indésirables).`;
    },
  }, input, send);
  return h('section', { class: 'panel' }, head,
    h('p', { class: 'muted' }, 'Optionnel : connecte-toi pour retrouver ta progression sur ton PC et ton téléphone. Sans compte, tout reste sur cet appareil, comme avant.'),
    s.kind === 'error' ? syncLine() : null,
    googleAvailable() ? h('button', { type: 'button', class: 'btn btn-google', onclick: () => { void signInWithGoogle(); } }, googleLogo(), 'Continuer avec Google') : null,
    googleAvailable() ? h('p', { class: 'or' }, 'ou par e-mail') : h('p', { class: 'or' }, 'Connexion par e-mail : tu reçois un lien, sans mot de passe.'),
    form,
    msg,
  );
}

function googleLogo(): HTMLElement {
  return h('span', { class: 'g-logo', 'aria-hidden': 'true', html: '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>' });
}

/** Installation sur l'appareil et mode hors ligne. */
function appPanel(): HTMLElement {
  const st = installState();
  const install = st === 'installed'
    ? h('p', null, icon('check'), " L'application est installée sur cet appareil.")
    : st === 'available'
      ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { void promptInstall(); } }, icon('download'), "Installer l'application")
      : st === 'ios'
        ? h('p', null, "Sur iPhone ou iPad : dans Safari, touche le bouton Partager, puis « Sur l'écran d'accueil ».")
        : h('p', { class: 'muted' }, "Pour l'installer, ouvre l'application depuis son adresse web (https) dans Chrome, Edge ou Safari, puis choisis « Installer » ou « Ajouter à l'écran d'accueil ».");
  return h('section', { class: 'panel' },
    h('h2', null, 'Application'),
    install,
    h('p', { class: 'muted' }, offlineReady()
      ? 'Disponible hors ligne : tout le contenu est enregistré sur cet appareil.'
      : location.protocol === 'file:'
        ? "Fichier ouvert depuis le disque : il fonctionne sans réseau, mais l'installation demande la version en ligne."
        : 'Le mode hors ligne s’active après une première visite en ligne de la version publiée.'),
  );
}

export function settingsScreen(catalog: Catalog, nav: Nav, rerender: () => void): HTMLElement {
  const file = h('input', {
    type: 'file',
    accept: 'application/json',
    class: 'visually-hidden',
    onchange: async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        importProgress(await f.text());
        rerender();
        alert('Sauvegarde importée et fusionnée avec ta progression actuelle (meilleurs résultats conservés).');
      } catch (e) {
        alert(`Import impossible : ${(e as Error).message}`);
      } finally {
        file.value = '';
      }
    },
  });

  return page(catalog, 'settings', nav,
    h('section', { class: 'panel' },
      h('h1', null, 'Réglages'),
      toggle('Cœurs', 'Cinq cœurs par leçon ; on en perd un à chaque erreur.', state.settings.hearts, (v) => { state.settings.hearts = v; saveSettings(); }),
      toggle('Tout débloquer', 'Accéder librement à tous les chapitres et leçons, sans condition de maîtrise.', state.settings.unlockAll, (v) => { state.settings.unlockAll = v; saveSettings(); }),
    ),
    accountPanel(),
    appPanel(),
    h('section', { class: 'panel' },
      h('h2', null, 'Sauvegarde dans un fichier'),
      h('p', { class: 'muted' }, "La progression est toujours enregistrée sur cet appareil. Exporte-la dans un fichier pour la garder en sécurité ; l'import la fusionne avec la progression actuelle, sans rien effacer."),
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
        }, icon('download'), 'Exporter'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => file.click() }, 'Importer'),
        file,
        h('button', {
          type: 'button',
          class: 'btn btn-danger btn-small',
          onclick: () => {
            const k = syncStatus().kind;
            const online = k !== 'signed-out' && k !== 'unavailable';
            const msg = online
              ? "Effacer la progression de cet appareil ? Tu es connecté : la sauvegarde en ligne la restaurera à la prochaine synchronisation. Pour repartir de zéro partout, déconnecte-toi d'abord."
              : 'Effacer toute la progression (XP, leçons, révisions, carnet) ? Cette action est définitive.';
            if (confirm(msg)) { resetProgress(); rerender(); }
          },
        }, 'Tout effacer'),
      ),
    ),
  );
}

