export type BuzzAttempt = {
  playerId: string;
  serverReceivedAt: string; // ISO timestamp, généré par Postgres (now()), jamais le client
};

/**
 * Détermine le gagnant du buzz d'une manche : le premier horodatage SERVEUR.
 * Ne jamais utiliser un timestamp envoyé par le client (horloges des
 * téléphones non synchronisées => injuste).
 */
export function resolveBuzzWinner(attempts: BuzzAttempt[]): BuzzAttempt | null {
  if (attempts.length === 0) return null;
  return [...attempts].sort(
    (a, b) => new Date(a.serverReceivedAt).getTime() - new Date(b.serverReceivedAt).getTime()
  )[0];
}
