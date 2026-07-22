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
 *  - Avant validation "Extended Quota Mode" par Spotify, l'app est limitée à
 *    5 utilisateurs de test en Developer Mode — largement suffisant pour
 *    jouer entre potes, à surveiller si le projet s'ouvre à plus de monde.
 *  - Plusieurs endpoints (recommendations, audio-features, audio-analysis,
 *    related-artists, featured-playlists) sont dépréciés pour les nouvelles
 *    apps depuis nov. 2024 : ne pas construire de logique dessus, se limiter
 *    à Search + la lecture via les SDKs ci-dessus.
 */

export type SpotifyTrack = {
  sourceTrackId: string;
  title: string;
  artist: string;
  durationMs: number;
};

export async function searchTracks(_query: string, _accessToken: string): Promise<SpotifyTrack[]> {
  // TODO: GET https://api.spotify.com/v1/search?type=track
  throw new Error("not implemented");
}

export async function playTrackOnHostDevice(_trackUri: string, _accessToken: string): Promise<void> {
  // TODO mobile: passer par l'App Remote SDK (spotify-app-remote-sdk).
  // TODO web: passer par le Web Playback SDK (player.resume() / connect()).
  throw new Error("not implemented");
}
