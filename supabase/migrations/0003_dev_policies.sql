-- ============================================================================
-- Policies RLS permissives — phase de prototypage (V0/V1, entre amis).
--
-- Rappel : dans 0001_init.sql, la RLS est activée SANS policy sur toutes les
-- tables, ce qui bloque tout accès par défaut, y compris avec la clé anon.
-- On n'a pas encore d'authentification réelle (les joueurs sont identifiés
-- par un device_id généré côté client, pas par un compte Supabase Auth), donc
-- impossible pour l'instant d'écrire des policies basées sur auth.uid().
--
-- Choix assumé pour cette phase : ouvrir l'accès à tout le monde (clé anon)
-- sur les tables d'état de partie. Le code de room fait office de barrière
-- légère et la donnée n'a rien de sensible entre amis. À REVOIR avant toute
-- ouverture publique (cf. blueprint, section 8, risques) : brancher Supabase
-- Auth et restreindre ces policies à "appartenir à la room concernée".
--
-- `answers` et `playlists` restent verrouillées (aucune policy) : pas encore
-- utilisées par le code de cette itération, à ouvrir seulement quand ces
-- features seront câblées.
-- ============================================================================

create policy "dev: lecture libre rooms" on rooms for select using (true);
create policy "dev: creation libre rooms" on rooms for insert with check (true);
create policy "dev: maj libre rooms" on rooms for update using (true);

create policy "dev: lecture libre players" on players for select using (true);
create policy "dev: creation libre players" on players for insert with check (true);
create policy "dev: maj libre players" on players for update using (true);

create policy "dev: lecture libre teams" on teams for select using (true);
create policy "dev: creation libre teams" on teams for insert with check (true);

create policy "dev: lecture libre rounds" on rounds for select using (true);
create policy "dev: creation libre rounds" on rounds for insert with check (true);
create policy "dev: maj libre rounds" on rounds for update using (true);

create policy "dev: lecture libre buzzes" on buzzes for select using (true);
create policy "dev: creation libre buzzes" on buzzes for insert with check (true);
