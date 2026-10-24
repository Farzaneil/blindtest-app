import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, createSessionCookieValue, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { COOKIE_MAGIC_VERIFIER, isPlausibleEmail, normalizeEmail, supabaseAuthClient } from "../../../../lib/playerEmailAuth";
import { SESSION_COOKIE_OPTIONS, findOrCreateAccountForEmail } from "../../../../lib/playerEmailAccount";

/**
 * Connexion avec le code à 6 chiffres de l'e-mail : POST { email, code }.
 * Alternative au lien, pratique quand on lit ses e-mails sur un autre
 * appareil (le lien, lui, doit être ouvert dans le même navigateur).
 */
export async function POST(request: NextRequest) {
  let email = "";
  let code = "";
  try {
    const body = await request.json();
    email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  } catch {
    // traité juste en dessous
  }
  if (!isPlausibleEmail(email) || !/^\d{6,10}$/.test(code)) {
    return NextResponse.json({ ok: false, error: "Code invalide." }, { status: 400 });
  }

  const { data, error } = await supabaseAuthClient().client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user?.email) {
    return NextResponse.json({ ok: false, error: "Code incorrect ou expiré — vérifie-le ou redemande un e-mail." }, { status: 400 });
  }

  try {
    const accountId = await findOrCreateAccountForEmail(
      normalizeEmail(data.user.email),
      data.user.id,
      verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value)
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(COOKIE_MAGIC_VERIFIER);
    response.cookies.set(COOKIE_PLAYER_SESSION, createSessionCookieValue(accountId), SESSION_COOKIE_OPTIONS);
    return response;
  } catch (e: any) {
    console.error("[player-auth/verify-code]", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Connexion impossible." }, { status: 500 });
  }
}
