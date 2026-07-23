import { NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  codeChallengeFromVerifier,
  generatePkceVerifier,
  generateState,
  COOKIE_VERIFIER,
  COOKIE_STATE,
} from "../../../../lib/spotifyAuth";

export async function GET() {
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

  return response;
}
