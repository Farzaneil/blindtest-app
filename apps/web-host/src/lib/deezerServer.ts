/**
 * Appels à l'API publique Deezer (sans compte) — CÔTÉ SERVEUR uniquement
 * (routes app/api/deezer/*) : l'API Deezer n'autorise pas les appels
 * directs depuis le navigateur (pas de CORS).
 *
 * Règles Deezer à respecter (https://developers.deezer.com/guidelines) :
 * seuls les extraits de 30 s sont lus, jamais stockés (ni en base, ni en
 * cache) : on ne garde que l'identifiant du morceau, et l'URL de l'extrait
 * (temporaire, elle expire) est redemandée au lancement de chaque manche.
 */

import { unstable_cache } from "next/cache";

const DEEZER_API = "https://api.deezer.com";

/**
 * Requêtes par minute et par adresse IP vers nos routes /api/deezer/*
 * (voir lib/rateLimit.ts) : large pour un hôte qui parcourt des playlists
 * (les comptages de morceaux jouables en consomment un par ligne), mais
 * empêche un script d'épuiser le quota Deezer de tout le site.
 */
export const DEEZER_LIMIT_PER_MINUTE = 150;

export class DeezerApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function deezerGet<T>(path: string, revalidateSeconds = 0): Promise<T> {
  const res = await fetch(`${DEEZER_API}${path}`, {
    headers: { Accept: "application/json" },
    ...(revalidateSeconds > 0 ? { next: { revalidate: revalidateSeconds } } : { cache: "no-store" as const }),
  });
  if (!res.ok) throw new DeezerApiError(`Deezer a répondu ${res.status}.`, res.status === 429 ? 429 : 502);
  const data = (await res.json()) as T & { error?: { code?: number; message?: string } };
  if (data && typeof data === "object" && "error" in data && data.error) {
    // code 4 = quota dépassé, 800 = introuvable (voir doc Deezer).
    const code = data.error.code;
    throw new DeezerApiError(
      code === 4 ? "Deezer limite les requêtes, réessaie dans quelques secondes." : code === 800 ? "Introuvable sur Deezer." : data.error.message ?? "Erreur Deezer.",
      code === 4 ? 429 : code === 800 ? 404 : 502
    );
  }
  return data;
}

type RawPlaylist = {
  id: number;
  title: string;
  nb_tracks?: number;
  picture_medium?: string;
  user?: { name?: string };
  creator?: { name?: string };
};

export type DeezerPlaylistSummary = {
  id: string;
  title: string;
  trackCount: number;
  pictureUrl: string | null;
  creator: string | null;
};

export function toPlaylistSummary(p: RawPlaylist): DeezerPlaylistSummary {
  return {
    id: String(p.id),
    title: p.title,
    trackCount: p.nb_tracks ?? 0,
    pictureUrl: p.picture_medium ?? null,
    creator: p.user?.name ?? p.creator?.name ?? null,
  };
}

export type RawTrack = {
  id: number;
  title: string;
  title_short?: string;
  readable?: boolean;
  preview?: string;
  artist?: { name?: string };
  // Présent seulement sur /track/{id} (pas dans les listes de playlist) :
  // tous les artistes du morceau, artiste principal compris (featurings,
  // duos…).
  contributors?: { name?: string }[];
  album?: { cover_medium?: string };
};

/**
 * Tous les artistes d'un morceau, séparés par des virgules, sans doublon
 * (insensible à la casse) : "Orelsan, Stromae". Repli sur l'artiste
 * principal quand Deezer ne renvoie pas de contributeurs.
 */
export function artistNames(t: RawTrack): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [t.artist?.name, ...(t.contributors ?? []).map((c) => c.name)]) {
    const clean = name?.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    names.push(clean);
  }
  return names.join(", ");
}

export function jsonError(e: unknown) {
  const status = e instanceof DeezerApiError ? e.status : 502;
  const message = e instanceof Error ? e.message : "Erreur Deezer.";
  return Response.json({ error: message }, { status });
}

/** Morceau jouable tel qu'envoyé au navigateur (même forme que la file d'attente). */
export type PlayableTrack = {
  sourceTrackId: string;
  title: string;
  artist: string;
  durationMs: number;
  albumImageUrl: string | null;
};

const MAX_TRACKS = 500;

async function fetchPlayableTracks(id: string): Promise<PlayableTrack[]> {
  const tracks: RawTrack[] = [];
  let index = 0;
  while (tracks.length < MAX_TRACKS) {
    const page = await deezerGet<{ data?: RawTrack[]; next?: string }>(`/playlist/${id}/tracks?limit=100&index=${index}`);
    const items = page.data ?? [];
    tracks.push(...items);
    if (!page.next || items.length === 0) break;
    index += items.length;
  }
  return tracks
    .filter((t) => t.readable !== false && !!t.preview)
    .map((t) => ({
      sourceTrackId: `deezer:${t.id}`,
      title: t.title_short || t.title,
      artist: t.artist?.name ?? "",
      durationMs: 30_000,
      albumImageUrl: t.album?.cover_medium ?? null,
    }));
}

/**
 * Morceaux JOUABLES d'une playlist (ceux qui ont un extrait ; certains n'en
 * ont pas, souvent pour des raisons de droits selon le pays), mis en cache
 * une heure côté serveur : le comptage affiché dans la liste des playlists
 * et l'import qui suit ne refont pas les appels à Deezer. Seuls les
 * identifiants/titres sont gardés en cache, jamais l'URL de l'extrait
 * (règles Deezer, voir en tête de fichier).
 */
export const getPlayableTracks = unstable_cache(fetchPlayableTracks, ["deezer-playable-tracks"], { revalidate: 3600 });
