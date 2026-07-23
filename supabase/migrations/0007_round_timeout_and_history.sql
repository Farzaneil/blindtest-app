-- ============================================================================
-- Timer par manche + historique des manches jouées.
--
-- 1) was_correct : jusqu'ici, savoir si une manche avait été trouvée ou non
--    ne se déduisait qu'indirectement (le score du joueur avait augmenté ou
--    pas), sans trace directe sur la manche elle-même. On ajoute une colonne
--    dédiée sur `rounds`, posée par resolve_round(), pour pouvoir afficher un
--    historique fiable côté hôte (qui a buzzé, bonne ou mauvaise réponse)
--    sans avoir à recalculer quoi que ce soit après coup.
--
-- 2) timeout_round() : nouvelle transition playing -> scored quand le timer
--    visuel côté hôte arrive à 0 sans qu'aucun joueur n'ait buzzé. was_correct
--    reste alors à NULL (ni bonne ni mauvaise réponse : personne n'a
--    répondu), ce qui permet de le distinguer d'une manche réellement jugée
--    dans l'historique.
-- ============================================================================

alter table rounds add column if not exists was_correct boolean;

create or replace function timeout_round(p_round_id uuid)
returns void as $$
begin
  update rounds
  set status = 'scored', was_correct = null
  where id = p_round_id and status = 'playing';

  if not found then
    raise exception 'Manche introuvable ou déjà en cours de traitement.';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function timeout_round(uuid) to anon, authenticated;

-- resolve_round() pose désormais was_correct en plus de créditer le score,
-- pour que l'historique sache si la réponse donnée était juste ou fausse.
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
  set status = 'scored', was_correct = p_correct
  where id = p_round_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function resolve_round(uuid, boolean) to anon, authenticated;
