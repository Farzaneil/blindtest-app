import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION } from "../../../../lib/playerAuth";

/**
 * Déconnexion joueur : supprime uniquement le cookie de session joueur.
 * Ne touche jamais aux cookies de la connexion Spotify "hôte" (voir
 * spotifyAuth.ts) — les deux sont volontairement indépendants.
 */
export async function POST(request: NextRequest) {
  const next = new URL(request.url).searchParams.get("next") ?? "/";
  const response = NextResponse.redirect(`${new URL(request.url).origin}${next}`);
  response.cookies.delete(COOKIE_PLAYER_SESSION);
  return response;
}
