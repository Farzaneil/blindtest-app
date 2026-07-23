-- ============================================================================
-- Le timer de manche (30s, voir app/page.tsx) ne doit décompter QUE le temps
-- où le morceau joue réellement. Jusqu'ici il était calculé uniquement à
-- partir de rounds.started_at, jamais réajusté pendant les phases
-- "buzzed"/"revealed" (le temps que l'hôte juge la réponse) : ce temps de
-- réflexion était donc décompté du budget des 30s, alors que la musique est
-- coupée pendant ce temps-là (mode "Maître du jeu" avec réponses
-- partielles). Résultat : le timer semblait "ne pas s'arrêter" au buzz.
--
-- Fix : rounds.elapsed_seconds accumule le temps RÉELLEMENT joué avant le
-- buzz courant. Le trigger resolve_buzz_winner l'incrémente au moment
-- exact du buzz gagnant (buzzed_at - started_at). resolve_round_attempt
-- réinitialise started_at à l'instant de la reprise, pour que le calcul
-- côté client (30 - elapsed_seconds - (now - started_at)) ne recompte
-- jamais le temps de pause passé à juger.
-- ============================================================================

alter table rounds add column if not exists elapsed_seconds double precision not null default 0;

create or replace function resolve_buzz_winner() returns trigger as $$
begin
  update rounds
  set status = 'buzzed',
      buzzed_by_player_id = new.player_id,
      buzzed_at = new.server_received_at,
      elapsed_seconds = elapsed_seconds + extract(epoch from (new.server_received_at - started_at))
  where id = new.round_id
    and status = 'playing'
    and (locked_player_id is null or locked_player_id <> new.player_id);
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- resolve_round_attempt : la seule différence avec 0008 est le started_at =
-- now() sur la branche "la manche reprend" (elapsed_seconds, lui, a déjà
-- été mis à jour par le trigger ci-dessus au moment du buzz).
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
  v_new_title_found boolean;
  v_new_artist_found boolean;
  v_points int;
  v_complete boolean;
begin
  select buzzed_by_player_id, room_id, title_found, artist_found
    into v_player_id, v_room_id, v_title_found, v_artist_found
  from rounds
  where id = p_round_id and status = 'revealed';

  if v_player_id is null then
    raise exception 'Manche introuvable ou pas encore révélée.';
  end if;

  v_new_title_found := v_title_found or p_title_found;
  v_new_artist_found := v_artist_found or p_artist_found;

  if p_title_found and p_artist_found then
    v_points := 2;
  elsif p_title_found or p_artist_found then
    v_points := 1;
  else
    v_points := -1;
  end if;

  update players set score = score + v_points where id = v_player_id;

  insert into round_attempts (round_id, room_id, player_id, title_found, artist_found, points_awarded)
  values (p_round_id, v_room_id, v_player_id, p_title_found, p_artist_found, v_points);

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
