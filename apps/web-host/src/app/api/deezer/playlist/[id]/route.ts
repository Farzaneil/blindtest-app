import { NextRequest } from "next/server";
import { deezerGet, jsonError, toPlaylistSummary, type RawTrack } from "../../../../../lib/deezerServer";

const MAX_TRACKS = 500;

/**
 * Morceaux jouables d'une playlist Deezer : GET /api/deezer/playlist/123
 * (?info=1 : seulement le résumé, pour une playlist collée par lien).
 * Ne garde que les morceaux qui ont un extrait disponible (certains n'en
 * ont pas, souvent pour des raisons de droits selon le pays). L'URL de
 * l'extrait n'est PAS renvoyée : elle expire, elle est redemandée au
 * lancement de la manche (voir /api/deezer/track/[id]).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) return Response.json({ error: "Playlist invalide." }, { status: 400 });
  try {
    if (new URL(request.url).searchParams.get("info") === "1") {
      const info = await deezerGet<Parameters<typeof toPlaylistSummary>[0]>(`/playlist/${id}`, 300);
      return Response.json({ playlist: toPlaylistSummary(info) });
    }
    const tracks: RawTrack[] = [];
    let index = 0;
    while (tracks.length < MAX_TRACKS) {
      const page = await deezerGet<{ data?: RawTrack[]; next?: string }>(`/playlist/${id}/tracks?limit=100&index=${index}`);
      const items = page.data ?? [];
      tracks.push(...items);
      if (!page.next || items.length === 0) break;
      index += items.length;
    }
    const playable = tracks
      .filter((t) => t.readable !== false && !!t.preview)
      .map((t) => ({
        sourceTrackId: `deezer:${t.id}`,
        title: t.title_short || t.title,
        artist: t.artist?.name ?? "",
        durationMs: 30_000,
        albumImageUrl: t.album?.cover_medium ?? null,
      }));
    return Response.json({ tracks: playable, skipped: tracks.length - playable.length });
  } catch (e) {
    return jsonError(e);
  }
}
