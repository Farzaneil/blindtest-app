-- ============================================================================
-- Étape de révélation explicite avant de valider une réponse.
--
-- 0005_resolve_round.sql avait volontairement sauté l'étape "revealed"
-- (buzzed -> scored directement), en notant que ce serait à revoir "si on
-- veut un vrai temps de révélation visuelle avant validation" — c'est
-- exactement ce qu'on ajoute ici : quand l'hôte joue aussi et buzze
-- lui-même, il ne doit pas voir le titre/artiste s'afficher automatiquement
-- sur son propre écran avant d'avoir donné sa réponse à voix haute.
--
-- Nouveau cycle de vie d'une manche : playing -> buzzed -> revealed -> scored.
-- reveal_round() gère la transition buzzed -> revealed (c'est le moment où
-- l'hôte clique sur "Révéler la réponse"). resolve_round() est modifié pour
-- n'accepter que revealed -> scored (il fallait avant accepter buzzed
-- directement ; on resserre pour forcer le passage par la révélation).
-- ============================================================================

create or replace function reveal_round(p_round_id uuid)
returns void as $$
begin
  update rounds
  set status = 'revealed', revealed_at = now()
  where id = p_round_id and status = 'buzzed';

  if not found then
    raise exception 'Manche introuvable ou pas encore buzzée.';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function reveal_round(uuid) to anon, authenticated;

-- resolve_round() exige maintenant que la manche soit déjà passée par
-- 'revealed' (et non plus 'buzzed' directement) ; revealed_at est déjà posé
-- par reveal_round(), donc on ne le touche plus ici.
create or replace function resolve_round(p_round_id uuid, p_correct boolean)
returns void as $$
declare
  v_player_id uuid;
begin
  select buzzed_by_player_id into v_player_id
  from rounds
  where id = p_round_id and status = 'revealed';

  if v_player_id is null then
    raise exception 'Manche introuvable ou pas encore révélée.';
  end if;

  if p_correct then
    update players set score = score + 1 where id = v_player_id;
  end if;

  update rounds
  set status = 'scored'
  where id = p_round_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function resolve_round(uuid, boolean) to anon, authenticated;
