import { deezerGet, jsonError, type RawTrack } from "../../../../../lib/deezerServer";

/**
 * URL fraîche de l'extrait de 30 s d'un morceau : GET /api/deezer/track/123.
 * Appelée au lancement de chaque manche (les URL d'extrait expirent).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Morceau invalide." }, { status: 400 });
  try {
    const t = await deezerGet<RawTrack>(`/track/${id}`);
    if (!t.preview) return Response.json({ error: "Pas d’extrait disponible pour ce morceau." }, { status: 404 });
    return Response.json({ preview: t.preview }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
