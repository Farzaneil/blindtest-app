import { NextRequest } from "next/server";
import { deezerGet, jsonError, toPlaylistSummary } from "../../../../lib/deezerServer";

/** Recherche de playlists Deezer publiques : GET /api/deezer/search?q=… */
export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (!q) return Response.json({ playlists: [] });
  try {
    const data = await deezerGet<{ data?: Parameters<typeof toPlaylistSummary>[0][] }>(
      `/search/playlist?q=${encodeURIComponent(q)}&limit=24`,
      300
    );
    const playlists = (data.data ?? []).map(toPlaylistSummary).filter((p) => p.trackCount > 0);
    return Response.json({ playlists });
  } catch (e) {
    return jsonError(e);
  }
}
