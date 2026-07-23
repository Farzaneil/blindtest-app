/**
 * Wrapper Spotify — source musicale prioritaire du MVP (voir blueprint,
 * section 4).
 *
 * Contraintes vérifiées (2026), à garder en tête en implémentant :
 *  - Lire un titre à la demande exige un compte Premium sur l'appareil qui
 *    joue le son. Dans notre modèle, SEUL l'hôte a besoin d'être Premium :
 *      - Sur mobile : App Remote SDK (contrôle l'app Spotify installée sur
 *        le téléphone hôte).
 *      - Sur le web hôte : Web Playback SDK (lecture dans le navigateur,
 *        utile pour le mode "laptop branché à la TV").
 *  - preview_url (extraits 30s) est mort pour toute app créée après le
 *    27/11/2024 : on ne peut PLUS s'appuyer dessus, seule la lecture via un
 *    des deux SDKs ci-dessus fonctionne (d'où le compte Premium obligatoire).
 *  - Avant validation "Extended Quota Mode" par Spotify, l'app est limitée à
 *    5 utilisateurs de test en Developer Mode — largement suffisant pour
 *    jouer entre potes, à surveiller si le projet s'ouvre à plus de monde.
 *  - Plusieurs endpoints (recommendations, audio-features, audio-analysis,
 *    related-artists, featured-playlists) sont dépréciés pour les nouvelles
 *    apps depuis nov. 2024 : ne pas construire de logique dessus, se limiter
 *    à Search + la lecture via les SDKs ci-dessus.
 *
 * Ce fichier ne gère PAS l'auth (voir apps/web-host/src/lib/spotifyAuth.ts) :
 * il prend un accessToken déjà valide en paramètre, obtenu via
 * GET /api/spotify/token côté web-host.
 */

export type SpotifyTrack = {
  sourceTrackId: string;
  title: string;
  artist: string;
  durationMs: number;
  albumImageUrl: string | null;
};

type SpotifySearchResponse = {
  tracks?: {
    items: Array<{
      id: string;
      name: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    }>;
  };
};

export async function searchTracks(query: string, accessToken: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Recherche Spotify échouée (${res.status}): ${text}`);
  }

  const data = (await res.json()) as SpotifySearchResponse;
  const items = data.tracks?.items ?? [];

  return items.map((item) => ({
    sourceTrackId: item.id,
    title: item.name,
    artist: item.artists.map((a) => a.name).join(", "),
    durationMs: item.duration_ms,
    albumImageUrl: item.album?.images?.[0]?.url ?? null,
  }));
}

/**
 * Lance la lecture d'un morceau sur l'appareil hôte du Web Playback SDK
 * (celui identifié par deviceId, obtenu via l'event "ready" du player — voir
 * la page /spotify-test). Coupe la lecture ailleurs et la transfère sur ce
 * device, comme le ferait l'app Spotify normale quand on choisit un
 * appareil de diffusion.
 */
export async function playTrackOnHostDevice(
  trackId: string,
  deviceId: string,
  accessToken: string,
  positionMs = 0
): Promise<void> {
  const params = new URLSearchParams({ device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?${params.toString()}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris: [`spotify:track:${trackId}`],
      position_ms: positionMs,
    }),
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Lecture Spotify échouée (${res.status}): ${text}`);
  }
}

export async function pausePlayback(deviceId: string, accessToken: string): Promise<void> {
  const params = new URLSearchParams({ device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/pause?${params.toString()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Pause Spotify échouée (${res.status}): ${text}`);
  }
}
