/**
 * Wrapper YouTube — source complémentaire (mode aléatoire), envisagée en V2.
 *
 * Contrainte ferme des CGU YouTube API (vérifiée 2026) : le lecteur doit
 * rester VISIBLE à l'écran, toute lecture audio en arrière-plan / lecteur
 * caché est interdite. Concrètement : le composant IFrame Player doit être
 * monté et visible dans l'UI hôte, on ne peut pas se contenter de récupérer
 * un flux audio et le jouer "en fond".
 */
export type YouTubeTrack = {
  sourceTrackId: string; // videoId
  title: string;
  channel: string;
};

export async function searchVideos(_query: string, _apiKey: string): Promise<YouTubeTrack[]> {
  // TODO: GET https://www.googleapis.com/youtube/v3/search
  throw new Error("not implemented");
}
