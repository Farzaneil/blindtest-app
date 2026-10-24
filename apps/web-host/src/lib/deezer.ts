/**
 * Côté navigateur : appels aux routes /api/deezer/* (voir
 * lib/deezerServer.ts) et utilitaires sur les identifiants de morceaux.
 * Un morceau Deezer est identifié dans la file d'attente (et en base, dans
 * rounds.source_track_id) par "deezer:<id>" ; un morceau Spotify garde son
 * identifiant Spotify brut.
 */

import type { spotify } from "@blindtest/api-clients";

export type QueueTrack = spotify.SpotifyTrack;

export type DeezerPlaylistSummary = {
  id: string;
  title: string;
  trackCount: number;
  pictureUrl: string | null;
  creator: string | null;
};

const PREFIX = "deezer:";

export const isDeezerTrackId = (id: string) => id.startsWith(PREFIX);
export const deezerIdOf = (id: string) => id.slice(PREFIX.length);

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Deezer ne répond pas, réessaie.");
  return data;
}

export async function searchDeezerPlaylists(q: string): Promise<DeezerPlaylistSummary[]> {
  return (await getJson<{ playlists: DeezerPlaylistSummary[] }>(`/api/deezer/search?q=${encodeURIComponent(q)}`)).playlists;
}

export async function featuredDeezerPlaylists(): Promise<DeezerPlaylistSummary[]> {
  return (await getJson<{ playlists: DeezerPlaylistSummary[] }>("/api/deezer/featured")).playlists;
}

export async function getDeezerPlaylistInfo(id: string): Promise<DeezerPlaylistSummary> {
  return (await getJson<{ playlist: DeezerPlaylistSummary }>(`/api/deezer/playlist/${id}?info=1`)).playlist;
}

export async function getDeezerPlaylistTracks(id: string): Promise<{ tracks: QueueTrack[]; skipped: number }> {
  return getJson<{ tracks: QueueTrack[]; skipped: number }>(`/api/deezer/playlist/${id}`);
}

export async function getDeezerPreviewUrl(trackId: string): Promise<string> {
  return (await getJson<{ preview: string }>(`/api/deezer/track/${deezerIdOf(trackId)}`)).preview;
}

/** Identifiant de playlist dans un lien collé (deezer.com/fr/playlist/123…). */
export function playlistIdFromLink(text: string): string | null {
  const m = text.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
  return m ? m[1] : null;
}
