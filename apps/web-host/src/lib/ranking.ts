import type { Player } from "./rooms";

export type RankedPlayer = Player & { rank: number };

/**
 * Classement "façon compétition" : deux joueurs à égalité de score
 * partagent le même rang, et le rang suivant saute en conséquence
 * (1, 1, 3 plutôt que 1, 1, 2). Partagé entre l'écran hôte (page.tsx) et
 * l'écran joueur (play/page.tsx) pour que les deux affichent exactement le
 * même classement, calculé à partir de la même liste `players` tenue à
 * jour en temps réel par subscribeToPlayers (voir rooms.ts).
 */
export function withRanks(players: Player[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let previousScore: number | null = null;
  return sorted.map((p, i) => {
    if (previousScore === null || p.score !== previousScore) {
      rank = i + 1;
      previousScore = p.score;
    }
    return { ...p, rank };
  });
}

/**
 * Formate un rang en ordinal français court : 1er, 2e, 3e… Utilisé côté
 * joueur pour afficher sa position ("2e / 5") sans avoir à gérer le pluriel
 * à la main à chaque appel.
 */
export function formatOrdinal(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}
