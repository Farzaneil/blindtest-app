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
 * la page /spotify-test). Coupe la lecture ailleurs (téléphone, enceinte
 * connectée...) et la transfère sur ce device, comme le ferait l'app
 * Spotify normale quand on choisit un appareil de diffusion.
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

  // 204 No Content = succès normal pour cet endpoint.
  if (!res.ok && res.status !== 204) {
    if (res.status === 404) {
      throw new Error(
        "Le lecteur Spotify de cet onglet a disparu (device introuvable). Ça arrive si l’app Spotify a été ouverte manuellement sur le même appareil, ou si l’onglet a été mis en arrière-plan trop longtemps (fréquent sur iOS). Recharge la page pour reconnecter le lecteur, sans rouvrir l’app Spotify pendant la partie."
      );
    }
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

/**
 * Reprend la lecture là où elle avait été mise en pause (pausePlayback
 * ci-dessus) — PAS un nouveau lancement de morceau : volontairement AUCUN
 * body dans la requête, ce qui indique à Spotify "reprends la lecture en
 * cours sur cet appareil" plutôt que "lance ce morceau depuis le début".
 * Utilisé côté hôte (mode "Maître du jeu") quand une réponse partielle ou
 * fausse relance la manche pour laisser retrouver l'élément manquant : la
 * chanson doit reprendre exactement où elle s'était arrêtée, pas repartir
 * de zéro.
 */
export async function resumePlayback(deviceId: string, accessToken: string): Promise<void> {
  const params = new URLSearchParams({ device_id: deviceId });
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?${params.toString()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Reprise de la lecture Spotify échouée (${res.status}): ${text}`);
  }
}

// ============================================================================
// Import de playlists Spotify existantes — alternative à la recherche morceau
// par morceau : récupère tous les titres d'une playlist déjà créée sur
// Spotify (perso ou publique suivie) pour les ajouter d'un coup à la file
// d'attente côté hôte. Nécessite le scope OAuth "playlist-read-private" (et
// "playlist-read-collaborative" pour les playlists collaboratives) en plus
// des scopes de lecture — voir apps/web-host/src/lib/spotifyAuth.ts.
// ============================================================================

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string | null;
};

type SpotifyPlaylistsResponse = {
  items: Array<{
    id: string;
    name: string;
    images?: Array<{ url: string }>;
    // Spotify a renommé ce champ "tracks" -> "items" sur l'objet playlist
    // (changelog API février 2026). On garde les deux en lecture pour rester
    // robuste si l'ancien nom revenait un jour (cf. leurs "reverts" de mars
    // 2026 sur d'autres champs).
    items?: { total: number };
    tracks?: { total: number };
    owner?: { id: string };
    collaborative?: boolean;
  }>;
  next: string | null;
};

/**
 * Récupère l'ID Spotify de l'utilisateur connecté, pour pouvoir filtrer ses
 * propres playlists (voir listUserPlaylists ci-dessous).
 */
async function getCurrentUserId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Impossible de récupérer le profil Spotify (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/**
 * Liste les playlists dont l'utilisateur connecté est PROPRIÉTAIRE ou
 * COLLABORATEUR (y compris privées grâce au scope playlist-read-private).
 * Suit la pagination Spotify jusqu'au bout (limite 50 par page côté API).
 *
 * GET /me/playlists renvoie aussi les playlists juste suivies sans droit
 * d'édition (créées par quelqu'un d'autre, ou générées par Spotify comme
 * Découvertes de la semaine) — elles sont filtrées ici via owner.id et
 * collaborative, car getPlaylistTracks renverra de toute façon un 403
 * dessus : Spotify ne permet l'accès au contenu qu'aux playlists dont on
 * est propriétaire ou collaborateur, sans contournement possible (vérifié,
 * ce n'est pas une limite de ce code).
 */
export async function listUserPlaylists(accessToken: string): Promise<SpotifyPlaylistSummary[]> {
  const userId = await getCurrentUserId(accessToken);
  const playlists: SpotifyPlaylistSummary[] = [];
  let url: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chargement des playlists Spotify échoué (${res.status}): ${text}`);
    }
    const data = (await res.json()) as SpotifyPlaylistsResponse;
    for (const item of data.items) {
      // Autorisé si on est propriétaire OU collaborateur (les playlists
      // collaboratives partagées entre potes sont accessibles en lecture
      // même sans en être l'auteur — voir la note sur getPlaylistTracks).
      // Les playlists juste suivies (publiques, éditoriales Spotify comme
      // Découvertes de la semaine, ou d'un autre utilisateur sans être
      // collaborateur) restent exclues : Spotify bloque leur contenu sans
      // contournement possible depuis février 2026.
      if (item.owner?.id !== userId && !item.collaborative) continue;
      playlists.push({
        id: item.id,
        name: item.name,
        trackCount: item.items?.total ?? item.tracks?.total ?? 0,
        imageUrl: item.images?.[0]?.url ?? null,
      });
    }
    url = data.next;
  }

  return playlists;
}

type SpotifyPlaylistItemsResponse = {
  items: Array<{
    item: {
      id: string;
      name: string;
      type: string;
      duration_ms: number;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    } | null;
  }>;
  next: string | null;
};

/**
 * Récupère tous les morceaux d'une playlist Spotify (suit la pagination,
 * limite 50 par page côté API — Spotify a retiré l'ancien endpoint
 * GET /playlists/{id}/tracks en février 2026 au profit de
 * GET /playlists/{id}/items, utilisé ici). Ignore les épisodes de podcast
 * et les pistes locales/supprimées (item null), qui n'ont pas de sens pour
 * un blind test.
 *
 * Limite connue (imposée par Spotify, pas par ce code) : cet endpoint ne
 * renvoie les morceaux QUE pour les playlists dont l'utilisateur connecté
 * est propriétaire ou collaborateur. Une playlist juste suivie (créée par
 * quelqu'un d'autre) ou générée automatiquement par Spotify (Découvertes de
 * la semaine, Daily Mix, Radar des sorties...) renvoie un 403 Forbidden —
 * ce n'est pas un bug côté app, Spotify bloque l'accès au contenu de ces
 * playlists via l'API, même si elles apparaissent dans la liste renvoyée
 * par listUserPlaylists.
 */
export async function getPlaylistTracks(playlistId: string, accessToken: string): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50&fields=` +
    encodeURIComponent("items(item(id,name,type,duration_ms,artists(name),album(images))),next");

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          "Spotify refuse l’accès au contenu de cette playlist : ça ne marche que pour tes propres playlists (ou celles où tu es collaborateur). Les playlists juste suivies, ou générées automatiquement par Spotify (Découvertes de la semaine, Daily Mix, Radar des sorties…), ne sont pas accessibles via l’API — choisis une playlist que tu as créée toi-même."
        );
      }
      const text = await res.text();
      throw new Error(`Chargement de la playlist Spotify échoué (${res.status}): ${text}`);
    }
    const data = (await res.json()) as SpotifyPlaylistItemsResponse;
    for (const entry of data.items) {
      const item = entry.item;
      if (!item || item.type !== "track") continue; // ignore podcasts / pistes supprimées
      tracks.push({
        sourceTrackId: item.id,
        title: item.name,
        artist: item.artists.map((a) => a.name).join(", "),
        durationMs: item.duration_ms,
        albumImageUrl: item.album?.images?.[0]?.url ?? null,
      });
    }
    url = data.next;
  }

  return tracks;
}
