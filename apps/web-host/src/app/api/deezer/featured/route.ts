import { DEEZER_LIMIT_PER_MINUTE, deezerGet, jsonError, toPlaylistSummary } from "../../../../lib/deezerServer";
import { clientIp, rateLimit, tooManyRequests } from "../../../../lib/rateLimit";

/** Playlists du moment (classement Deezer) : GET /api/deezer/featured */
export async function GET(request: Request) {
  if (!(await rateLimit(`deezer:${clientIp(request)}`, DEEZER_LIMIT_PER_MINUTE, 60))) return tooManyRequests();
  try {
    const data = await deezerGet<{ data?: Parameters<typeof toPlaylistSummary>[0][] }>("/chart/0/playlists?limit=12", 3600);
    return Response.json({ playlists: (data.data ?? []).map(toPlaylistSummary) });
  } catch (e) {
    return jsonError(e);
  }
}
