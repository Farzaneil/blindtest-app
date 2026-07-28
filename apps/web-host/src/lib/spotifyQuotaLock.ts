import { supabase } from "./supabase";

/**
 * Verrou PARTAGÉ (coupe-circuit) pour le quota Spotify — voir la migration
 * 0012_spotify_quota_locks.sql pour le pourquoi (le coupe-circuit local en
 * localStorage, dans packages/api-clients/src/spotify.ts, ne protège qu'UN
 * navigateur ; celui-ci est visible par toute session qui ouvre /host, quel
 * que soit l'appareil, synchronisé en direct via Supabase Realtime).
 *
 * "search" (recherche manuelle + génération de playlist par genre) et
 * "playlists" (chargement + import de playlist) sont des quotas
 * indépendants côté Spotify — voir le commentaire sur QuotaCategory dans
 * spotify.ts.
 *
 * consecutive_hits (voir 0013_spotify_quota_locks_backoff.sql) sert au
 * backoff exponentiel : Spotify ne documentant aucun délai de
 * réinitialisation, chaque confirmation QUOTA_EXCEEDED consécutive double
 * la durée du blocage plutôt que de deviner un chiffre fixe qui serait
 * presque sûrement faux (trop court ou trop long) — voir host/page.tsx,
 * computeQuotaBackoffMs.
 */
export type SpotifyQuotaCategory = "search" | "playlists";

export type SpotifyQuotaLockState = { blockedUntil: string; consecutiveHits: number };

export type SpotifyQuotaLocks = Partial<Record<SpotifyQuotaCategory, SpotifyQuotaLockState>>;

/**
 * Récupère l'état actuel des verrous (une entrée par catégorie déjà
 * bloquée ; absente si jamais bloquée, ou si redevenue saine — voir
 * clearSpotifyQuotaLock) — utilisé au montage de /host avant que
 * l'abonnement Realtime ci-dessous ne prenne le relais.
 */
export async function getSpotifyQuotaLocks(): Promise<SpotifyQuotaLocks> {
  const { data } = await supabase
    .from("spotify_quota_locks")
    .select("category, blocked_until, consecutive_hits");
  const locks: SpotifyQuotaLocks = {};
  for (const row of data ?? []) {
    locks[row.category as SpotifyQuotaCategory] = {
      blockedUntil: row.blocked_until,
      consecutiveHits: row.consecutive_hits,
    };
  }
  return locks;
}

/**
 * Pose (ou prolonge) le verrou partagé pour une catégorie — appelé juste
 * après un 429 QUOTA_EXCEEDED confirmé (voir host/page.tsx). Toute session
 * abonnée (ce navigateur ET tous les autres, y compris ceux ouverts plus
 * tard) verra le changement quasi instantanément via Realtime plutôt que de
 * devoir attendre un prochain essai raté pour l'apprendre.
 */
export async function setSpotifyQuotaLock(
  category: SpotifyQuotaCategory,
  blockedUntilIso: string,
  consecutiveHits: number
): Promise<void> {
  await supabase.from("spotify_quota_locks").upsert({
    category,
    blocked_until: blockedUntilIso,
    consecutive_hits: consecutiveHits,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Efface le verrou d'une catégorie — appelé après une requête RÉUSSIE (voir
 * host/page.tsx) pour confirmer que le quota s'est effectivement débloqué,
 * afin que le PROCHAIN dépassement reparte de 1h plutôt que de rester
 * escaladé sur une durée déjà longue.
 */
export async function clearSpotifyQuotaLock(category: SpotifyQuotaCategory): Promise<void> {
  await supabase.from("spotify_quota_locks").delete().eq("category", category);
}

/**
 * S'abonne aux changements du verrou partagé — rappelle onChange avec
 * l'état complet (toutes catégories) à chaque insert/update/delete, y
 * compris tout de suite au montage (contrairement aux autres subscribeTo*
 * de rooms.ts, pas besoin d'un fetch initial séparé ici :
 * getSpotifyQuotaLocks() est appelé une fois par l'appelant avant de
 * s'abonner, voir host/page.tsx).
 */
export function subscribeToSpotifyQuotaLocks(onChange: (locks: SpotifyQuotaLocks) => void) {
  const fetchAndEmit = async () => {
    onChange(await getSpotifyQuotaLocks());
  };

  const channel = supabase
    .channel("spotify-quota-locks")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "spotify_quota_locks" },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
