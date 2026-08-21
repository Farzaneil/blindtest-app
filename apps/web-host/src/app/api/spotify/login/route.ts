import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  codeChallengeFromVerifier,
  generatePkceVerifier,
  generateState,
  COOKIE_VERIFIER,
  COOKIE_STATE,
  COOKIE_NEXT,
} from "../../../../lib/spotifyAuth";

// `next` (l'écran où revenir une fois connecté — voir useSpotifyPlayer.ts
// connect(), qui transmet toujours la page courante, typiquement /host)
// est stocké dans un cookie court le temps de l'aller-retour OAuth : voir
// le commentaire de COOKIE_NEXT dans spotifyAuth.ts.
export async function GET(request: NextRequest) {
  const next = new URL(request.url).searchParams.get("next") ?? "/";

  const verifier = generatePkceVerifier();
  const challenge = codeChallengeFromVerifier(verifier);
  const state = generateState();
  const url = buildAuthorizeUrl(challenge, state);

  const response = NextResponse.redirect(url);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/",
  };
  response.cookies.set(COOKIE_VERIFIER, verifier, cookieOptions);
  response.cookies.set(COOKIE_STATE, state, cookieOptions);
  response.cookies.set(COOKIE_NEXT, next, cookieOptions);

  return response;
}
