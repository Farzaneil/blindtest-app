-- ============================================================================
-- Limitation du nombre de requêtes (bêta publique) : compteurs par clé
-- (adresse IP, e-mail…) sur une fenêtre de temps, utilisés par les routes
-- serveur sensibles (envoi d'e-mail de connexion, vérification du code,
-- relais vers l'API Deezer) — voir apps/web-host/src/lib/rateLimit.ts.
--
-- Stockés en base plutôt qu'en mémoire : sur Vercel, chaque requête peut
-- tomber sur une instance différente, un compteur en mémoire ne tiendrait
-- pas. Appelable uniquement avec la clé service_role (routes serveur).
-- À exécuter dans le SQL Editor de Supabase.
-- ============================================================================

create table if not exists rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);
alter table rate_limits enable row level security;
revoke all on rate_limits from public, anon, authenticated;

-- Compte une requête pour p_key ; renvoie true si elle reste sous p_max
-- requêtes sur les p_window_seconds dernières secondes (fenêtre fixe).
create or replace function hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean as $$
declare
  v_count int;
begin
  insert into rate_limits as r (key, window_start, count)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;

  -- Ménage occasionnel des vieux compteurs (~1 appel sur 100).
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function hit_rate_limit(text, int, int) to service_role;
