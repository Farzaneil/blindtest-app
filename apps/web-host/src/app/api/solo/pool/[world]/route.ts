import { unstable_cache } from "next/cache";
import { DEEZER_LIMIT_PER_MINUTE, deezerGet, jsonError, type RawTrack } from "../../../../../lib/deezerServer";
import { clientIp, rateLimit, tooManyRequests } from "../../../../../lib/rateLimit";
import { getWorld, type Tier } from "../../../../../lib/solo/worlds";
import type { PoolTrack } from "../../../../../lib/solo/engine";

/**
 * Réserve de morceaux d'un monde du mode solo : GET /api/solo/pool/garage.
 * Morceaux jouables (avec extrait) des playlists Deezer du monde, sans
 * doublon, classés en trois tranches de difficulté selon leur popularité
 * Deezer (`rank`). Mise en cache 6 h côté serveur. Comme partout, seuls
 * identifiants, titres et artistes sont gardés : l'URL de l'extrait est
 * redemandée à chaque morceau (/api/deezer/track/[id], règles Deezer).
 */

type RankedTrack = RawTrack & { rank?: number };

// Mots très courants en français : sert à deviner la langue d'un titre, pour
// que les fausses propositions ressemblent à la bonne (voir engine.choicesFor).
const FR_WORDS = new Set(
  "le la les l de des du d un une je j tu il elle on nous vous ils elles me m te t se s mon ma mes ton ta tes son sa ses que qui quand pas plus et ou en dans sur sous pour avec sans au aux ce c cette est suis es sont toi moi rien tout tous jamais encore amour coeur nuit jour vie".split(" ")
);
function looksFrench(title: string): boolean {
  if (/[àâçéèêëîïôûùœ]/i.test(title)) return true;
  const words = title.toLowerCase().replace(/[’']/g, " ").split(/[^a-zàâçéèêëîïôûùœ]+/).filter(Boolean);
  return words.filter((w) => FR_WORDS.has(w)).length >= Math.max(1, Math.ceil(words.length / 4));
}

/** Artistes en featuring cités dans le titre complet : « Sous le vent (feat. Garou) ». */
function featured(fullTitle: string): string[] {
  const m = fullTitle.match(/[([](?:feat\.?|ft\.?|featuring|avec|with)\s+([^)\]]+)[)\]]/i);
  return m ? m[1].split(/\s*(?:,|&|\bet\b|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean) : [];
}
const MAX_PER_PLAYLIST = 300;
const PER_PLAYLIST = 120;

async function playlistTracks(id: string): Promise<RankedTrack[]> {
  const out: RankedTrack[] = [];
  let index = 0;
  while (out.length < MAX_PER_PLAYLIST) {
    const page = await deezerGet<{ data?: RankedTrack[]; next?: string }>(`/playlist/${id}/tracks?limit=100&index=${index}`);
    const items = page.data ?? [];
    out.push(...items);
    if (!page.next || items.length === 0) break;
    index += items.length;
  }
  return out;
}

async function buildPool(worldId: string): Promise<PoolTrack[]> {
  const w = getWorld(worldId);
  if (!w) return [];
  let ids = w.playlistIds;
  if (ids.length === 0 && w.searchQuery) {
    // Dépannage tant que les playlists du monde ne sont pas choisies (voir lib/solo/worlds.ts).
    const found = await deezerGet<{ data?: { id: number; nb_tracks?: number }[] }>(
      `/search/playlist?q=${encodeURIComponent(w.searchQuery)}&limit=10`
    );
    ids = (found.data ?? [])
      .filter((p) => (p.nb_tracks ?? 0) >= 30)
      .slice(0, 3)
      .map((p) => String(p.id));
  }
  const seen = new Set<string>();
  const seenSong = new Set<string>();
  const tracks: (PoolTrack & { rank: number })[] = [];
  for (const [pl, id] of ids.entries()) {
    for (const t of await playlistTracks(id)) {
      if (t.readable === false || !t.preview || !t.artist?.name) continue;
      const tid = String(t.id);
      const title = t.title_short || t.title;
      // Même chanson présente deux fois (version album / single) : une seule.
      const song = `${title.toLowerCase()}|${t.artist.name.toLowerCase()}`;
      if (seen.has(tid) || seenSong.has(song)) continue;
      seen.add(tid);
      seenSong.add(song);
      const artists = Array.from(new Set([t.artist.name, ...featured(t.title)]));
      tracks.push({ id: tid, title, artist: artists.join(", "), tier: 1, rank: t.rank ?? 0, pl, fr: looksFrench(title) });
    }
  }
  // Tranches calculées DANS chaque playlist (le tiers le plus populaire = 1,
  // puis 2, puis 3) et au plus PER_PLAYLIST morceaux par playlist : sinon les
  // tubes du moment (souvent du rap), très écoutés, prendraient toute la
  // tranche « très connu » et écraseraient les playlists des années 80.
  const out: (PoolTrack & { rank: number })[] = [];
  for (const pl of new Set(tracks.map((t) => t.pl))) {
    const group = tracks.filter((t) => t.pl === pl).sort((a, b) => b.rank - a.rank).slice(0, PER_PLAYLIST);
    group.forEach((t, i) => {
      t.tier = (i < group.length / 3 ? 1 : i < (2 * group.length) / 3 ? 2 : 3) as Tier;
    });
    out.push(...group);
  }
  return out;
}

const cachedPool = unstable_cache(buildPool, ["solo-pool-v4"], { revalidate: 6 * 3600 });

export async function GET(request: Request, { params }: { params: Promise<{ world: string }> }) {
  if (!(await rateLimit(`deezer:${clientIp(request)}`, DEEZER_LIMIT_PER_MINUTE, 60))) return tooManyRequests();
  const { world } = await params;
  const w = getWorld(world);
  if (!w || !w.playable) return Response.json({ error: "Monde introuvable." }, { status: 404 });
  try {
    const tracks = await cachedPool(w.id);
    if (tracks.length < 20) return Response.json({ error: "Pas assez de morceaux pour ce monde, réessaie plus tard." }, { status: 503 });
    return Response.json({ tracks });
  } catch (e) {
    return jsonError(e);
  }
}
