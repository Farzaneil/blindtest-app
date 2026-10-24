import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_PLAYER_SESSION,
  createSessionCookieValue,
  verifySessionCookieValue,
} from "../../../../lib/playerAuth";
import { COOKIE_MAGIC_VERIFIER, normalizeEmail, requestOrigin, pseudoFromEmail, safeNext, supabaseAuthClient } from "../../../../lib/playerEmailAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

/**
 * Retour du lien magique : /api/player-auth/confirm?code=…&next=… (modèle
 * d'e-mail par défaut, flux PKCE) — ou ?token_hash=…&type=email si un
 * modèle personnalisé est configuré plus tard (SMTP perso).
 * 1. Vérifie le lien auprès de Supabase Auth (donne l'e-mail confirmé).
 * 2. Retrouve le compte joueur de cet e-mail, ou :
 *    - rattache l'e-mail au compte déjà ouvert dans ce navigateur s'il n'en
 *      a pas encore (anciens comptes Spotify : même XP, badges...) ;
 *    - sinon crée un nouveau compte (pseudo tiré de l'e-mail, modifiable).
 * 3. Pose le cookie de session du jeu et renvoie vers `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as "email" | "magiclink" | "signup";

  const fail = (message: string) => {
    const r = NextResponse.redirect(`${origin}/connexion?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);
    r.cookies.delete(COOKIE_MAGIC_VERIFIER);
    return r;
  };

  const linkError = searchParams.get("error_description") || searchParams.get("error");
  if (linkError) return fail("Lien expiré ou déjà utilisé — redemande un lien.");
  if (!code && !tokenHash) return fail("Lien de connexion incomplet — redemande un lien.");

  let user: { id: string; email?: string } | null = null;
  if (code) {
    const verifier = request.cookies.get(COOKIE_MAGIC_VERIFIER)?.value ?? null;
    if (!verifier) {
      return fail("Ouvre le lien dans le même navigateur que celui où tu l’as demandé (ou redemande un lien ici).");
    }
    const { data, error } = await supabaseAuthClient(verifier).client.auth.exchangeCodeForSession(code);
    if (!error) user = data.user;
  } else if (tokenHash) {
    const { data, error } = await supabaseAuthClient().client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) user = data.user;
  }
  const data = { user };
  const error = user ? null : true;
  const email = data?.user?.email ? normalizeEmail(data.user.email) : null;
  const authUserId = data?.user?.id ?? null;
  if (error || !email) return fail("Lien expiré ou déjà utilisé — redemande un lien.");

  try {
    let accountId: string | null = null;

    const { data: byEmail, error: byEmailError } = await supabaseAdmin
      .from("player_accounts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (byEmailError) throw new Error(`Lecture des comptes impossible (migration 0029 appliquée ?) : ${byEmailError.message}`);
    if (byEmail) {
      accountId = byEmail.id;
      if (authUserId) await supabaseAdmin.from("player_accounts").update({ auth_user_id: authUserId }).eq("id", byEmail.id);
    }

    if (!accountId) {
      const currentId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
      if (currentId) {
        const { data: current } = await supabaseAdmin
          .from("player_accounts")
          .select("id, email")
          .eq("id", currentId)
          .maybeSingle();
        if (current && !current.email) {
          const { error: linkError } = await supabaseAdmin.from("player_accounts").update({ email, auth_user_id: authUserId }).eq("id", current.id);
          if (!linkError) accountId = current.id;
        }
      }
    }

    if (!accountId) {
      const { data: created, error: createError } = await supabaseAdmin
        .from("player_accounts")
        .insert({ pseudo: pseudoFromEmail(email), email, auth_user_id: authUserId })
        .select("id")
        .single();
      if (createError || !created) throw new Error(`Création du compte impossible : ${createError?.message ?? "réponse vide"}`);
      accountId = created.id;
    }

    const response = NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}player_connected=1`);
    response.cookies.delete(COOKIE_MAGIC_VERIFIER);
    response.cookies.set(COOKIE_PLAYER_SESSION, createSessionCookieValue(accountId!), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (e: any) {
    console.error("[player-auth/confirm]", e);
    return fail(e?.message ?? "Connexion impossible.");
  }
}
