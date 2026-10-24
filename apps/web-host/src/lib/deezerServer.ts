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

const DEEZER_API = "https://api.deezer.com";

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
  album?: { cover_medium?: string };
};

export function jsonError(e: unknown) {
  const status = e instanceof DeezerApiError ? e.status : 502;
  const message = e instanceof Error ? e.message : "Erreur Deezer.";
  return Response.json({ error: message }, { status });
}
