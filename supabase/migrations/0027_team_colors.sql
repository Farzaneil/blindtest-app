-- ============================================================================
-- Audit design (octobre 2026) : la 2e couleur d'équipe ("Les Ambres",
-- #D6A15A) était identique au token "amber" de l'app, utilisé pour la
-- manche joker et les séries de bonnes réponses — un badge joker se
-- confondait avec l'équipe. Elle devient orange (#F0874A, "Les Oranges").
-- Les équipes existantes sont migrées (le nom n'est changé que s'il était
-- resté le nom par défaut). À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

update teams set name = 'Les Oranges' where color = '#D6A15A' and name = 'Les Ambres';
update teams set color = '#F0874A' where color = '#D6A15A';

create or replace function configure_room_teams(p_room_id uuid, p_team_count int)
returns void as $$
declare
  v_names text[] := array['Les Bleus', 'Les Oranges', 'Les Violets', 'Les Roses'];
  v_colors text[] := array['#6E93D6', '#F0874A', '#A78BFA', '#E879A6'];
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
