import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimitAll, tooManyRequests } from "../../../../lib/rateLimit";
import { COOKIE_MAGIC_VERIFIER, isPlausibleEmail, normalizeEmail, requestOrigin, safeNext, supabaseAuthClient } from "../../../../lib/playerEmailAuth";

/**
 * Envoie le lien magique de connexion : POST { email, next }.
 * Le lien de l'e-mail (modèle par défaut de Supabase) ramène sur
 * /api/player-auth/confirm?code=… ; le "code verifier" PKCE est gardé dans
 * un cookie httpOnly le temps de cliquer (voir lib/playerEmailAuth.ts).
 */
export async function POST(request: NextRequest) {
  let email = "";
  let next = "/";
  try {
    const body = await request.json();
    email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
    next = safeNext(typeof body?.next === "string" ? body.next : "/");
  } catch {
    // corps invalide : traité juste en dessous
  }
  if (!isPlausibleEmail(email)) {
    return NextResponse.json({ ok: false, error: "Adresse e-mail invalide." }, { status: 400 });
  }

  // Anti-abus : au plus 5 e-mails par adresse et 10 par IP par quart d'heure.
  const allowed = await rateLimitAll([
    [`auth-email:ip:${clientIp(request)}`, 10, 15 * 60],
    [`auth-email:to:${email}`, 5, 15 * 60],
  ]);
  if (!allowed) return tooManyRequests("Trop de demandes de lien pour le moment, réessaie dans quelques minutes.");

  const origin = requestOrigin(request);
  const redirectTo = `${origin}/api/player-auth/confirm?next=${encodeURIComponent(next)}`;
  const { client, getVerifier } = supabaseAuthClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) {
    const rateLimited = error.status === 429 || /rate limit/i.test(error.message);
    return NextResponse.json(
      {
        ok: false,
        error: rateLimited
          ? "Trop de demandes de lien pour le moment, réessaie dans quelques minutes."
          : `Envoi impossible : ${error.message}`,
      },
      { status: rateLimited ? 429 : 500 }
    );
  }
  const response = NextResponse.json({ ok: true });
  const verifier = getVerifier();
  if (verifier) {
    response.cookies.set(COOKIE_MAGIC_VERIFIER, verifier, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60, // le lien Supabase expire au bout d'une heure
    });
  }
  return response;
}
