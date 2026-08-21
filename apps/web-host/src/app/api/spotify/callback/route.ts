import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  COOKIE_VERIFIER,
  COOKIE_STATE,
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
  COOKIE_NEXT,
} from "../../../../lib/spotifyAuth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  // Écran d'origine (voir COOKIE_NEXT/login/route.ts) : sans ça, cette
  // route renvoyait toujours sur "/" quel que soit le point de départ réel
  // (typiquement /host en pleine partie) — bug remonté lors de l'audit
  // navigation. "/" reste le repli si le cookie a expiré/est absent.
  const next = request.cookies.get(COOKIE_NEXT)?.value || "/";

  const redirectWithError = (message: string) => {
    const response = NextResponse.redirect(`${origin}${next}?error=${encodeURIComponent(message)}`);
    response.cookies.delete(COOKIE_NEXT);
    return response;
  };

  if (error) return redirectWithError(error);
  if (!code || !state) return redirectWithError("missing_code_or_state");

  const expectedState = request.cookies.get(COOKIE_STATE)?.value;
  const verifier = request.cookies.get(COOKIE_VERIFIER)?.value;

  if (!expectedState) {
    return redirectWithError(
      "Cookie state manquant — le navigateur ne l'a pas envoyé (relance la connexion Spotify depuis le début)."
    );
  }
  if (state !== expectedState) {
    return redirectWithError("État OAuth invalide (state mismatch) — relance la connexion depuis le début.");
  }
  if (!verifier) {
    return redirectWithError("Code verifier PKCE manquant — relance la connexion depuis le début.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier);
    const response = NextResponse.redirect(`${origin}${next}?connected=1`);
    response.cookies.delete(COOKIE_NEXT);

    const baseCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    response.cookies.set(COOKIE_ACCESS_TOKEN, tokens.access_token, {
      ...baseCookieOptions,
      maxAge: tokens.expires_in,
    });
    response.cookies.set(COOKIE_EXPIRES_AT, String(expiresAt), {
      ...baseCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    if (tokens.refresh_token) {
      response.cookies.set(COOKIE_REFRESH_TOKEN, tokens.refresh_token, {
        ...baseCookieOptions,
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    response.cookies.delete(COOKIE_VERIFIER);
    response.cookies.delete(COOKIE_STATE);

    return response;
  } catch (e: any) {
    return redirectWithError(e?.message ?? "unknown");
  }
}
