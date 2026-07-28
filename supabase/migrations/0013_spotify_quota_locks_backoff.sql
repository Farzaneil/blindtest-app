-- ============================================================================
-- Backoff exponentiel pour le verrou quota Spotify (voir 0012_spotify_quota_
-- locks.sql, apps/web-host/src/lib/spotifyQuotaLock.ts et
-- packages/api-clients/src/spotify.ts).
--
-- Spotify ne documente aucun délai de réinitialisation pour ce quota — un
-- délai fixe deviné au hasard est soit trop court (on a constaté un 429
-- encore actif après seulement 1h d'attente), soit trop long (on bloquerait
-- l'app inutilement si le quota s'est en fait débloqué plus vite). Avec
-- cette colonne, chaque nouvelle confirmation QUOTA_EXCEEDED consécutive
-- double la durée du blocage (1h, 2h, 4h, 8h...), plafonnée à 24h côté
-- application — et repart à zéro dès qu'une requête réussit à nouveau pour
-- la catégorie concernée.
-- ============================================================================

alter table spotify_quota_locks add column if not exists consecutive_hits integer not null default 1;
