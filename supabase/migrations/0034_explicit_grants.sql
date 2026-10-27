-- ============================================================================
-- Droits explicites sur toutes les tables (changement Supabase du 30/10/2026)
-- + correctif de confidentialité.
--
-- 1) CORRECTIF : player_accounts était lisible EN ENTIER avec la clé
--    publique (anon), adresse e-mail comprise. Les migrations 0020/0030 ne
--    donnaient la lecture que de certaines colonnes, mais Supabase avait
--    aussi accordé automatiquement la lecture de TOUTE la table, ce qui
--    annulait cette restriction (la policy RLS laisse lire toutes les
--    lignes). Désormais : uniquement les colonnes affichées aux autres
--    joueurs (pseudo, avatar, XP). L'e-mail n'est lu que par les routes
--    serveur (service_role).
--
-- 2) Depuis le 30/10/2026, Supabase n'accorde plus automatiquement l'accès
--    aux nouvelles tables : rejouer les migrations sur un projet neuf
--    donnerait des tables inaccessibles. Cette migration écrit donc noir
--    sur blanc les droits de chaque table (état réel relevé en prod le
--    27/10/2026), en retirant au passage tout ce qui ne sert pas
--    (TRUNCATE, TRIGGER, REFERENCES, écritures non couvertes par une
--    policy) : les clients ne gardent que la lecture et les quelques
--    insertions réellement utilisées.
--
-- Sans effet visible sur le jeu. À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

begin;

-- Point de départ commun : aucun droit pour les clients, tout pour le
-- serveur (routes API avec la clé service_role).
do $$
declare
  t text;
begin
  foreach t in array array[
    'answers', 'buzzes', 'player_account_providers', 'player_accounts',
    'player_badge_progress', 'player_badge_unlocks', 'player_cosmetics',
    'players', 'playlists', 'rate_limits', 'rejoin_requests',
    'room_genres_used', 'room_hosts', 'room_playlist_imports', 'rooms',
    'round_attempts', 'rounds', 'spotify_quota_locks', 'teams'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- Lecture publique (temps réel du jeu, profils, classement). Les lignes
-- visibles restent filtrées par les policies RLS de chaque table.
grant select on table
  public.rooms, public.players, public.teams, public.rounds, public.buzzes,
  public.round_attempts, public.rejoin_requests,
  public.room_genres_used, public.room_playlist_imports,
  public.player_badge_progress, public.player_badge_unlocks, public.player_cosmetics,
  public.spotify_quota_locks
to anon, authenticated;

-- Comptes : seulement ce qui est affiché aux autres joueurs (jamais
-- l'e-mail, ni l'identifiant de connexion).
grant select (id, pseudo, avatar_url, xp, avatar_key, avatar_color, avatar_extra)
  on table public.player_accounts to anon, authenticated;

-- Rejoindre une partie (voir lib/rooms.ts : joinRoomByCode, joinRoomAsHost).
grant insert (room_id, team_id, display_name, device_id, is_host, account_id, avatar_key, avatar_color, avatar_extra)
  on table public.players to anon, authenticated;

-- Buzzer (résolu ensuite par le trigger resolve_buzz_winner).
grant insert (round_id, player_id) on table public.buzzes to anon, authenticated;

-- Coupe-circuit quota Spotify partagé (voir lib/spotifyQuotaLock.ts).
grant insert, update, delete on table public.spotify_quota_locks to anon, authenticated;

-- answers, playlists (inutilisées), player_account_providers, room_hosts,
-- rate_limits : aucun droit client (fonctions security definer ou serveur).

commit;

notify pgrst, 'reload schema';
