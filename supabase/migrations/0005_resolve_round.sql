create or replace function resolve_round(p_round_id uuid, p_correct boolean)
returns void as $$
declare
  v_player_id uuid;
begin
  select buzzed_by_player_id into v_player_id
  from rounds
  where id = p_round_id and status = 'buzzed';

  if v_player_id is null then
    raise exception 'Manche introuvable ou pas encore buzzée.';
  end if;

  if p_correct then
    update players set score = score + 1 where id = v_player_id;
  end if;

  update rounds
  set status = 'scored', revealed_at = now()
  where id = p_round_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function resolve_round(uuid, boolean) to anon, authenticated;
