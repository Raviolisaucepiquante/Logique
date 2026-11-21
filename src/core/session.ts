// Déroulement d'une leçon façon Duolingo : une question à la fois, les questions ratées
// reviennent à la fin, cœurs optionnels, calcul des XP et de la précision.
import type { Exercise } from './types';

export interface SessionItem {
  key: string;
  exercise: Exercise;
}

export interface SessionOptions {
  /** Remettre les questions ratées en fin de file (pas dans un test). */
  retryMistakes: boolean;
  /** Nombre de cœurs, ou null si désactivés. */
  hearts: number | null;
}

/** Une question ratée revient au plus deux fois, pour éviter de tourner en rond. */
const MAX_RETRIES = 2;

export class Session {
  private queue: SessionItem[];
  private retries = new Map<string, number>();
  private firstTry = new Map<string, boolean>();
  private finished = new Set<string>();
  readonly total: number;
  hearts: number | null;

  constructor(items: SessionItem[], private opts: SessionOptions) {
    this.queue = [...items];
    this.total = items.length;
    this.hearts = opts.hearts;
  }

  get current(): SessionItem | undefined {
    return this.queue[0];
  }

  /** Vrai si la question courante est une reprise d'une question ratée. */
  get isRetry(): boolean {
    const c = this.current;
    return !!c && this.firstTry.has(c.key);
  }

  get progress(): number {
    return this.total ? this.finished.size / this.total : 1;
  }

  get outOfHearts(): boolean {
    return this.hearts !== null && this.hearts <= 0;
  }

  get done(): boolean {
    return this.queue.length === 0 || this.outOfHearts;
  }

  /** Enregistre la réponse à la question courante (sans encore passer à la suivante). */
  answer(correct: boolean): void {
    const item = this.current;
    if (!item) return;
    if (!this.firstTry.has(item.key)) this.firstTry.set(item.key, correct);
    if (!correct && this.hearts !== null) this.hearts = Math.max(0, this.hearts - 1);
  }

  /** Passe à la question suivante ; une question ratée est remise en fin de file. */
  next(lastCorrect: boolean): void {
    const item = this.queue.shift();
    if (!item) return;
    const n = this.retries.get(item.key) ?? 0;
    if (!lastCorrect && this.opts.retryMistakes && n < MAX_RETRIES) {
      this.retries.set(item.key, n + 1);
      this.queue.push(item);
    } else {
      this.finished.add(item.key);
    }
  }

  /** Part des questions réussies du premier coup. */
  get accuracy(): number {
    if (!this.total) return 1;
    let ok = 0;
    this.firstTry.forEach((v) => { if (v) ok++; });
    return ok / this.total;
  }

  get firstTryCorrect(): number {
    let ok = 0;
    this.firstTry.forEach((v) => { if (v) ok++; });
    return ok;
  }

  /** XP : 10 pour la leçon terminée, +1 par bonne réponse du premier coup, +5 si sans faute. */
  xp(): number {
    if (this.outOfHearts) return 0;
    const ok = this.firstTryCorrect;
    return 10 + ok + (ok === this.total ? 5 : 0);
  }
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
