import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { isAvatarColor, isAvatarKey } from "../../../../lib/avatars";
import { AVATAR_EXTRA_BY_KEY, isAvatarExtraKey, isAvatarExtraUnlocked } from "../../../../lib/avatarExtras";

/**
 * Change l'avatar du compte connecté : POST { avatarKey, avatarColor, avatarExtra }.
 * avatarExtra (effet spécial, ou null) n'est accepté que s'il est débloqué
 * (XP, badges ou saison : voir lib/avatarExtras.ts).
 * Compte identifié uniquement par le cookie de session signé ; avatar et
 * couleur validés contre la liste de lib/avatars.tsx. Met aussi à jour les
 * lignes `players` de ce compte dans les parties encore ouvertes, pour que
 * le changement se voie tout de suite.
 */
export async function POST(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  if (!accountId) return NextResponse.json({ ok: false, error: "Non connecté." }, { status: 401 });

  let avatarKey: unknown;
  let avatarColor: unknown;
  let avatarExtra: unknown = null;
  try {
    const body = await request.json();
    avatarKey = body?.avatarKey;
    avatarColor = body?.avatarColor;
    avatarExtra = body?.avatarExtra ?? null;
  } catch {
    // traité juste en dessous
  }
  if (!isAvatarKey(avatarKey) || !isAvatarColor(avatarColor)) {
    return NextResponse.json({ ok: false, error: "Avatar inconnu." }, { status: 400 });
  }
  const color = (avatarColor as string).toUpperCase();
  if (avatarExtra !== null && !isAvatarExtraKey(avatarExtra)) {
    return NextResponse.json({ ok: false, error: "Effet inconnu." }, { status: 400 });
  }
  if (avatarExtra !== null) {
    const [{ data: acc }, { data: badgeRows }] = await Promise.all([
      supabaseAdmin.from("player_accounts").select("xp").eq("id", accountId).maybeSingle(),
      supabaseAdmin.from("player_badge_progress").select("badge_key, progress, tier").eq("account_id", accountId),
    ]);
    const badges = Object.fromEntries((badgeRows ?? []).map((r: any) => [r.badge_key, { progress: r.progress, tier: r.tier }]));
    if (!isAvatarExtraUnlocked(AVATAR_EXTRA_BY_KEY[avatarExtra as string], { xp: acc?.xp ?? 0, badges })) {
      return NextResponse.json({ ok: false, error: "Cet effet n’est pas encore débloqué." }, { status: 403 });
    }
  }

  const { error } = await supabaseAdmin
    .from("player_accounts")
    .update({ avatar_key: avatarKey, avatar_color: color, avatar_extra: avatarExtra })
    .eq("id", accountId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabaseAdmin
    .from("players")
    .update({ avatar_key: avatarKey, avatar_color: color, avatar_extra: avatarExtra })
    .eq("account_id", accountId);

  return NextResponse.json({ ok: true, avatarKey, avatarColor: color, avatarExtra });
}
