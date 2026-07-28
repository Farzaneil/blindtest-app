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

/**
 * Erreur typée levée par searchTracks en cas de réponse HTTP non-OK — porte
 * le code de statut et, pour un 429 (quota dépassé, voir le commentaire en
 * tête de fichier sur la limite Developer Mode), le délai indiqué par
 * Spotify dans l'en-tête Retry-After. Permet aux appelants (voir
 * host/page.tsx, handleGenerateGenrePlaylist) de distinguer un vrai souci
 * d'auth (401) d'un simple rate-limit (429, temporaire) plutôt que de
 * deviner à partir du texte du message.
 */
function parseSpotifyErrorReason(bodyText: string): string | null {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { reason?: string } };
    return parsed.error?.reason ?? null;
  } catch {
    return null;
  }
}

export class SpotifySearchError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  // "QUOTA_EXCEEDED" (voir la mise à jour Spotify du 23/07/2026) si connu,
  // extrait du corps de la réponse — permet aux appelants (voir
  // host/page.tsx) de distinguer un vrai dépassement de quota confirmé d'un
  // 429 générique, avant de poser un verrou de longue durée (1h) plutôt
  // qu'une simple pause.
  reason: string | null;

  constructor(status: number, body: string, retryAfterSeconds: number | null) {
    super(`Recherche Spotify échouée (${status}): ${body}`);
    this.name = "SpotifySearchError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.reason = parseSpotifyErrorReason(body);
  }
}

// --- Coupe-circuit local pour le quota Spotify (429 QUOTA_EXCEEDED) -------
//
// Spotify ne documente pas la durée de réinitialisation de ce quota (compté
// par compte développeur depuis la mise à jour du 23/07/2026, pas par app),
// et des retours de développeurs suggèrent que ça peut se compter en heures,
// pas en secondes (contrairement au rate-limit classique, fenêtre glissante
// de 30s). Sans garde-fou, chaque action de l'hôte continuerait à
// interroger Spotify en pure perte tant que le quota est dépassé.
//
// IMPORTANT — le quota n'est PAS un seul bucket global pour toute l'API :
// constaté en usage réel, /me/playlists et /playlists/{id}/items continuent
// de répondre normalement pendant que /search renvoie 429 QUOTA_EXCEEDED.
// Le coupe-circuit est donc scindé en deux catégories indépendantes plutôt
// qu'un seul verrou partagé — sans ça, un quota de recherche dépassé
// bloquerait à tort l'import de playlist, qui lui fonctionne toujours.
type QuotaCategory = "search" | "playlists";

const QUOTA_BLOCK_COOLDOWN_MS = 60 * 60 * 1000; // 1h — valeur prudente, pas de chiffre officiel disponible

function quotaStorageKey(category: QuotaCategory): string {
  return `blindtest_spotify_quota_blocked_until__${category}`;
}

function getQuotaBlockedUntil(category: QuotaCategory): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(quotaStorageKey(category)) ?? 0);
  } catch {
    return 0;
  }
}

function setQuotaBlockedUntil(category: QuotaCategory, timestampMs: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(quotaStorageKey(category), String(timestampMs));
  } catch {
    // localStorage indisponible (navigation privée...) : le coupe-circuit
    // ne survivra pas à un F5, mais reste actif pour le reste de la session.
  }
}

