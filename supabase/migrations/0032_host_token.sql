-- ============================================================================
-- Sécurité avant la bêta publique : jeton secret d'hôte.
--
-- Avant : toutes les actions de l'hôte (juger une réponse, lancer une manche,
-- attribuer l'XP, gérer les équipes, terminer la partie…) étaient appelables
-- par n'importe quel client connaissant l'identifiant de la partie ou de la
-- manche (identifiants lisibles publiquement). Un joueur un peu technique
-- pouvait donc tricher ou saboter la partie d'un autre.
--
-- Après :
-- - create_room() crée la partie ET un jeton secret (room_hosts, table
--   jamais lisible par les clients), renvoyé une seule fois à l'écran hôte,
--   qui le garde dans l'onglet (sessionStorage, voir lib/rooms.ts).
-- - Chaque action d'hôte exige ce jeton (assert_room_host). Les fonctions
--   d'origine sont renommées internal_* et ne sont plus appelables par les
--   clients ; des fonctions du même nom, avec p_host_token en plus, les
--   enveloppent.
-- - Les écritures directes encore ouvertes (création de partie, statut et
--   réglages de la partie, création de manche, équipes, traces de badges)
--   sont fermées et passent par des fonctions avec jeton.
--
-- Les parties créées avant cette migration n'ont pas de jeton : l'écran
-- hôte en recrée automatiquement une neuve (voir app/host/page.tsx).
--
-- À exécuter dans le SQL Editor de Supabase, PUIS déployer le code (les
-- deux vont ensemble : l'ancien code ne peut plus piloter de partie).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Jetons d'hôte
-- ----------------------------------------------------------------------------
create table if not exists room_hosts (
  room_id    uuid primary key references rooms(id) on delete cascade,
  host_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table room_hosts enable row level security;
-- Aucune policy, aucun droit : illisible et inscriptible uniquement par les
-- fonctions SECURITY DEFINER ci-dessous.
revoke all on room_hosts from public, anon, authenticated;

create or replace function assert_room_host(p_room_id uuid, p_host_token uuid)
returns void as $$
begin
  if p_room_id is null or p_host_token is null or not exists (
    select 1 from room_hosts where room_id = p_room_id and host_token = p_host_token
  ) then
    raise exception 'Action réservée à l''hôte de la partie.' using errcode = '42501';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
revoke all on function assert_room_host(uuid, uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Création de partie (remplace l'insert direct dans rooms)
-- ----------------------------------------------------------------------------
create or replace function create_room(p_code text)
returns json as $$
declare
  v_room rooms;
  v_token uuid;
begin
  if p_code is null or p_code !~ '^[A-Z0-9]{4,8}$' then
    raise exception 'Code de partie invalide.' using errcode = '22023';
  end if;
  insert into rooms (code, status) values (p_code, 'lobby') returning * into v_room;
  insert into room_hosts (room_id) values (v_room.id) returning host_token into v_token;
  return json_build_object('room', to_json(v_room), 'host_token', v_token);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
revoke all on function create_room(text) from public;
grant execute on function create_room(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Fermeture des écritures directes
-- ----------------------------------------------------------------------------
drop policy if exists "dev: creation libre rooms" on rooms;
drop policy if exists "dev: maj libre rooms" on rooms;
revoke insert, update, delete on rooms from anon, authenticated;

drop policy if exists "dev: creation libre rounds" on rounds;
drop policy if exists "dev: maj libre rounds" on rounds;
revoke insert, update, delete on rounds from anon, authenticated;

drop policy if exists "dev: creation libre teams" on teams;
revoke insert, update, delete on teams from anon, authenticated;

drop policy if exists "insert libre room_genres_used" on room_genres_used;
revoke insert, update, delete on room_genres_used from anon, authenticated;
drop policy if exists "insert libre room_playlist_imports" on room_playlist_imports;
revoke insert, update, delete on room_playlist_imports from anon, authenticated;

-- Ancienne fonction remplacée depuis 0008, au cas où elle existerait encore.
drop function if exists resolve_round(uuid, boolean);
-- Déblocages de cosmétiques : appelée seulement depuis award_game_rewards.
revoke execute on function award_cosmetic_unlocks(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Fonctions d'hôte existantes : renommées internal_* (plus appelables par
--    les clients) et enveloppées par une version avec jeton.
-- ----------------------------------------------------------------------------
alter function resolve_round_attempt(uuid, boolean, boolean, boolean) rename to internal_resolve_round_attempt;
alter function reveal_round(uuid) rename to internal_reveal_round;
alter function timeout_round(uuid) rename to internal_timeout_round;
alter function reset_room_scores(uuid) rename to internal_reset_room_scores;
alter function award_game_rewards(uuid) rename to internal_award_game_rewards;
alter function configure_room_teams(uuid, int) rename to internal_configure_room_teams;
alter function rename_team(uuid, text) rename to internal_rename_team;
alter function set_player_team(uuid, uuid) rename to internal_set_player_team;
alter function shuffle_room_teams(uuid) rename to internal_shuffle_room_teams;
alter function assign_unassigned_players(uuid) rename to internal_assign_unassigned_players;
alter function remove_host_player(uuid) rename to internal_remove_host_player;
alter function resolve_rejoin_request(uuid, boolean) rename to internal_resolve_rejoin_request;

revoke execute on function internal_resolve_round_attempt(uuid, boolean, boolean, boolean) from public, anon, authenticated;
revoke execute on function internal_reveal_round(uuid) from public, anon, authenticated;
revoke execute on function internal_timeout_round(uuid) from public, anon, authenticated;
revoke execute on function internal_reset_room_scores(uuid) from public, anon, authenticated;
revoke execute on function internal_award_game_rewards(uuid) from public, anon, authenticated;
revoke execute on function internal_configure_room_teams(uuid, int) from public, anon, authenticated;
revoke execute on function internal_rename_team(uuid, text) from public, anon, authenticated;
revoke execute on function internal_set_player_team(uuid, uuid) from public, anon, authenticated;
revoke execute on function internal_shuffle_room_teams(uuid) from public, anon, authenticated;
revoke execute on function internal_assign_unassigned_players(uuid) from public, anon, authenticated;
revoke execute on function internal_remove_host_player(uuid) from public, anon, authenticated;
revoke execute on function internal_resolve_rejoin_request(uuid, boolean) from public, anon, authenticated;

-- Manches
create or replace function resolve_round_attempt(
  p_host_token uuid, p_round_id uuid, p_title_found boolean, p_artist_found boolean, p_force_end boolean
) returns void as $$
begin
  perform assert_room_host((select room_id from rounds where id = p_round_id), p_host_token);
  perform internal_resolve_round_attempt(p_round_id, p_title_found, p_artist_found, p_force_end);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function reveal_round(p_host_token uuid, p_round_id uuid) returns void as $$
begin
  perform assert_room_host((select room_id from rounds where id = p_round_id), p_host_token);
  perform internal_reveal_round(p_round_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function timeout_round(p_host_token uuid, p_round_id uuid) returns void as $$
begin
  perform assert_room_host((select room_id from rounds where id = p_round_id), p_host_token);
  perform internal_timeout_round(p_round_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Partie
create or replace function reset_room_scores(p_host_token uuid, p_room_id uuid) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  perform internal_reset_room_scores(p_room_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function award_game_rewards(p_host_token uuid, p_room_id uuid) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  perform internal_award_game_rewards(p_room_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Équipes
create or replace function configure_room_teams(p_host_token uuid, p_room_id uuid, p_team_count int) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  perform internal_configure_room_teams(p_room_id, p_team_count);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function rename_team(p_host_token uuid, p_team_id uuid, p_name text) returns void as $$
begin
  perform assert_room_host((select room_id from teams where id = p_team_id), p_host_token);
  perform internal_rename_team(p_team_id, p_name);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function set_player_team(p_host_token uuid, p_player_id uuid, p_team_id uuid) returns void as $$
begin
  perform assert_room_host((select room_id from players where id = p_player_id), p_host_token);
  perform internal_set_player_team(p_player_id, p_team_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function shuffle_room_teams(p_host_token uuid, p_room_id uuid) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  perform internal_shuffle_room_teams(p_room_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function assign_unassigned_players(p_host_token uuid, p_room_id uuid) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  perform internal_assign_unassigned_players(p_room_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Joueurs
create or replace function remove_host_player(p_host_token uuid, p_player_id uuid) returns void as $$
begin
  perform assert_room_host((select room_id from players where id = p_player_id), p_host_token);
  perform internal_remove_host_player(p_player_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function resolve_rejoin_request(p_host_token uuid, p_request_id uuid, p_accept boolean) returns void as $$
begin
  perform assert_room_host((select room_id from rejoin_requests where id = p_request_id), p_host_token);
  perform internal_resolve_rejoin_request(p_request_id, p_accept);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 5. Nouvelles fonctions d'hôte (remplacent les écritures directes)
-- ----------------------------------------------------------------------------
create or replace function set_room_status(p_host_token uuid, p_room_id uuid, p_status text) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  if p_status not in ('in_progress', 'finished') then
    raise exception 'Statut invalide.' using errcode = '22023';
  end if;
  update rooms set status = p_status where id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Réglages bonus/malus (voir 0018) : seules les clés présentes changent.
create or replace function update_room_settings(p_host_token uuid, p_room_id uuid, p_settings jsonb) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  update rooms set
    bonus_joker_enabled          = coalesce((p_settings->>'bonus_joker_enabled')::boolean, bonus_joker_enabled),
    bonus_speed_enabled          = coalesce((p_settings->>'bonus_speed_enabled')::boolean, bonus_speed_enabled),
    bonus_remontada_enabled      = coalesce((p_settings->>'bonus_remontada_enabled')::boolean, bonus_remontada_enabled),
    malus_streak_lockout_enabled = coalesce((p_settings->>'malus_streak_lockout_enabled')::boolean, malus_streak_lockout_enabled),
    malus_streak_block_enabled   = coalesce((p_settings->>'malus_streak_block_enabled')::boolean, malus_streak_block_enabled)
  where id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Lancement d'une manche (remplace insertRound côté client). started_at
-- reste fourni par l'écran hôte : son timer se base sur sa propre horloge.
create or replace function start_round(
  p_host_token uuid,
  p_room_id uuid,
  p_source_track_id text,
  p_title text,
  p_artist text,
  p_blind_mode boolean,
  p_is_joker boolean,
  p_started_at timestamptz
) returns rounds as $$
declare
  v_round rounds;
  v_next int;
begin
  perform assert_room_host(p_room_id, p_host_token);
  select coalesce(max(order_index), -1) + 1 into v_next from rounds where room_id = p_room_id;
  insert into rounds (room_id, order_index, source_track_id, title, artist, status, started_at, blind_mode, is_joker)
  values (
    p_room_id, v_next, left(p_source_track_id, 200), left(p_title, 300), left(p_artist, 300), 'playing',
    coalesce(p_started_at, now()), coalesce(p_blind_mode, false), coalesce(p_is_joker, false)
  )
  returning * into v_round;
  update rooms set status = 'in_progress' where id = p_room_id;
  return v_round;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Traces pour les badges "Curateur" / "Éclectique" (voir 0021).
create or replace function record_playlist_import(p_host_token uuid, p_room_id uuid, p_playlist_id text) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  insert into room_playlist_imports (room_id, playlist_id) values (p_room_id, left(p_playlist_id, 100))
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function record_genre_used(p_host_token uuid, p_room_id uuid, p_genre text) returns void as $$
begin
  perform assert_room_host(p_room_id, p_host_token);
  insert into room_genres_used (room_id, genre) values (p_room_id, left(p_genre, 100))
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 6. Droits d'exécution des fonctions avec jeton
-- ----------------------------------------------------------------------------
revoke all on function resolve_round_attempt(uuid, uuid, boolean, boolean, boolean) from public;
revoke all on function reveal_round(uuid, uuid) from public;
revoke all on function timeout_round(uuid, uuid) from public;
revoke all on function reset_room_scores(uuid, uuid) from public;
revoke all on function award_game_rewards(uuid, uuid) from public;
revoke all on function configure_room_teams(uuid, uuid, int) from public;
revoke all on function rename_team(uuid, uuid, text) from public;
revoke all on function set_player_team(uuid, uuid, uuid) from public;
revoke all on function shuffle_room_teams(uuid, uuid) from public;
revoke all on function assign_unassigned_players(uuid, uuid) from public;
revoke all on function remove_host_player(uuid, uuid) from public;
revoke all on function resolve_rejoin_request(uuid, uuid, boolean) from public;
revoke all on function set_room_status(uuid, uuid, text) from public;
revoke all on function update_room_settings(uuid, uuid, jsonb) from public;
revoke all on function start_round(uuid, uuid, text, text, text, boolean, boolean, timestamptz) from public;
revoke all on function record_playlist_import(uuid, uuid, text) from public;
revoke all on function record_genre_used(uuid, uuid, text) from public;

grant execute on function resolve_round_attempt(uuid, uuid, boolean, boolean, boolean) to anon, authenticated;
grant execute on function reveal_round(uuid, uuid) to anon, authenticated;
grant execute on function timeout_round(uuid, uuid) to anon, authenticated;
grant execute on function reset_room_scores(uuid, uuid) to anon, authenticated;
grant execute on function award_game_rewards(uuid, uuid) to anon, authenticated;
grant execute on function configure_room_teams(uuid, uuid, int) to anon, authenticated;
grant execute on function rename_team(uuid, uuid, text) to anon, authenticated;
grant execute on function set_player_team(uuid, uuid, uuid) to anon, authenticated;
grant execute on function shuffle_room_teams(uuid, uuid) to anon, authenticated;
grant execute on function assign_unassigned_players(uuid, uuid) to anon, authenticated;
grant execute on function remove_host_player(uuid, uuid) to anon, authenticated;
grant execute on function resolve_rejoin_request(uuid, uuid, boolean) to anon, authenticated;
grant execute on function set_room_status(uuid, uuid, text) to anon, authenticated;
grant execute on function update_room_settings(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function start_round(uuid, uuid, text, text, text, boolean, boolean, timestamptz) to anon, authenticated;
grant execute on function record_playlist_import(uuid, uuid, text) to anon, authenticated;
grant execute on function record_genre_used(uuid, uuid, text) to anon, authenticated;

-- PostgREST recharge son cache de fonctions.
notify pgrst, 'reload schema';
