import { NextRequest, NextResponse } from "next/server";
import {
  buildPlayerAuthorizeUrl,
  codeChallengeFromVerifier,
  generatePkceVerifier,
  generateState,
  COOKIE_PLAYER_VERIFIER,
  COOKIE_PLAYER_STATE,
  COOKIE_PLAYER_NEXT,
} from "../../../../lib/playerAuth";

/**
 * Démarre la connexion joueur. `next` (la page où revenir une fois
 * connecté — typiquement "/" ou "/play", voir PlayerAccountCorner) est
 * transmis en query param depuis l'écran /connexion, et stocké dans un
 * cookie court le temps de l'aller-retour OAuth : Spotify ne renvoie au
 * callback que ce qu'on lui a donné dans redirect_uri/state, impossible de
 * lui faire porter un query param arbitraire jusque-là.
 */
export async function GET(request: NextRequest) {
  const next = new URL(request.url).searchParams.get("next") ?? "/";

  const verifier = generatePkceVerifier();
  const challenge = codeChallengeFromVerifier(verifier);
  const state = generateState();

  let url: string;
  try {
    url = buildPlayerAuthorizeUrl(challenge, state);
  } catch (e: any) {
    return NextResponse.redirect(`${new URL(request.url).origin}/connexion?error=${encodeURIComponent(e?.message ?? "config")}`);
  }

  const response = NextResponse.redirect(url);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  };
  response.cookies.set(COOKIE_PLAYER_VERIFIER, verifier, cookieOptions);
  response.cookies.set(COOKIE_PLAYER_STATE, state, cookieOptions);
  response.cookies.set(COOKIE_PLAYER_NEXT, next, cookieOptions);

  return response;
}
