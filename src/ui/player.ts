// Lecteur de leçon : fiches de cours, puis une question par écran avec « Vérifier »,
// bandeau vert ou rouge, barre de progression, cœurs, reprises en fin de leçon, écran final.
import { recordAnswer, save } from '../core/progress';
import { Session, type SessionItem } from '../core/session';
import type { CourseCard } from '../core/types';
import { clear, formula, h, icon, markup } from './dom';
import { renderExercise, type ExerciseView } from './exercises';
import { staticProof } from './proofview';

export const HEARTS = 5;

export interface EndInfo {
  success: boolean;
  headline: string;
  message?: string;
  xp: number;
}

export interface PlayerConfig {
  mode: 'lesson' | 'test' | 'review';
  cards: CourseCard[];
  items: SessionItem[];
  hearts: boolean;
  symbolsFor: (key: string) => string[];
  /** Appelé quand la session se termine normalement ; enregistre et renvoie le texte de fin. */
  onComplete: (s: Session) => EndInfo;
  onExit: () => void;
  /** Recommencer après avoir perdu tous les cœurs. */
  onRestart: () => void;
}

export function courseCard(card: CourseCard): HTMLElement {
  return h('article', { class: 'card-cours' },
    h('h2', null, card.title),
    markup(card.body),
    card.examples?.length
      ? h('div', { class: 'examples' }, ...card.examples.map((e) => h('div', { class: 'example' },
        e.text ? h('p', { class: 'ex-text' }, e.text) : null,
        e.formula ? h('p', { class: 'ex-formula' }, formula(e.formula)) : null,
        e.proof ? staticProof(e.proof.premises, e.proof.lines) : null,
        e.note ? h('p', { class: 'ex-note' }, e.note) : null,
      )))
      : null,
  );
}

