import { NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION } from "../../../../lib/playerAuth";

/**
 * Déconnexion joueur : supprime uniquement le cookie de session joueur.
 * Ne touche jamais aux cookies de la connexion Spotify "hôte" (voir
 * spotifyAuth.ts) — les deux sont volontairement indépendants.
 *
 * Répond en JSON, PAS par une redirection (bug corrigé : cette route est
 * appelée via fetch() depuis le navigateur — PlayerAccountCorner.tsx et
 * /profil gèrent eux-mêmes la navigation après coup (refresh()/router.push).
 * Un NextResponse.redirect() ici forçait fetch() à suivre la redirection
 * lui-même, ce qui provoquait un "TypeError: Failed to fetch" au clic (le
 * cookie était malgré tout bien supprimé côté serveur avant l'échec, d'où
 * la déconnexion visible seulement après un rechargement manuel). Même
 * pattern que /api/spotify/logout, qui n'a jamais eu ce problème.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_PLAYER_SESSION);
  return response;
}
