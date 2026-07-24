-- ============================================================================
-- Temps de réaction par tentative, pour le futur écran de fin de partie
-- ("buzzeur le plus rapide" — voir app/host/page.tsx et app/play/page.tsx).
--
-- rounds.pending_reaction_seconds est une valeur TRANSITOIRE : elle stocke
-- le temps écoulé entre le début du "stint" en cours (started_at) et le buzz
-- qui vient de gagner, posée par resolve_buzz_winner() au moment exact du
-- buzz. resolve_round_attempt() la recopie ensuite dans round_attempts (la
-- table d'historique permanente) au moment où la tentative est jugée, puis
-- elle est écrasée par la valeur du buzz suivant le cas échéant — rien de
-- grave, round_attempts a déjà sa propre copie figée à ce moment-là.
--
-- Seules les tentatives où titre ET artiste sont trouvés (points_awarded = 2)
-- comptent pour "le buzzeur le plus rapide" (demande explicite : une réponse
-- fausse ou partielle rapide ne doit pas gagner ce titre) — ce filtre se
-- fait côté client sur round_attempts.reaction_seconds, pas besoin d'une
-- colonne ou d'une requête SQL dédiée pour ça.
-- ============================================================================

alter table rounds add column if not exists pending_reaction_seconds double precision;
alter table round_attempts add column if not exists reaction_seconds double precision;

create or replace function resolve_buzz_winner() returns trigger as $$
begin
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
  v_new_title_found boolean;
  v_new_artist_found boolean;
  v_points int;
  v_complete boolean;
begin
  select buzzed_by_player_id, room_id, title_found, artist_found, pending_reaction_seconds
    into v_player_id, v_room_id, v_title_found, v_artist_found, v_reaction_seconds
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

  insert into round_attempts (round_id, room_id, player_id, title_found, artist_found, points_awarded, reaction_seconds)
  values (p_round_id, v_room_id, v_player_id, p_title_found, p_artist_found, v_points, v_reaction_seconds);

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
