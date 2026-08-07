-- ============================================================================
-- Bonus / malus.
--
-- MALUS 1 — série de bonnes réponses (players.correct_streak_count) :
-- à chaque tentative jugée correcte (title_found ou artist_found, donc
-- points > 0), le joueur qui vient de répondre voit son compteur
-- incrémenté, et TOUS LES AUTRES joueurs de la room repassent à zéro — il
-- n'y a donc jamais qu'un seul "détenteur de série" à la fois, exactement
-- comme demandé ("le buzzer revient à la normale quand quelqu'un d'autre
-- répond bon"). Une réponse fausse du détenteur ne touche PAS ce compteur
-- (choix explicite de l'utilisateur : le malus reste tant que personne
-- d'autre n'a marqué de bonne réponse, même si le détenteur se trompe
-- entre-temps).
--
-- Le délai de buzz qui en découle (5s / 10s / 15s, plafonné) est calculé en
-- direct dans resolve_buzz_winner() à partir de correct_streak_count : pas
-- besoin de colonne supplémentaire, puisqu'il n'y a jamais qu'un seul
-- détenteur à la fois et que le délai s'applique à CHAQUE manche tant que
-- le compteur reste >= 3 (pas seulement à la toute première).
--
-- MALUS 2 — série de mauvaises réponses (players.wrong_streak_count) :
-- personnel à chaque joueur (pas de notion de "détenteur unique" ici) —
-- incrémenté à chaque premier-buzz raté (points = -1), remis à zéro dès
-- que ce même joueur répond correctement. À la 3e d'affilée, le blocage
-- complet s'applique à la manche SUIVANTE uniquement : on mémorise l'index
-- (order_index) de la manche en cours dans wrong_streak_block_round_index,
-- et on repart immédiatement à zéro sur le compteur — la manche
-- (order_index + 1) sera bloquée pour ce joueur (vérifié dans
-- resolve_buzz_winner), puis plus aucune manche ne correspondra à cet
-- index mémorisé (order_index augmente strictement), donc le blocage ne
-- s'applique bien qu'une seule fois avant de devoir reconstruire 3 échecs
-- d'affilée.
--
-- BONUS VITESSE — round_attempts.speed_bonus_awarded : +1 point si la
-- réponse complète (titre ET artiste, points de base = 2) est buzzée en
-- moins de SPEED_BONUS_THRESHOLD_SECONDS (5s) — réutilise
-- pending_reaction_seconds, déjà posé par resolve_buzz_winner (voir
-- migration 0011), donc aucune donnée supplémentaire à capturer.
--
-- BONUS REMONTADA — round_attempts.remontada_bonus_awarded : +1 point si
-- le joueur qui répond correctement est STRICTEMENT dernier (aucun autre
-- joueur n'a un score plus bas) ET qu'au moins un autre joueur a un score
-- strictement plus élevé (sinon tout le monde est exæquo en dernière
-- position, y compris en tout début de partie où le bonus n'aurait aucun
-- sens). Cumulable avec le bonus vitesse.
--
-- MANCHE JOKER — rounds.is_joker : tirée au hasard côté client au moment
-- de lancer la manche (voir insertRound dans apps/web-host/src/lib/
-- rooms.ts), ~1 manche sur 5. Double les points de BASE (avant bonus
-- vitesse/remontada, qui restent des +1 fixes) dans les deux sens : une
-- bonne réponse complète vaut 4 au lieu de 2, mais une réponse totalement
-- fausse coûte aussi -2 au lieu de -1 — pensé comme un "quitte ou double"
-- plutôt qu'un simple cadeau.
-- ============================================================================

alter table players add column if not exists correct_streak_count int not null default 0;
alter table players add column if not exists wrong_streak_count int not null default 0;
alter table players add column if not exists wrong_streak_block_round_index int;

alter table rounds add column if not exists is_joker boolean not null default false;

alter table round_attempts add column if not exists speed_bonus_awarded boolean not null default false;
alter table round_attempts add column if not exists remontada_bonus_awarded boolean not null default false;

create or replace function resolve_buzz_winner() returns trigger as $$
declare
  v_correct_streak int;
  v_wrong_block_round_index int;
  v_round_order_index int;
  v_round_started_at timestamptz;
begin
  select correct_streak_count, wrong_streak_block_round_index
    into v_correct_streak, v_wrong_block_round_index
  from players
  where id = new.player_id;

  select order_index, started_at
    into v_round_order_index, v_round_started_at
  from rounds
  where id = new.round_id;

  -- Malus 2 : buzzer complètement bloqué sur CETTE manche précise (celle
  -- qui suit directement les 3 échecs d'affilée) — no-op silencieux,
  -- exactement comme un buzz arrivé trop tard ou sur une manche déjà
  -- resolue plus bas.
  if v_wrong_block_round_index is not null and v_round_order_index = v_wrong_block_round_index + 1 then
    return new;
  end if;

  -- Malus 1 : délai de buzz en début de manche, tant que la série de
  -- bonnes réponses de ce joueur est >= 3 (5s / 10s / 15s plafonné).
  if v_correct_streak >= 3 and v_round_started_at is not null then
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

  v_new_title_found := v_title_found or p_title_found;
  v_new_artist_found := v_artist_found or p_artist_found;

  if p_title_found and p_artist_found then
    v_points := 2;
  elsif p_title_found or p_artist_found then
    v_points := 1;
  else
    v_points := -1;
  end if;

  -- Manche joker : double les points de base, dans les deux sens.
  if v_is_joker then
    v_points := v_points * 2;
  end if;

  if v_points > 0 then
    -- Bonus vitesse : réponse complète (titre + artiste) buzzée en moins
    -- de 5s. Vérifié sur le nombre de points DE BASE (avant joker) via
    -- p_title_found/p_artist_found plutôt que v_points, pour ne pas
    -- dépendre du doublement joker ci-dessus.
    if p_title_found and p_artist_found and v_reaction_seconds is not null and v_reaction_seconds <= 5 then
      v_points := v_points + 1;
      v_speed_bonus := true;
    end if;

    -- Bonus remontada : ce joueur est strictement dernier (personne de
    -- plus bas), et au moins un autre joueur a un score strictement plus
    -- haut (sinon tout le monde est exæquo, le bonus n'aurait pas de sens).
    select score into v_player_score_before from players where id = v_player_id;
    select count(*) into v_others_ahead from players
      where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
    select count(*) into v_others_below from players
      where room_id = v_room_id and id <> v_player_id and score < v_player_score_before;
    if v_others_below = 0 and v_others_ahead > 0 then
      v_points := v_points + 1;
      v_remontada_bonus := true;
    end if;

    update players
      set correct_streak_count = correct_streak_count + 1,
          wrong_streak_count = 0,
          score = score + v_points
      where id = v_player_id;
    update players
      set correct_streak_count = 0
      where room_id = v_room_id and id <> v_player_id;
  else
    update players
      set wrong_streak_count = wrong_streak_count + 1,
          score = score + v_points
      where id = v_player_id
      returning wrong_streak_count into v_new_wrong_streak;

    if v_new_wrong_streak >= 3 then
      update players
        set wrong_streak_count = 0,
            wrong_streak_block_round_index = v_order_index
        where id = v_player_id;
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

-- "Redémarrer une partie" (voir 0014_reset_room_scores.sql) doit aussi
-- effacer les séries en cours, sans quoi un malus/bonus pourrait survivre
-- à un score remis à zéro.
create or replace function reset_room_scores(p_room_id uuid)
returns void as $$
begin
  update players
    set score = 0,
        correct_streak_count = 0,
        wrong_streak_count = 0,
        wrong_streak_block_round_index = null
    where room_id = p_room_id;
  delete from rounds where room_id = p_room_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
