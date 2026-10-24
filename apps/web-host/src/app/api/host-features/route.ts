import { NextRequest } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../lib/playerAuth";
import { isSpotifyAllowedEmail } from "../../../lib/playerEmailAuth";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

/**
 * Options réservées de l'écran hôte. Spotify (morceaux complets) n'est
 * proposé qu'aux comptes dont l'e-mail figure dans SPOTIFY_HOST_EMAILS
 * (liste séparée par des virgules, variable d'environnement) : l'app
 * Spotify est en mode développement, limitée aux comptes ajoutés à la main
 * dans le dashboard Spotify. Tous les autres jouent avec Deezer.
 */
export async function GET(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  if (!accountId) return Response.json({ spotify: false });
  const { data } = await supabaseAdmin.from("player_accounts").select("email").eq("id", accountId).maybeSingle();
  return Response.json({ spotify: isSpotifyAllowedEmail(data?.email) }, { headers: { "Cache-Control": "no-store" } });
}
