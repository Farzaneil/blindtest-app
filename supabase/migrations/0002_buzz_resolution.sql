-- ============================================================================
-- Résolution atomique du premier buzz d'une manche.
--
-- Plutôt que de laisser un client (l'hôte) décider "qui a buzzé en premier"
-- en comparant des événements reçus en temps réel (source de conditions de
-- course si deux joueurs buzzent à quelques millisecondes d'écart), on
-- s'appuie sur Postgres : chaque INSERT dans `buzzes` déclenche une UPDATE
-- conditionnelle sur `rounds` qui ne peut réussir qu'une seule fois par
-- manche, grâce au verrou de ligne pris par la clause WHERE status='playing'.
-- Le premier INSERT à valider sa transaction gagne, les suivants deviennent
-- des no-op. Aucune logique applicative ne peut se tromper là-dessus.
-- ============================================================================

create or replace function resolve_buzz_winner() returns trigger as $$
begin
  update rounds
  set status = 'buzzed',
      buzzed_by_player_id = new.player_id,
      buzzed_at = new.server_received_at
  where id = new.round_id
    and status = 'playing';
  return new;
end;
$$ language plpgsql;

create trigger trg_resolve_buzz_winner
  after insert on buzzes
  for each row execute function resolve_buzz_winner();
