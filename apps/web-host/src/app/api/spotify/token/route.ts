import { NextRequest, NextResponse } from "next/server";
import {
  refreshAccessToken,
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
} from "../../../../lib/spotifyAuth";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(COOKIE_ACCESS_TOKEN)?.value;
  const refreshToken = request.cookies.get(COOKIE_REFRESH_TOKEN)?.value;
  const expiresAt = Number(request.cookies.get(COOKIE_EXPIRES_AT)?.value ?? 0);

  if (!refreshToken) {
    return NextResponse.json({ connected: false });
  }

  if (accessToken && Date.now() < expiresAt - 60_000) {
    return NextResponse.json({ connected: true, accessToken });
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);
    const response = NextResponse.json({ connected: true, accessToken: tokens.access_token });

    const baseCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
    };
    const newExpiresAt = Date.now() + tokens.expires_in * 1000;

    response.cookies.set(COOKIE_ACCESS_TOKEN, tokens.access_token, {
      ...baseCookieOptions,
      maxAge: tokens.expires_in,
    });
    response.cookies.set(COOKIE_EXPIRES_AT, String(newExpiresAt), {
      ...baseCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
    if (tokens.refresh_token) {
      response.cookies.set(COOKIE_REFRESH_TOKEN, tokens.refresh_token, {
        ...baseCookieOptions,
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    return response;
  } catch (e: any) {
    return NextResponse.json({ connected: false, error: e?.message ?? "refresh_failed" });
  }
}
