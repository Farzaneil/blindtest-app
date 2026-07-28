-- ============================================================================
-- Verrou PARTAGÉ (coupe-circuit) pour le quota Spotify (429 QUOTA_EXCEEDED),
-- voir apps/web-host/src/lib/spotifyQuotaLock.ts et
-- apps/web-host/src/app/host/page.tsx.
--
-- Le coupe-circuit précédent (voir packages/api-clients/src/spotify.ts)
-- vivait uniquement en localStorage, donc propre à UN navigateur. Si l'hôte
-- ouvre /host depuis un autre appareil/navigateur (ou après avoir vidé son
-- cache) pendant que le quota Spotify est encore dépassé côté serveur, ce
-- nouveau contexte n'a aucune trace du blocage et retente un appel, qui
-- échoue à nouveau — exactement le problème signalé. Cette table sert de
-- verrou visible par TOUTE session qui ouvre la page, quel que soit
-- l'appareil/navigateur, synchronisé en direct via Supabase Realtime.
--
-- Une ligne par catégorie de quota : "search" (recherche manuelle +
-- génération de playlist par genre, qui passent toutes les deux par
-- searchTracks) et "playlists" (chargement + import de playlist) — ce sont
-- deux quotas indépendants côté Spotify, constaté en usage réel (un 429 sur
-- /search n'empêche pas /me/playlists de continuer à répondre).
-- ============================================================================

create table if not exists spotify_quota_locks (
  category text primary key,
  blocked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table spotify_quota_locks enable row level security;

-- Policies permissives (même choix que 0003_dev_policies.sql) : pas de
-- donnée sensible, entre amis, pas encore d'auth réelle.
create policy "dev: lecture libre spotify_quota_locks" on spotify_quota_locks for select using (true);
create policy "dev: creation libre spotify_quota_locks" on spotify_quota_locks for insert with check (true);
create policy "dev: maj libre spotify_quota_locks" on spotify_quota_locks for update using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'spotify_quota_locks'
  ) then
    alter publication supabase_realtime add table spotify_quota_locks;
  end if;
end $$;