function getQuotaCooldownRemainingSecondsFor(category: QuotaCategory): number {
  const remaining = getQuotaBlockedUntil(category) - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Secondes restantes avant la fin du coupe-circuit pour la recherche
 * (recherche manuelle ET génération de playlist par genre, qui passent
 * toutes les deux par searchTracks) — 0 si aucun blocage actif. Exposé pour
 * que l'UI (voir host/page.tsx) désactive les boutons concernés et affiche
 * un message plutôt que de laisser l'hôte cliquer dans le vide.
 */
export function getSearchQuotaCooldownRemainingSeconds(): number {
  return getQuotaCooldownRemainingSecondsFor("search");
}

/**
 * Secondes restantes avant la fin du coupe-circuit pour les playlists
 * (chargement de la liste + import du contenu) — indépendant du quota de
 * recherche, voir le commentaire plus haut sur pourquoi ces deux catégories
 * sont séparées.
 */
export function getPlaylistsQuotaCooldownRemainingSeconds(): number {
  return getQuotaCooldownRemainingSecondsFor("playlists");
}

/**
 * À appeler en tout début de toute fonction qui appelle l'API Spotify, avec
 * la catégorie de quota concernée. Lève SpotifySearchError(429, ...)
 * immédiatement, sans aucun appel réseau, si un 429 QUOTA_EXCEEDED a été
 * détecté sur cette catégorie il y a moins de QUOTA_BLOCK_COOLDOWN_MS.
 */
function assertNotQuotaBlocked(category: QuotaCategory): void {
  const remainingSeconds = getQuotaCooldownRemainingSecondsFor(category);
  if (remainingSeconds > 0) {
    throw new SpotifySearchError(
      429,
      '{"error":{"status":429,"message":"Quota Spotify probablement toujours dépassé (coupe-circuit local, aucune requête envoyée)","reason":"QUOTA_EXCEEDED"}}',
      remainingSeconds
    );
  }
}

/**
 * À appeler juste après avoir reçu une réponse HTTP non-OK de Spotify, avec
 * la catégorie concernée, son statut et le corps de la réponse déjà lu —
 * active le coupe-circuit de cette catégorie si (et seulement si) c'est
 * bien un 429 avec reason: QUOTA_EXCEEDED (pas un simple rate-limit
 * passager, ni une autre erreur 4xx/5xx).
 */
function recordIfQuotaExceeded(category: QuotaCategory, status: number, bodyText: string): void {
  if (status !== 429) return;
  if (parseSpotifyErrorReason(bodyText) === "QUOTA_EXCEEDED") {
    setQuotaBlockedUntil(category, Date.now() + QUOTA_BLOCK_COOLDOWN_MS);
  }
  // Corps non-JSON ou reason différent : impossible de confirmer que c'est
  // un QUOTA_EXCEEDED, on n'active pas le coupe-circuit par prudence (mieux
  // vaut risquer un 429 de plus que bloquer l'app pour une erreur qui n'en
  // est peut-être pas une).
}

export async function searchTracks(query: string, accessToken: string): Promise<SpotifyTrack[]> {
  if (!query.trim()) return [];
  assertNotQuotaBlocked("search");

  const params = new URLSearchParams({ q: query, type: "track", limit: "10" });
  const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    recordIfQuotaExceeded("search", res.status, text);
    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
    throw new SpotifySearchError(res.status, text, retryAfterSeconds);
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
 * Recherche les morceaux d'un artiste précis, éventuellement restreints à
 * une plage d'années — utilisé par la génération de playlist par genre
 * (voir host/page.tsx, handleGenerateGenrePlaylist et
 * packages/game-logic/genrePresets.ts pour les listes d'artistes curées).
 *
 * Champs de filtre `artist:`/`year:` de l'API Search, toujours disponibles
 * après les changements Spotify de février 2026 (contrairement à
 * `/recommendations` ou `/artists/{id}/top-tracks`, tous deux retirés) —
 * seule la LIMITE de résultats a changé (max 10 au lieu de 50, déjà pris en
 * compte par searchTracks ci-dessus). Pas de tri par popularité possible
 * (champ retiré de l'API) : les résultats sont dans l'ordre de pertinence
 * renvoyé par Spotify, à mélanger côté appelant si on veut de la variété.
 */
export async function searchArtistTracks(
  artistName: string,
  yearRange: { from: number; to: number } | null,
  accessToken: string
): Promise<SpotifyTrack[]> {
  let query = `artist:"${artistName}"`;
  if (yearRange) {
    query += ` year:${yearRange.from}-${yearRange.to}`;
  }
  return searchTracks(query, accessToken);
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
  assertNotQuotaBlocked("playlists");
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    recordIfQuotaExceeded("playlists", res.status, text);
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
    assertNotQuotaBlocked("playlists");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const text = await res.text();
      recordIfQuotaExceeded("playlists", res.status, text);
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
    assertNotQuotaBlocked("playlists");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error(
          "Spotify refuse l’accès au contenu de cette playlist : ça ne marche que pour tes propres playlists (ou celles où tu es collaborateur). Les playlists juste suivies, ou générées automatiquement par Spotify (Découvertes de la semaine, Daily Mix, Radar des sorties…), ne sont pas accessibles via l’API — choisis une playlist que tu as créée toi-même."
        );
      }
      const text = await res.text();
      recordIfQuotaExceeded("playlists", res.status, text);
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
