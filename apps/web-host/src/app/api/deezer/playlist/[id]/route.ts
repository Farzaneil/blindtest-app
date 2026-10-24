import { NextRequest } from "next/server";
import { deezerGet, getPlayableTracks, jsonError, toPlaylistSummary } from "../../../../../lib/deezerServer";

/**
 * Morceaux jouables d'une playlist Deezer : GET /api/deezer/playlist/123
 * - ?info=1 : seulement le résumé, pour une playlist collée par lien ;
 * - ?count=1 : seulement le nombre de morceaux jouables (affiché dans la
 *   liste des playlists, voir DeezerPlaylistPicker).
 * Ne garde que les morceaux qui ont un extrait disponible. L'URL de
 * l'extrait n'est PAS renvoyée : elle expire, elle est redemandée au
 * lancement de la manche (voir /api/deezer/track/[id]).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Playlist invalide." }, { status: 400 });
  const search = new URL(request.url).searchParams;
  try {
    if (search.get("info") === "1") {
      const info = await deezerGet<Parameters<typeof toPlaylistSummary>[0]>(`/playlist/${id}`, 300);
      return Response.json({ playlist: toPlaylistSummary(info) });
    }
    const tracks = await getPlayableTracks(id);
    if (search.get("count") === "1") return Response.json({ playable: tracks.length });
    return Response.json({ tracks });
  } catch (e) {
    return jsonError(e);
  }
}
