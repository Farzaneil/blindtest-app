-- ============================================================================
-- Mode équipes.
--
-- La structure existait déjà depuis 0001_init.sql (table `teams`,
-- players.team_id, rooms.game_mode solo|team) mais n'était branchée nulle
-- part. Cette migration la rend utilisable :
--
-- - teams.position : ordre d'affichage + choix du nom/couleur par défaut
--   (Les Bleus, Les Ambres, Les Violets, Les Roses). Vert et rouge évités
--   volontairement : ils signifient déjà bonne/mauvaise réponse dans l'app.
-- - Fonctions SECURITY DEFINER pour tout ce qui écrit dans players.team_id
--   ou rooms.game_mode (aucune policy UPDATE n'est ouverte côté client sur
--   ces tables, voir 0004_rls_hardening.sql) : configurer le nombre
--   d'équipes, renommer, déplacer un joueur, mélanger, placer les joueurs
--   sans équipe.
-- - Le score d'une équipe n'est PAS stocké (teams.score reste inutilisé) :
--   il est toujours recalculé comme la somme des scores de ses joueurs, ce
--   qui évite toute désynchronisation (reset, joueur déplacé, etc.).
-- - Bonus/malus au niveau équipe quand rooms.game_mode = 'team' et que le
--   joueur a une équipe (sinon comportement individuel inchangé) :
--     * remontada : calculée sur les totaux d'équipe (équipe strictement
--       dernière, plus de 5 points de retard sur l'équipe juste au-dessus) ;
--     * série de bonnes réponses (délai de buzz) : portée par l'équipe —
--       tous ses membres partagent le compteur, remis à zéro pour les
--       autres équipes ;
--     * série de mauvaises réponses (blocage) : 3 premières réponses ratées
--       d'affilée PAR L'ÉQUIPE bloquent toute l'équipe la manche suivante.
--   Bonus vitesse et manche joker restent individuels (inchangés).
--   Le verrou "a déjà répondu sur cette manche" (rounds.locked_player_id)
--   reste individuel : un coéquipier peut buzzer juste après.
--
-- À exécuter dans le SQL Editor de Supabase. Rétro-compatible : une room en
-- mode solo (défaut) se comporte exactement comme avant.
-- ============================================================================

alter table teams add column if not exists position int not null default 0;
create index if not exists idx_teams_room on teams(room_id);

-- Realtime sur `teams` (renommage, ajout/suppression d'équipe) ; replica
-- identity full pour que le filtre room_id fonctionne aussi sur les DELETE.
alter table teams replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table teams;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Configuration : 0 = solo (supprime les équipes), 2 à 4 = mode équipes.
-- Conserve les équipes déjà créées (noms personnalisés compris) quand on
-- passe par exemple de 2 à 3 ; les joueurs d'une équipe supprimée (passage
-- de 3 à 2) redeviennent "sans équipe" (players.team_id on delete set null).
-- ----------------------------------------------------------------------------
create or replace function configure_room_teams(p_room_id uuid, p_team_count int)
returns void as $$
declare
  v_names text[] := array['Les Bleus', 'Les Ambres', 'Les Violets', 'Les Roses'];
  v_colors text[] := array['#6E93D6', '#D6A15A', '#A78BFA', '#E879A6'];
  i int;
begin
  if p_team_count is null or p_team_count not in (0, 2, 3, 4) then
    raise exception 'Nombre d''équipes invalide (0, 2, 3 ou 4).';
  end if;

  if p_team_count = 0 then
    update players set team_id = null where room_id = p_room_id;
    delete from teams where room_id = p_room_id;
    update rooms set game_mode = 'solo' where id = p_room_id;
    return;
  end if;

  delete from teams where room_id = p_room_id and position >= p_team_count;
  for i in 0 .. p_team_count - 1 loop
    if not exists (select 1 from teams where room_id = p_room_id and position = i) then
      insert into teams (room_id, name, color, position)
      values (p_room_id, v_names[i + 1], v_colors[i + 1], i);
    end if;
  end loop;
  update rooms set game_mode = 'team' where id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function rename_team(p_team_id uuid, p_name text)
