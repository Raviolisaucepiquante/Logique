// Répétition espacée à paliers fixes.
// La recherche ne montre pas d'avantage net des intervalles croissants sur les intervalles fixes ;
// ce qui compte est d'espacer. On suit le schéma J+1, J+3, J+7, J+14, puis J+30.
import { addDays } from './dates';

export const INTERVALS = [1, 3, 7, 14, 30];

export interface SrsItem {
  /** Palier atteint : l'intervalle appliqué au prochain succès est INTERVALS[step]. */
  step: number;
  due: string;
  graduated: boolean;
}

/** Première rencontre réussie : à revoir le lendemain. */
export function learn(day: string): SrsItem {
  return { step: 0, due: addDays(day, INTERVALS[0]), graduated: false };
}

/** Échec : retour au premier palier. */
export function fail(day: string): SrsItem {
  return { step: 0, due: addDays(day, INTERVALS[0]), graduated: false };
}

/** Succès en révision : palier suivant. */
export function succeed(item: SrsItem, day: string): SrsItem {
  const step = item.step + 1;
  if (step >= INTERVALS.length) return { step, due: addDays(day, 90), graduated: true };
  return { step, due: addDays(day, INTERVALS[step]), graduated: false };
}

export function isDue(item: SrsItem, day: string): boolean {
  return !item.graduated && item.due <= day;
}
