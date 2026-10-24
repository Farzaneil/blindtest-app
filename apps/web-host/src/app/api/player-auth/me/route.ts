import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";

/**
 * Retourne l'état de connexion joueur courant, lu depuis le cookie de
 * session (voir playerAuth.ts). Utilisé côté client par usePlayerAccount
 * (voir lib/usePlayerAccount.ts) pour afficher le pseudo/avatar dans
 * PlayerAccountCorner et pré-remplir account_id au moment de rejoindre une
 * partie. Passe par la clé anon (pas supabaseAdmin) : player_accounts est
 * volontairement lisible publiquement pour ses colonnes non sensibles
 * (voir migration 0020), pas besoin du service_role ici.
 */
export async function GET(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);

  if (!accountId) {
    return NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data } = await supabase
    .from("player_accounts")
    .select("id, pseudo, avatar_url, avatar_key, avatar_color, avatar_extra, xp")
    .eq("id", accountId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ connected: false }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    connected: true,
    account: {
      id: data.id,
      pseudo: data.pseudo,
      avatarUrl: data.avatar_url,
      avatarKey: data.avatar_key ?? null,
      avatarColor: data.avatar_color ?? null,
      avatarExtra: data.avatar_extra ?? null,
      xp: data.xp,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
