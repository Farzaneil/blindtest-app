-- ============================================================================
-- Avatars "La Bande-Son" (voir apps/web-host/src/lib/avatars.tsx).
--
-- - player_accounts : avatar choisi par le compte et couleur de son rond,
--   lisibles publiquement (affichés aux autres joueurs, comme le pseudo).
--   Écriture réservée au serveur (route api/player-account/update-avatar,
--   clé service_role), comme pour le pseudo.
-- - players : copie de l'avatar au moment de rejoindre une partie (pour
--   l'afficher sans requête supplémentaire). Vide pour un invité : son
--   avatar est alors tiré de son pseudo côté client.
--
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

alter table player_accounts add column if not exists avatar_key text;
alter table player_accounts add column if not exists avatar_color text;
-- Effet spécial équipé (or, animé, chapeau de saison...), voir lib/avatarExtras.ts.
alter table player_accounts add column if not exists avatar_extra text;
grant select (avatar_key, avatar_color, avatar_extra) on player_accounts to anon, authenticated;

alter table players add column if not exists avatar_key text;
alter table players add column if not exists avatar_color text;
alter table players add column if not exists avatar_extra text;
grant insert (avatar_key, avatar_color, avatar_extra) on players to anon, authenticated;
