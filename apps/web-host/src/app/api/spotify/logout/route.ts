import { NextResponse } from "next/server";
import {
  COOKIE_ACCESS_TOKEN,
  COOKIE_REFRESH_TOKEN,
  COOKIE_EXPIRES_AT,
  COOKIE_VERIFIER,
  COOKIE_STATE,
} from "../../../../lib/spotifyAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_ACCESS_TOKEN);
  response.cookies.delete(COOKIE_REFRESH_TOKEN);
  response.cookies.delete(COOKIE_EXPIRES_AT);
  response.cookies.delete(COOKIE_VERIFIER);
  response.cookies.delete(COOKIE_STATE);
  return response;
}
