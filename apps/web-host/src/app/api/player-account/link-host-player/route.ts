import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

/**
 * Rattache le joueur "hôte" d'une partie au compte joueur qui vient de se
 * connecter sur l'écran hôte (bug remonté : l'hôte inscrit comme joueur
 * invité, "Hôte", puis connecté à son compte, restait "Hôte" dans la liste
 * au lieu de prendre son pseudo et de gagner XP/badges).
 *
 * L'identité du compte vient UNIQUEMENT du cookie de session signé (voir
 * playerAuth.ts), jamais du client. Ne touche qu'une ligne is_host = true
 * encore sans compte, et seulement si ce compte n'a pas déjà un joueur
 * dans la partie. Le pseudo n'est repris que s'il est libre dans la partie
 * (index players_room_pseudo_unique, migration 0028) ; sinon seul le
 * compte est rattaché et le pseudo actuel est conservé.
 */
export async function POST(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Non connecté." }, { status: 401 });
  }

  let playerId = "";
  try {
    const body = await request.json();
    playerId = typeof body?.playerId === "string" ? body.playerId : "";
  } catch {
    // corps invalide : traité juste en dessous
  }
  if (!playerId) {
    return NextResponse.json({ ok: false, error: "Joueur manquant." }, { status: 400 });
  }

  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, room_id, is_host, account_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!player || !player.is_host || player.account_id) {
    return NextResponse.json({ ok: false, error: "Joueur hôte introuvable ou déjà rattaché." }, { status: 409 });
  }

  const { data: alreadyInRoom } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("room_id", player.room_id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (alreadyInRoom) {
    return NextResponse.json({ ok: false, error: "Ce compte joue déjà dans cette partie." }, { status: 409 });
  }

  const { data: account } = await supabaseAdmin
    .from("player_accounts")
    .select("pseudo")
    .eq("id", accountId)
    .maybeSingle();

  const pseudo = account?.pseudo?.trim();
  if (pseudo) {
    const { error } = await supabaseAdmin
      .from("players")
      .update({ account_id: accountId, display_name: pseudo })
      .eq("id", playerId);
    if (!error) return NextResponse.json({ ok: true, renamed: true });
    if (error.code !== "23505") {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  // Pseudo déjà pris par un autre joueur : on rattache quand même le compte.
  const { error } = await supabaseAdmin.from("players").update({ account_id: accountId }).eq("id", playerId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, renamed: false });
}
