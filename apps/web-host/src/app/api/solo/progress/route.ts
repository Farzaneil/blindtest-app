import { NextRequest, NextResponse } from "next/server";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { rateLimit, tooManyRequests } from "../../../../lib/rateLimit";

/**
 * Progression du mode solo du joueur connecté (migration 0039) :
 * GET  /api/solo/progress → { progress } (null si jamais joué) ;
 * PUT  /api/solo/progress  { progress } → enregistre.
 *
 * L'identité vient UNIQUEMENT du cookie de session signé (voir
 * playerAuth.ts), jamais d'un identifiant envoyé par le navigateur.
 * La progression est un JSON produit par lib/solo/progress.ts ; on vérifie
 * sa forme et sa taille avant de l'enregistrer.
 */

const MAX_BYTES = 200_000;

function accountOf(request: NextRequest): string | null {
  return verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
}

function isProgress(p: unknown): boolean {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  const isObj = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
  if (o.version !== 1 || !isObj(o.stars) || !isObj(o.best) || !isObj(o.boosters) || !isObj(o.found) || !isObj(o.recent)) return false;
  for (const v of Object.values(o.stars as object)) if (![0, 1, 2, 3].includes(v as number)) return false;
  for (const v of Object.values(o.best as object)) if (typeof v !== "number" || v < 0 || v > 100_000) return false;
  for (const v of Object.values(o.boosters as object)) if (typeof v !== "number" || v < 0 || v > 3) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const accountId = accountOf(request);
  if (!accountId) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("solo_progress").select("data").eq("account_id", accountId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ progress: data?.data ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const accountId = accountOf(request);
  if (!accountId) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!(await rateLimit(`solo-progress:${accountId}`, 60, 60))) return tooManyRequests();
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Progression trop volumineuse." }, { status: 413 });
  let progress: unknown;
  try {
    progress = (JSON.parse(raw) as { progress?: unknown }).progress;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  if (!isProgress(progress)) return NextResponse.json({ error: "Progression invalide." }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("solo_progress")
    .upsert({ account_id: accountId, data: progress, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
