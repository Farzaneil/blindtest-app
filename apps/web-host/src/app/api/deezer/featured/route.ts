import { deezerGet, jsonError, toPlaylistSummary } from "../../../../lib/deezerServer";

/** Playlists du moment (classement Deezer) : GET /api/deezer/featured */
export async function GET() {
  try {
    const data = await deezerGet<{ data?: Parameters<typeof toPlaylistSummary>[0][] }>("/chart/0/playlists?limit=12", 3600);
    return Response.json({ playlists: (data.data ?? []).map(toPlaylistSummary) });
  } catch (e) {
    return jsonError(e);
  }
}
