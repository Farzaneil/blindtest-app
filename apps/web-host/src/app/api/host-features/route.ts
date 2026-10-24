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
  // Champs de diagnostic (sans jamais renvoyer la liste ni l'e-mail) :
  // permettent de comprendre d'un coup d'œil pourquoi Spotify n'est pas
  // proposé (pas connecté, compte sans e-mail, liste vide côté serveur...).
  const allowlistConfigured = (process.env.SPOTIFY_HOST_EMAILS ?? "").trim().length > 0;
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  const headers = { "Cache-Control": "no-store" };
  if (!accountId) return Response.json({ spotify: false, connected: false, allowlistConfigured }, { headers });
  const { data } = await supabaseAdmin.from("player_accounts").select("email").eq("id", accountId).maybeSingle();
  return Response.json(
    { spotify: isSpotifyAllowedEmail(data?.email), connected: true, accountHasEmail: !!data?.email, allowlistConfigured },
    { headers }
  );
}
