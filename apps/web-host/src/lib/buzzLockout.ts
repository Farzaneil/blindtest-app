// Calculs partagés entre app/play/page.tsx (BuzzerView) et
// app/host/page.tsx (HostBuzzerView, quand l'hôte joue aussi) pour les
// malus buzzer (voir supabase/migrations/0017_bonus_malus.sql) — même
// logique appliquée aux deux écrans, pour rester rigoureusement cohérent
// avec ce que resolve_buzz_winner() applique réellement côté serveur.
// L'application réelle du blocage se fait toujours côté serveur : ce
// fichier ne sert qu'à refléter visuellement (bouton désactivé, compte à
// rebours) ce qui va se passer, jamais à décider seul si un buzz doit
// compter ou non.

/**
 * Malus 1 — délai de buzz (5s / 10s / 15s, plafonné) en fonction du nombre
 * de bonnes réponses d'affilée du joueur. 0 = aucun délai.
 */
export function correctStreakLockoutSeconds(correctStreakCount: number): number {
  if (correctStreakCount >= 5) return 15;
  if (correctStreakCount === 4) return 10;
  if (correctStreakCount === 3) return 5;
  return 0;
}

/**
 * Malus 2 — le buzzer de ce joueur est intégralement bloqué sur CETTE
 * manche précise (celle qui suit directement les 3 échecs d'affilée).
 */
export function isFullyBlockedThisRound(
  player: { wrong_streak_block_round_index: number | null },
  round: { order_index: number }
): boolean {
  return (
    player.wrong_streak_block_round_index !== null &&
    round.order_index === player.wrong_streak_block_round_index + 1
  );
}

/**
 * Instant (epoch ms) à partir duquel ce joueur peut buzzer sur la manche en
 * cours, en tenant compte du malus 1 — null si round n'a pas encore de
 * started_at (ne devrait pas arriver en pratique pour une manche "playing").
 */
export function buzzUnlockedAtMs(
  correctStreakCount: number,
  roundStartedAt: string | null
): number | null {
  if (!roundStartedAt) return null;
  const lockoutSeconds = correctStreakLockoutSeconds(correctStreakCount);
  return new Date(roundStartedAt).getTime() + lockoutSeconds * 1000;
}
