/**
 * Wrapper Deezer — NON RECOMMANDÉ comme source principale (voir blueprint,
 * section 4) : CGU restrictives (pas de stockage même temporaire des
 * extraits, retours de développeurs suggérant que l'usage en jeu type
 * "rhythm game"/quiz n'est pas souhaité par Deezer sans accord commercial).
 *
 * Laissé en stub pour référence future si un accord commercial devient
 * pertinent (V3+).
 */
export type DeezerTrack = {
  sourceTrackId: string;
  title: string;
  artist: string;
};

export async function searchTracks(_query: string): Promise<DeezerTrack[]> {
  throw new Error("not implemented — voir avertissement CGU dans ce fichier");
}
