import { supabaseAdmin } from "./supabaseAdmin";
import { pseudoFromEmail } from "./playerEmailAuth";

/**
 * SERVEUR uniquement. Compte joueur correspondant à un e-mail confirmé
 * (lien magique ou code à 6 chiffres) :
 * - le compte qui porte déjà cet e-mail ;
 * - sinon, le compte ouvert dans ce navigateur s'il n'a pas encore d'e-mail
 *   (anciens comptes Spotify : même XP, badges...) ;
 * - sinon, un nouveau compte (pseudo tiré de l'e-mail, modifiable).
 */
export async function findOrCreateAccountForEmail(
  email: string,
  authUserId: string | null,
  currentSessionAccountId: string | null
): Promise<string> {
  const { data: byEmail, error: byEmailError } = await supabaseAdmin
    .from("player_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (byEmailError) throw new Error(`Lecture des comptes impossible (migration 0029 appliquée ?) : ${byEmailError.message}`);
  if (byEmail) {
    await supabaseAdmin
      .from("player_accounts")
      .update({ last_seen_at: new Date().toISOString(), ...(authUserId ? { auth_user_id: authUserId } : {}) })
      .eq("id", byEmail.id);
    return byEmail.id;
  }

  if (currentSessionAccountId) {
    const { data: current } = await supabaseAdmin
      .from("player_accounts")
      .select("id, email")
      .eq("id", currentSessionAccountId)
      .maybeSingle();
    if (current && !current.email) {
      const { error } = await supabaseAdmin.from("player_accounts").update({ email, auth_user_id: authUserId }).eq("id", current.id);
      if (!error) return current.id;
    }
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("player_accounts")
    .insert({ pseudo: pseudoFromEmail(email), email, auth_user_id: authUserId })
    .select("id")
    .single();
  if (createError || !created) throw new Error(`Création du compte impossible : ${createError?.message ?? "réponse vide"}`);
  return created.id;
}

/** Cookie de session du jeu : 6 mois, pour redemander rarement un lien. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
};
