-- ============================================================================
-- Réglages bonus/malus par partie (voir migration 0017 pour les mécaniques
-- elles-mêmes) : chaque room a ses propres interrupteurs, activés par
-- défaut (comportement déjà en place), modifiables à tout moment pendant
-- la partie depuis le panneau playlist côté hôte (voir
-- updateRoomBonusMalusSettings dans apps/web-host/src/lib/rooms.ts).
--
-- Stockés sur `rooms` plutôt que côté client (contrairement à targetScore/
-- maxRounds, purement client) : resolve_round_attempt() et
-- resolve_buzz_winner() tournent indépendamment du navigateur de l'hôte
-- (ce sont des fonctions Postgres déclenchées par des écritures en base),
-- elles ont besoin d'une source de vérité côté serveur pour savoir quels
-- mécanismes appliquer.
--
-- bonus_joker_enabled conditionne uniquement le TIRAGE (fait côté client
-- dans insertRound, voir rooms.ts) : si désactivé, aucune manche n'est
-- jamais tirée "joker", donc resolve_round_attempt n'a rien de spécial à
-- vérifier pour ce cas précis (is_joker sera toujours false).
-- ============================================================================

alter table rooms add column if not exists bonus_joker_enabled boolean not null default true;
alter table rooms add column if not exists bonus_speed_enabled boolean not null default true;
alter table rooms add column if not exists bonus_remontada_enabled boolean not null default true;
alter table rooms add column if not exists malus_streak_lockout_enabled boolean not null default true;
alter table rooms add column if not exists malus_streak_block_enabled boolean not null default true;

grant update (
  bonus_joker_enabled,
  bonus_speed_enabled,
  bonus_remontada_enabled,
  malus_streak_lockout_enabled,
  malus_streak_block_enabled
) on rooms to anon, authenticated;

create or replace function resolve_buzz_winner() returns trigger as $$
declare
  v_correct_streak int;
  v_wrong_block_round_index int;
  v_round_order_index int;
  v_round_started_at timestamptz;
  v_room_id uuid;
  v_malus_lockout_enabled boolean;
  v_malus_block_enabled boolean;
begin
  select correct_streak_count, wrong_streak_block_round_index
    into v_correct_streak, v_wrong_block_round_index
  from players
  where id = new.player_id;

  select order_index, started_at, room_id
    into v_round_order_index, v_round_started_at, v_room_id
  from rounds
  where id = new.round_id;

  select malus_streak_lockout_enabled, malus_streak_block_enabled
    into v_malus_lockout_enabled, v_malus_block_enabled
  from rooms
  where id = v_room_id;

  -- Malus 2 : buzzer complètement bloqué sur CETTE manche précise (celle
  -- qui suit directement les 3 échecs d'affilée) — no-op silencieux,
  -- exactement comme un buzz arrivé trop tard ou sur une manche déjà
  -- resolue plus bas.
  if v_malus_block_enabled and v_wrong_block_round_index is not null
     and v_round_order_index = v_wrong_block_round_index + 1 then
    return new;
  end if;

  -- Malus 1 : délai de buzz en début de manche, tant que la série de
  -- bonnes réponses de ce joueur est >= 3 (5s / 10s / 15s plafonné).
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
  v_new_wrong_streak int;
  v_bonus_speed_enabled boolean;
  v_bonus_remontada_enabled boolean;
  v_malus_lockout_enabled boolean;
  v_malus_block_enabled boolean;
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
         malus_streak_lockout_enabled, malus_streak_block_enabled
    into v_bonus_speed_enabled, v_bonus_remontada_enabled,
         v_malus_lockout_enabled, v_malus_block_enabled
  from rooms
  where id = v_room_id;

  v_new_title_found := v_title_found or p_title_found;
  v_new_artist_found := v_artist_found or p_artist_found;

  if p_title_found and p_artist_found then
    v_points := 2;
  elsif p_title_found or p_artist_found then
    v_points := 1;
  else
    v_points := -1;
  end if;

  -- Manche joker : double les points de base, dans les deux sens. Pas de
  -- vérification de réglage ici : is_joker n'est jamais posé à true par
  -- insertRound si bonus_joker_enabled est désactivé (voir le commentaire
  -- en tête de cette migration).
  if v_is_joker then
    v_points := v_points * 2;
  end if;

  if v_points > 0 then
    -- Bonus vitesse : réponse complète (titre + artiste) buzzée en moins
    -- de 5s. Vérifié sur le nombre de points DE BASE (avant joker) via
    -- p_title_found/p_artist_found plutôt que v_points, pour ne pas
    -- dépendre du doublement joker ci-dessus.
    if v_bonus_speed_enabled and p_title_found and p_artist_found
       and v_reaction_seconds is not null and v_reaction_seconds <= 5 then
      v_points := v_points + 1;
      v_speed_bonus := true;
    end if;

    -- Bonus remontada : ce joueur est strictement dernier (personne de
    -- plus bas), et au moins un autre joueur a un score strictement plus
    -- haut (sinon tout le monde est exæquo, le bonus n'aurait pas de sens).
    if v_bonus_remontada_enabled then
      select score into v_player_score_before from players where id = v_player_id;
      select count(*) into v_others_ahead from players
        where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
      select count(*) into v_others_below from players
        where room_id = v_room_id and id <> v_player_id and score < v_player_score_before;
      if v_others_below = 0 and v_others_ahead > 0 then
        v_points := v_points + 1;
        v_remontada_bonus := true;
      end if;
    end if;

    -- Le score s'applique toujours, indépendamment des réglages malus
    -- ci-dessous : seul le SUIVI des séries (colonnes *_streak_*) dépend
    -- de ces interrupteurs, jamais le nombre de points gagnés/perdus.
    update players set score = score + v_points where id = v_player_id;

    if v_malus_lockout_enabled then
      update players
        set correct_streak_count = correct_streak_count + 1
        where id = v_player_id;
      update players
        set correct_streak_count = 0
        where room_id = v_room_id and id <> v_player_id;
    end if;

    if v_malus_block_enabled then
      update players set wrong_streak_count = 0 where id = v_player_id;
    end if;
  else
    update players set score = score + v_points where id = v_player_id;

    if v_malus_block_enabled then
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
