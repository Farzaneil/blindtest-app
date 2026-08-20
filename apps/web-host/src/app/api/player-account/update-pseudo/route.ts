import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

const MAX_PSEUDO_LENGTH = 24;

/**
 * Modifie le pseudo du compte joueur connecté (onglet Réglages de /profil).
 * Passe par supabaseAdmin (clé service_role), PAS par la clé anon : l'écriture
 * sur player_accounts est volontairement réservée au serveur (voir migration
 * 0020, "un joueur ne doit jamais pouvoir modifier son xp ou celui d'un
 * autre depuis le navigateur") — même règle appliquée ici au pseudo, pour ne
 * pas ouvrir une brèche d'écriture plus large que nécessaire sur cette table.
 *
 * L'identité du compte à modifier vient UNIQUEMENT du cookie de session
 * signé (voir playerAuth.ts) — jamais d'un accountId envoyé par le client,
 * qui pourrait sinon modifier le pseudo de n'importe quel autre compte.
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

  const pseudoRaw = typeof (body as any)?.pseudo === "string" ? (body as any).pseudo : "";
  const pseudo = pseudoRaw.trim();

  if (!pseudo) {
    return NextResponse.json({ ok: false, error: "Le pseudo ne peut pas être vide." }, { status: 400 });
  }
  if (pseudo.length > MAX_PSEUDO_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Le pseudo ne peut pas dépasser ${MAX_PSEUDO_LENGTH} caractères.` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("player_accounts").update({ pseudo }).eq("id", accountId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pseudo });
}
