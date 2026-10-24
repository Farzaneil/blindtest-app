import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { COSMETIC_BY_KEY, isCosmeticUnlocked } from "../../../../lib/cosmetics";

/**
 * Équipe un cosmétique de buzzer pour le compte joueur connecté (onglet
 * Réglages de /profil, section "Skin du buzzer" — voir migration 0022).
 *
 * Passe par supabaseAdmin, PAS par la clé anon ni par une fonction Postgres
 * publique : contrairement au recalcul de badges/cosmétiques (qui ne fait
 * que refléter un historique de partie déjà vrai, sans risque même
 * déclenché par n'importe qui), équiper un cosmétique modifie un choix
 * personnel du compte — ça doit être vérifié contre LA SESSION du joueur, ce
 * que seul le cookie signé (voir playerAuth.ts) permet ici (pas d'auth
 * Supabase réelle). Même principe que update-pseudo/delete.
 *
 * Double vérification avant d'équiper :
 *   1. La clé correspond à un cosmétique du catalogue (cosmetics.tsx).
 *   2. Ce cosmétique est soit toujours disponible ("always", les 8 couleurs
 *      Uni de base), soit déjà présent dans player_cosmetics pour CE compte
 *      (donc effectivement débloqué par award_cosmetic_unlocks) — jamais un
 *      cosmétique non débloqué, même si le client envoie sa clé directement.
 */
export async function POST(request: NextRequest) {
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  if (!accountId) {
    return NextResponse.json({ ok: false, error: "Non connecté." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corps de requête invalide." }, { status: 400 });
  }

  const cosmeticKey = typeof (body as any)?.cosmeticKey === "string" ? (body as any).cosmeticKey : "";
  const def = COSMETIC_BY_KEY[cosmeticKey];
  if (!def) {
    return NextResponse.json({ ok: false, error: "Cosmétique inconnu." }, { status: 400 });
  }

  // Déblocage calculé à la volée (XP + badges), même règle que l'écran
  // profil : voir isCosmeticUnlocked dans lib/cosmetics.tsx.
  if (def.unlock.type !== "always") {
    const [{ data: acc, error: accError }, { data: badgeRows, error: badgeError }] = await Promise.all([
      supabaseAdmin.from("player_accounts").select("xp").eq("id", accountId).maybeSingle(),
      supabaseAdmin.from("player_badge_progress").select("badge_key, tier").eq("account_id", accountId),
    ]);
    if (accError || badgeError) {
      return NextResponse.json({ ok: false, error: (accError ?? badgeError)!.message }, { status: 500 });
    }
    const badges = Object.fromEntries((badgeRows ?? []).map((r: any) => [r.badge_key, { tier: r.tier }]));
    if (!isCosmeticUnlocked(def, { xp: acc?.xp ?? 0, badges })) {
      return NextResponse.json({ ok: false, error: "Ce skin n'est pas encore débloqué." }, { status: 403 });
    }
  }

  // Pas de vraie transaction ici (supabase-js n'en expose pas) : à l'échelle
  // "dev, entre amis" de ce projet — un seul appareil équipant son propre
  // skin à la fois — la fenêtre entre ces deux appels est sans conséquence
  // réelle (au pire, un rechargement immédiatement après verrait l'ancien
  // skin encore équipé un instant).
  const { error: unequipError } = await supabaseAdmin
    .from("player_cosmetics")
    .update({ equipped: false })
    .eq("account_id", accountId)
    .eq("equipped", true);
  if (unequipError) {
    return NextResponse.json({ ok: false, error: unequipError.message }, { status: 500 });
  }

  const { error: equipError } = await supabaseAdmin
    .from("player_cosmetics")
    .upsert({ account_id: accountId, cosmetic_key: cosmeticKey, equipped: true }, { onConflict: "account_id,cosmetic_key" });
  if (equipError) {
    return NextResponse.json({ ok: false, error: equipError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, cosmeticKey });
}
