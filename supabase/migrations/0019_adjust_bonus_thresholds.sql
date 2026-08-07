-- Ajuste les seuils de 2 bonus, à la demande de l'hôte après une première
-- vraie partie de test (voir migration 0018 pour resolve_round_attempt au
-- complet) :
--
-- - Bonus vitesse : le seuil passe de 5 secondes à moins de 2 secondes
--   (trop facile à atteindre à 5s, ça se déclenchait presque à chaque
--   bonne réponse).
-- - Bonus remontada : en plus d'être strictement dernier (déjà le cas
--   depuis la 0018), il faut maintenant avoir plus de 5 points d'écart
--   avec l'avant-dernier (le joueur juste au-dessus) pour que le bonus se
--   déclenche — sinon un simple 1 point de retard suffisait, ce qui
--   arrivait trop souvent pour rester une vraie "remontada".
--
-- Le tirage du joker (1 manche sur 10 au lieu de 1 sur 5) est ajusté côté
-- client uniquement (JOKER_ROUND_PROBABILITY dans lib/rooms.ts) : cette
-- migration ne touche donc pas au joker.
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
    -- de 2s (resserré depuis la 0018, où le seuil était 5s — trop facile à
    -- atteindre). Vérifié sur le nombre de points DE BASE (avant joker) via
    -- p_title_found/p_artist_found plutôt que v_points, pour ne pas
    -- dépendre du doublement joker ci-dessus.
    if v_bonus_speed_enabled and p_title_found and p_artist_found
       and v_reaction_seconds is not null and v_reaction_seconds < 2 then
      v_points := v_points + 1;
      v_speed_bonus := true;
    end if;

    -- Bonus remontada : ce joueur est strictement dernier (personne de
    -- plus bas), au moins un autre joueur a un score strictement plus haut
    -- (sinon tout le monde est exæquo, le bonus n'aurait pas de sens), ET
    -- l'écart avec l'avant-dernier (le joueur juste au-dessus) est de plus
    -- de 5 points (resserré depuis la 0018, où un seul point de retard
    -- suffisait) — un vrai retard, pas juste un point de moins.
    if v_bonus_remontada_enabled then
      select score into v_player_score_before from players where id = v_player_id;
      select count(*) into v_others_ahead from players
        where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
      select count(*) into v_others_below from players
        where room_id = v_room_id and id <> v_player_id and score < v_player_score_before;
      if v_others_below = 0 and v_others_ahead > 0 then
        select min(score) into v_second_lowest_score from players
          where room_id = v_room_id and id <> v_player_id and score > v_player_score_before;
        if v_second_lowest_score - v_player_score_before > 5 then
          v_points := v_points + 1;
          v_remontada_bonus := true;
        end if;
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
