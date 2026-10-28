import { DEEZER_LIMIT_PER_MINUTE, artistNames, deezerGet, jsonError, type RawTrack } from "../../../../../lib/deezerServer";
import { clientIp, rateLimit, tooManyRequests } from "../../../../../lib/rateLimit";

/**
 * URL fraîche de l'extrait de 30 s d'un morceau : GET /api/deezer/track/123.
 * Appelée au lancement de chaque manche (les URL d'extrait expirent).
 * Renvoie aussi `artist` : TOUS les artistes du morceau (contributeurs),
 * que les listes de playlist ne donnent pas (artiste principal seul).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await rateLimit(`deezer:${clientIp(request)}`, DEEZER_LIMIT_PER_MINUTE, 60))) return tooManyRequests();
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Morceau invalide." }, { status: 400 });
  try {
    const t = await deezerGet<RawTrack>(`/track/${id}`);
    if (!t.preview) return Response.json({ error: "Pas d’extrait disponible pour ce morceau." }, { status: 404 });
    return Response.json({ preview: t.preview, artist: artistNames(t) || null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
