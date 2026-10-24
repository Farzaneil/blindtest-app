import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

/**
 * Suppression du compte joueur et de ses données (bouton "Supprimer mon
 * compte et mes données", onglet Réglages de /profil — obligation RGPD,
 * voir cadrage_comptes_recompenses_rgpd.md).
 *
 * Une seule suppression sur player_accounts suffit à tout nettoyer :
 *   - player_account_providers (jetons OAuth) : on delete cascade
 *     (voir migration 0020) — plus aucune trace du compte Spotify lié.
 *   - players.account_id (parties déjà jouées) : on delete set null (voir
 *     migration 0020) — les lignes `players` elles-mêmes ne sont PAS
 *     supprimées (elles appartiennent à l'historique de la room, partagé
 *     avec les autres participants), seul le lien vers ce compte disparaît ;
 *     display_name/score restent, comme pour un invité qui n'a jamais eu de
 *     compte.
 *
 * Passe par supabaseAdmin : comme pour update-pseudo, l'accountId vient
 * uniquement du cookie de session signé, jamais d'une valeur envoyée par le
 * client, pour qu'un compte ne puisse jamais faire supprimer un autre
 * compte que le sien.
 */
export async function POST(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Non connecté." }, { status: 401 });
  }

  // Utilisateur Supabase Auth lié (connexion par e-mail, migration 0029) :
  // supprimé aussi, pour ne garder aucune trace de l'adresse e-mail.
  const { data: account } = await supabaseAdmin
    .from("player_accounts")
    .select("auth_user_id")
    .eq("id", accountId)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("player_accounts").delete().eq("id", accountId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (account?.auth_user_id) {
    await supabaseAdmin.auth.admin.deleteUser(account.auth_user_id).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_PLAYER_SESSION);
  return response;
}