export function playSession(root: HTMLElement, cfg: PlayerConfig): () => void {
  const session = new Session(cfg.items, {
    retryMistakes: cfg.mode !== 'test',
    hearts: cfg.hearts ? HEARTS : null,
  });

  const bar = h('div', { class: 'progress-fill' });
  const heartsEl = h('div', { class: 'hearts', title: 'Cœurs restants' });
  const stage = h('main', { class: 'stage' });
  const footer = h('footer', { class: 'player-footer' });
  const exitBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Quitter', onclick: () => exit() }, icon('close'));

  const player = h('div', { class: 'player' },
    h('header', { class: 'player-top' }, exitBtn, h('div', { class: 'progress', role: 'progressbar' }, bar), heartsEl),
    stage,
    footer,
  );
  clear(root);
  root.append(player);

  let onEnter: (() => void) | null = null;
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); }
    if (e.key === 'Escape') exit();
  };
  document.addEventListener('keydown', keyHandler);
  const dispose = () => document.removeEventListener('keydown', keyHandler);

  let inProgress = true;
  function exit() {
    if (inProgress && (session.progress > 0 || cardIndex > 0) &&
      !confirm('Quitter ? Ta progression dans cette leçon sera perdue (les erreurs restent dans ton carnet).')) return;
    dispose();
    cfg.onExit();
  }

  function renderHearts() {
    clear(heartsEl);
    if (session.hearts === null) return;
    heartsEl.append(icon('heart', 'heart-icon'), h('span', null, session.hearts));
  }

  function setProgress() {
    bar.style.width = `${Math.round(session.progress * 100)}%`;
  }

  function transition(content: HTMLElement) {
    clear(stage);
    content.classList.add('enter');
    stage.append(content);
    stage.scrollTop = 0;
  }

  function primaryButton(label: string, action: () => void, enabled = true): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'btn btn-primary', onclick: () => action() }, label);
    b.disabled = !enabled;
    return b;
  }

  // --- Fiches de cours ---------------------------------------------------------
  let cardIndex = 0;
  function showCard() {
    const card = cfg.cards[cardIndex];
    transition(h('div', { class: 'cours-screen' },
      h('p', { class: 'kicker' }, `Cours · ${cardIndex + 1}/${cfg.cards.length}`),
      courseCard(card),
    ));
    clear(footer);
    footer.className = 'player-footer';
    const next = () => { cardIndex++; if (cardIndex < cfg.cards.length) showCard(); else showQuestion(); };
    footer.append(h('div', { class: 'footer-inner' },
      h('span', null),
      primaryButton(cardIndex < cfg.cards.length - 1 ? 'Continuer' : 'Aux exercices', next),
    ));
    onEnter = next;
  }

  // --- Questions ---------------------------------------------------------------
  let view: ExerciseView;
  function showQuestion() {
    setProgress();
    renderHearts();
    const item = session.current!;
    const checkBtn = primaryButton('Vérifier', () => check(), false);
    // La vue peut signaler un changement pendant sa construction : on ne lit son état qu'une fois créée.
    let created: ExerciseView | null = null;
    view = renderExercise(item.exercise, {
      symbols: cfg.symbolsFor(item.key),
      onChange: () => { if (created) checkBtn.disabled = !created.ready(); },
    });
    created = view;
    checkBtn.disabled = !view.ready();
    transition(h('div', { class: 'question' },
      session.isRetry ? h('p', { class: 'kicker retry' }, 'Question ratée : nouvel essai') : null,
      view.el,
    ));
    clear(footer);
    footer.className = 'player-footer';
    footer.append(h('div', { class: 'footer-inner' }, h('span', null), checkBtn));
    onEnter = () => { if (view.ready()) check(); };
    view.focus?.();
  }

  function check() {
    const item = session.current!;
    const out = view.check();
    if (out.kind === 'invalid') {
      view.el.classList.remove('shake');
      void view.el.offsetWidth;
      view.el.classList.add('shake');
      return;
    }
    const firstAttempt = !session.isRetry;
    session.answer(out.correct);
    if (firstAttempt) {
      recordAnswer(item.key, out.correct, cfg.mode === 'review' ? 'review' : 'lesson');
      save();
    }
    view.lock();
    renderHearts();
    if (!out.correct) heartsEl.classList.add('lost');
    setTimeout(() => heartsEl.classList.remove('lost'), 500);

    const ex = item.exercise;
    const banner = h('div', { class: `footer-inner banner ${out.correct ? 'ok' : 'bad'}` },
      h('div', { class: 'banner-text' },
        h('p', { class: 'banner-title' }, icon(out.correct ? 'check' : 'close'), out.correct ? 'Correct' : 'Pas tout à fait'),
        !out.correct && out.solution ? h('p', { class: 'banner-solution' }, 'Bonne réponse : ', out.solution) : null,
        out.detail ? h('p', { class: 'banner-detail' }, out.detail) : null,
        ex.explanation ? h('p', { class: 'banner-expl' }, ex.explanation) : null,
      ),
      primaryButton('Continuer', () => advance(out.correct)),
    );
    clear(footer);
    footer.className = `player-footer has-banner ${out.correct ? 'ok' : 'bad'}`;
    footer.append(banner);
    onEnter = () => advance(out.correct);
  }

  function advance(lastCorrect: boolean) {
    session.next(lastCorrect);
    setProgress();
    if (session.outOfHearts) return showOutOfHearts();
    if (session.done) return showEnd();
    showQuestion();
  }

  // --- Fin -----------------------------------------------------------------------
  function stat(label: string, value: string, cls = '') {
    return h('div', { class: `stat ${cls}`.trim() }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
  }

  function showEnd() {
    inProgress = false;
    const info = cfg.onComplete(session);
    transition(h('div', { class: `end-screen ${info.success ? 'success' : 'retry'}` },
      h('div', { class: 'end-badge' }, icon(info.success ? 'star' : 'book')),
      h('h1', null, info.headline),
      info.message ? h('p', { class: 'end-message' }, info.message) : null,
      h('div', { class: 'stats' },
        stat('XP gagnés', `+${info.xp}`, 'xp'),
        stat('Précision', `${Math.round(session.accuracy * 100)} %`),
      ),
    ));
    clear(footer);
    footer.className = 'player-footer';
    const done = () => { dispose(); cfg.onExit(); };
    footer.append(h('div', { class: 'footer-inner' }, h('span', null), primaryButton('Continuer', done)));
    onEnter = done;
  }

  function showOutOfHearts() {
    inProgress = false;
    transition(h('div', { class: 'end-screen retry' },
      h('div', { class: 'end-badge' }, icon('heart')),
      h('h1', null, 'Plus de cœurs'),
      h('p', { class: 'end-message' }, 'Tes erreurs sont notées dans le carnet. Relis le cours et recommence : c\'est en se trompant qu\'on retient.'),
    ));
    clear(footer);
    footer.className = 'player-footer';
    const restart = () => { dispose(); cfg.onRestart(); };
    footer.append(h('div', { class: 'footer-inner' },
      h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { dispose(); cfg.onExit(); } }, 'Quitter'),
      primaryButton('Recommencer', restart),
    ));
    onEnter = restart;
  }

  renderHearts();
  setProgress();
  if (cfg.cards.length) showCard(); else showQuestion();
  return dispose;
}