returns void as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 30 then
    raise exception 'Le nom d''équipe doit faire entre 1 et 30 caractères.';
  end if;
  update teams set name = v_name where id = p_team_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- p_team_id null = retirer le joueur de son équipe.
create or replace function set_player_team(p_player_id uuid, p_team_id uuid)
returns void as $$
begin
  if p_team_id is not null and not exists (
    select 1 from teams t join players p on p.room_id = t.room_id
    where t.id = p_team_id and p.id = p_player_id
  ) then
    raise exception 'Équipe introuvable pour ce joueur.';
  end if;
  update players set team_id = p_team_id where id = p_player_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Répartit TOUS les joueurs de la room au hasard, de façon équilibrée
-- (écart d'au plus 1 joueur entre équipes).
create or replace function shuffle_room_teams(p_room_id uuid)
returns void as $$
declare
  v_team_count int;
begin
  select count(*) into v_team_count from teams where room_id = p_room_id;
  if v_team_count = 0 then
    return;
  end if;

  with t as (
    select id, row_number() over (order by position) - 1 as idx
    from teams where room_id = p_room_id
  ),
  p as (
    select id, row_number() over (order by random()) - 1 as idx
    from players where room_id = p_room_id
  )
  update players pl
    set team_id = t.id
    from p, t
    where pl.id = p.id and t.idx = p.idx % v_team_count;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Place chaque joueur encore sans équipe dans l'équipe qui a le moins de
-- membres (égalité : la première dans l'ordre). Appelée par l'hôte au
-- lancement de chaque manche, pour qu'aucun joueur ne joue "hors équipe".
create or replace function assign_unassigned_players(p_room_id uuid)
returns void as $$
declare
  v_player_id uuid;
  v_team_id uuid;
begin
  if not exists (select 1 from rooms where id = p_room_id and game_mode = 'team') then
    return;
  end if;

  for v_player_id in
    select id from players where room_id = p_room_id and team_id is null order by joined_at
  loop
    select t.id into v_team_id
    from teams t left join players p on p.team_id = t.id
    where t.room_id = p_room_id
    group by t.id, t.position
    order by count(p.id), t.position
    limit 1;

    exit when v_team_id is null;
    update players set team_id = v_team_id where id = v_player_id;
  end loop;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function configure_room_teams(uuid, int) to anon, authenticated;
grant execute on function rename_team(uuid, text) to anon, authenticated;
grant execute on function set_player_team(uuid, uuid) to anon, authenticated;
grant execute on function shuffle_room_teams(uuid) to anon, authenticated;
grant execute on function assign_unassigned_players(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Buzz : en mode équipes, les compteurs de série sont lus au niveau de
-- l'équipe (max sur ses membres) — un joueur arrivé en cours de partie ne
-- peut donc pas contourner un malus posé sur son équipe. Reste identique à
-- la version 0018 sinon.
-- ----------------------------------------------------------------------------
create or replace function resolve_buzz_winner() returns trigger as $$
declare
  v_correct_streak int;
  v_wrong_block_round_index int;
  v_team_id uuid;
  v_round_order_index int;
  v_round_started_at timestamptz;
  v_room_id uuid;
  v_game_mode text;
  v_malus_lockout_enabled boolean;
  v_malus_block_enabled boolean;
begin
  select correct_streak_count, wrong_streak_block_round_index, team_id
    into v_correct_streak, v_wrong_block_round_index, v_team_id
  from players
  where id = new.player_id;

  select order_index, started_at, room_id
    into v_round_order_index, v_round_started_at, v_room_id
  from rounds
  where id = new.round_id;

  select malus_streak_lockout_enabled, malus_streak_block_enabled, game_mode
    into v_malus_lockout_enabled, v_malus_block_enabled, v_game_mode
  from rooms
  where id = v_room_id;

  if v_game_mode = 'team' and v_team_id is not null then
    select max(correct_streak_count), max(wrong_streak_block_round_index)
      into v_correct_streak, v_wrong_block_round_index
    from players
    where team_id = v_team_id;
  end if;

  if v_malus_block_enabled and v_wrong_block_round_index is not null
     and v_round_order_index = v_wrong_block_round_index + 1 then
    return new;
  end if;

  if v_malus_lockout_enabled and v_correct_streak >= 3 and v_round_started_at is not null then
    if now() < v_round_started_at + (case
      when v_correct_streak >= 5 then interval '15 seconds'
      when v_correct_streak = 4 then interval '10 seconds'
      else interval '5 seconds'
    end) then
      return new;
    end if;
  end if;

  update rounds
  set status = 'buzzed',
      buzzed_by_player_id = new.player_id,
      buzzed_at = new.server_received_at,
      elapsed_seconds = elapsed_seconds + extract(epoch from (new.server_received_at - started_at)),
      pending_reaction_seconds = extract(epoch from (new.server_received_at - started_at))
  where id = new.round_id
    and status = 'playing'
    and (locked_player_id is null or locked_player_id <> new.player_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Jugement d'une tentative : version 0019 + branches "équipe" pour la
-- remontada et les deux séries. Points de base, joker, bonus vitesse et
-- transitions de manche strictement inchangés.
-- ----------------------------------------------------------------------------
create or replace function resolve_round_attempt(
  p_round_id uuid,
  p_title_found boolean,
  p_artist_found boolean,
  p_force_end boolean
) returns void as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_title_found boolean;
  v_artist_found boolean;
  v_reaction_seconds double precision;
  v_order_index int;
  v_is_joker boolean;
  v_new_title_found boolean;
  v_new_artist_found boolean;
  v_points int;
  v_complete boolean;
  v_speed_bonus boolean := false;
  v_remontada_bonus boolean := false;
  v_player_score_before int;
  v_others_ahead int;
  v_others_below int;
  v_second_lowest_score int;
  v_new_wrong_streak int;
  v_bonus_speed_enabled boolean;
  v_bonus_remontada_enabled boolean;
  v_malus_lockout_enabled boolean;
  v_malus_block_enabled boolean;
  v_game_mode text;
  v_team_id uuid;
  v_team_mode boolean;
  v_team_correct_streak int;
begin
  select buzzed_by_player_id, room_id, title_found, artist_found, pending_reaction_seconds,
         order_index, is_joker
    into v_player_id, v_room_id, v_title_found, v_artist_found, v_reaction_seconds,
         v_order_index, v_is_joker
  from rounds
  where id = p_round_id and status = 'revealed';

  if v_player_id is null then
    raise exception 'Manche introuvable ou pas encore révélée.';
  end if;

  select bonus_speed_enabled, bonus_remontada_enabled,
         malus_streak_lockout_enabled, malus_streak_block_enabled, game_mode
    into v_bonus_speed_enabled, v_bonus_remontada_enabled,
         v_malus_lockout_enabled, v_malus_block_enabled, v_game_mode
  from rooms
  where id = v_room_id;

  select team_id into v_team_id from players where id = v_player_id;
  v_team_mode := v_game_mode = 'team' and v_team_id is not null;

  v_new_title_found := v_title_found or p_title_found;
  v_new_artist_found := v_artist_found or p_artist_found;

  if p_title_found and p_artist_found then
    v_points := 2;
  elsif p_title_found or p_artist_found then
    v_points := 1;
  else
    v_points := -1;
  end if;

  if v_is_joker then
    v_points := v_points * 2;
  end if;

  if v_points > 0 then
    if v_bonus_speed_enabled and p_title_found and p_artist_found
       and v_reaction_seconds is not null and v_reaction_seconds < 2 then
      v_points := v_points + 1;
      v_speed_bonus := true;
    end if;

    if v_bonus_remontada_enabled then
      if v_team_mode then
        -- Totaux d'équipe (équipes ayant au moins un joueur uniquement).
        select coalesce(sum(score), 0) into v_player_score_before
          from players where team_id = v_team_id;
        select count(*) filter (where s.total > v_player_score_before),
               count(*) filter (where s.total < v_player_score_before),
               min(s.total) filter (where s.total > v_player_score_before)
          into v_others_ahead, v_others_below, v_second_lowest_score
        from (
          select t.id, sum(p.score) as total
          from teams t join players p on p.team_id = t.id
          where t.room_id = v_room_id and t.id <> v_team_id
          group by t.id
        ) s;
      else
        select score into v_player_score_before from players where id = v_player_id;
        select count(*) into v_others_ahead from players
          where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
        select count(*) into v_others_below from players
          where room_id = v_room_id and id <> v_player_id and score < v_player_score_before;
        select min(score) into v_second_lowest_score from players
          where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
      end if;

      if v_others_below = 0 and v_others_ahead > 0
         and v_second_lowest_score - v_player_score_before > 5 then
        v_points := v_points + 1;
        v_remontada_bonus := true;
      end if;
    end if;

    update players set score = score + v_points where id = v_player_id;

    if v_malus_lockout_enabled then
      if v_team_mode then
        select coalesce(max(correct_streak_count), 0) into v_team_correct_streak
          from players where team_id = v_team_id;
        update players
          set correct_streak_count = v_team_correct_streak + 1
          where team_id = v_team_id;
        update players
          set correct_streak_count = 0
          where room_id = v_room_id and (team_id is null or team_id <> v_team_id);
      else
        update players
          set correct_streak_count = correct_streak_count + 1
          where id = v_player_id;
        update players
          set correct_streak_count = 0
          where room_id = v_room_id and id <> v_player_id;
      end if;
    end if;

    if v_malus_block_enabled then
      if v_team_mode then
        update players set wrong_streak_count = 0 where team_id = v_team_id;
      else
        update players set wrong_streak_count = 0 where id = v_player_id;
      end if;
    end if;
  else
    update players set score = score + v_points where id = v_player_id;

    if v_malus_block_enabled then
      if v_team_mode then
        select coalesce(max(wrong_streak_count), 0) + 1 into v_new_wrong_streak
          from players where team_id = v_team_id;
        if v_new_wrong_streak >= 3 then
          update players
            set wrong_streak_count = 0,
                wrong_streak_block_round_index = v_order_index
            where team_id = v_team_id;
        else
          update players set wrong_streak_count = v_new_wrong_streak where team_id = v_team_id;
        end if;
      else
        update players
          set wrong_streak_count = wrong_streak_count + 1
          where id = v_player_id
          returning wrong_streak_count into v_new_wrong_streak;

        if v_new_wrong_streak >= 3 then
          update players
            set wrong_streak_count = 0,
                wrong_streak_block_round_index = v_order_index
            where id = v_player_id;
        end if;
      end if;
    end if;
  end if;

  insert into round_attempts (
    round_id, room_id, player_id, title_found, artist_found, points_awarded,
    reaction_seconds, speed_bonus_awarded, remontada_bonus_awarded
  )
  values (
    p_round_id, v_room_id, v_player_id, p_title_found, p_artist_found, v_points,
    v_reaction_seconds, v_speed_bonus, v_remontada_bonus
  );

  v_complete := v_new_title_found and v_new_artist_found;

  if v_complete or p_force_end then
    update rounds
    set status = 'scored',
        title_found = v_new_title_found,
        artist_found = v_new_artist_found,
        was_correct = v_complete,
        locked_player_id = null
    where id = p_round_id;
  else
    update rounds
    set status = 'playing',
        title_found = v_new_title_found,
        artist_found = v_new_artist_found,
        was_correct = null,
        buzzed_by_player_id = null,
        locked_player_id = v_player_id,
        started_at = now()
    where id = p_round_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
