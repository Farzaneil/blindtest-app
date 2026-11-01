import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { clientIp, rateLimit } from "../../../lib/rateLimit";

/**
 * Enregistre une étape d'arrivée par sticker / QR code (voir
 * lib/acquisition.ts et la migration 0037). Réponse 204 dans tous les cas
 * valides, même si l'écriture échoue : le suivi ne doit jamais gêner le jeu.
 */

const KINDS = new Set(["visit", "room_created", "player_joined"]);
const SOURCE_PATTERN = /^[a-z0-9-]{1,40}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const kind = typeof body?.kind === "string" ? body.kind : "";
  const source = typeof body?.source === "string" ? body.source.trim().toLowerCase() : "";
  const roomId = typeof body?.roomId === "string" && UUID_PATTERN.test(body.roomId) ? body.roomId : null;
  if (!KINDS.has(kind) || !SOURCE_PATTERN.test(source) || (kind !== "visit" && !roomId)) {
    return new Response(null, { status: 400 });
  }
  if (!(await rateLimit(`acquisition:ip:${clientIp(request)}`, 30, 3600))) {
    return new Response(null, { status: 429 });
  }
  await supabaseAdmin
    .from("acquisition_events")
    .insert({ kind, source, room_id: roomId })
    .then(
      ({ error }) => {
        if (error) console.error("acquisition: enregistrement impossible", error.message);
      },
      () => undefined
    );
  return new Response(null, { status: 204 });
}
