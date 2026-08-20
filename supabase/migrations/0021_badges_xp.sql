-- ============================================================================
-- Badges + XP/niveaux — phase 3 du plan décrit dans
-- cadrage_comptes_recompenses_rgpd.md (voir aussi migration 0020, phase 1).
--
-- Principe de conception explicite du cadrage : les DÉFINITIONS des badges
-- (libellés, icônes, seuils) vivent dans le CODE applicatif (voir
-- apps/web-host/src/lib/badges.ts), jamais en base — seules la PROGRESSION
-- et les DÉBLOCAGES (compteurs, paliers atteints, horodatages) sont
-- persistés ici, dans player_badge_progress / player_badge_unlocks. Les
-- seuils numériques (bronze/argent/or) sont donc dupliqués une fois dans
-- award_game_rewards() ci-dessous ET dans badges.ts pour l'affichage — dette
-- technique assumée et commentée, du même ordre que ROUND_DURATION_SECONDS
-- (host/page.tsx) déjà dupliqué en dur dans une autre fonction SQL plus bas.
--
-- award_game_rewards(p_room_id) suit le même idiome que resolve_buzz_winner/
-- resolve_round_attempt/reset_room_scores/timeout_round (voir migrations
-- 0002/0005/0014) : une fonction SECURITY DEFINER appelée depuis le client
-- avec la clé anon (aucune route API/serveur), qui contourne la RLS et les
-- grants de colonnes pour écrire dans des tables autrement fermées en
-- écriture à anon (player_accounts.xp, notamment — voir migration 0020).
--
-- RECALCUL COMPLET à chaque appel plutôt qu'un incrément : pour chaque
-- compte présent dans la room qui vient de terminer, TOUS les compteurs de
-- badges sont recalculés depuis l'historique complet (round_attempts/
-- rounds/players/rooms/buzzes + les deux nouvelles tables ci-dessous), pas
-- seulement depuis cette partie. Avantage : la fonction est idempotente et
-- correcte même appelée plusieurs fois pour la même room (l'hôte peut
-- relancer des manches après un premier "fin de partie", voir resumeRoom) —
-- le seul risque de double-comptage concerne l'XP de score final, protégé
-- séparément par rooms.rewards_awarded_at (voir plus bas). Les déblocages de
-- palier (player_badge_unlocks) ne peuvent eux-mêmes JAMAIS être comptés
-- deux fois, quel que soit le nombre d'appels : leur clé primaire
-- (account_id, badge_key, tier) garantit qu'un palier donné n'est inséré
-- qu'une seule fois dans toute la vie d'un compte.
-- ============================================================================

-- Garde d'idempotence pour la partie "score final" de l'XP (voir le
-- commentaire ci-dessus) : posé une seule fois, à la première fin de partie
-- de cette room. Une reprise ultérieure (resumeRoom, "+ Ajouter d'autres
-- morceaux") continue de faire progresser les badges (recalcul complet, voir
-- plus haut) mais n'ajoute plus le score de cette room à l'XP une 2e fois.
alter table rooms add column if not exists rewards_awarded_at timestamptz;

-- ----------------------------------------------------------------------------
-- Traçage minimal nécessaire à 2 badges "côté hôte" qui n'ont AUCUN signal
-- existant en base aujourd'hui (confirmé en lisant handleGenerateGenrePlaylist
-- et handleImportPlaylist dans host/page.tsx : les deux ne font que de l'état
-- React local, aucun insert Supabase) :
--
-- - room_genres_used : un genre "exploré" par partie (déduplication via la
--   clé primaire (room_id, genre) : regénérer plusieurs playlists du même
--   genre dans LA MÊME partie ne compte qu'une fois, conformément à "genres
--   DISTINCTS explorés"). ALL_GENRES_KEY ("Tous les genres", voir
--   packages/game-logic/src/genrePresets.ts) n'est volontairement jamais
--   inséré ici côté client : ce n'est pas un genre précis, l'insérer
--   fausserait le badge "Éclectique".
-- - room_playlist_imports : une ligne par import réussi (pas de contrainte
--   unique sur playlist_id seul : importer la MÊME playlist dans 2 parties
--   différentes compte bien 2 fois, mais 2 fois dans la même partie ne
--   compte qu'une fois).
--
-- Les deux suivent le modèle RLS "dev, entre amis" déjà en place pour
-- rooms/players/rounds/buzzes (voir migrations 0003/0004) : aucune donnée
-- sensible, insert direct depuis le navigateur hôte avec la clé anon,
-- fire-and-forget (une erreur d'insert ne doit jamais bloquer l'UI hôte).
create table if not exists room_genres_used (
  room_id     uuid not null references rooms(id) on delete cascade,
  genre       text not null,
  created_at  timestamptz not null default now(),
  primary key (room_id, genre)
);

create table if not exists room_playlist_imports (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  playlist_id   text not null,
  created_at    timestamptz not null default now(),
  unique (room_id, playlist_id)
);

create index if not exists idx_room_genres_used_room on room_genres_used(room_id);
create index if not exists idx_room_playlist_imports_room on room_playlist_imports(room_id);

alter table room_genres_used enable row level security;
alter table room_playlist_imports enable row level security;

create policy "lecture publique room_genres_used" on room_genres_used for select using (true);
create policy "insert libre room_genres_used" on room_genres_used for insert with check (true);
grant select, insert on room_genres_used to anon, authenticated;

create policy "lecture publique room_playlist_imports" on room_playlist_imports for select using (true);
create policy "insert libre room_playlist_imports" on room_playlist_imports for insert with check (true);
grant select, insert on room_playlist_imports to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Progression + déblocages de badges, par compte (player_accounts.id — les
-- invités sans compte n'ont donc jamais de badges, cohérent avec le fait que
-- rien n'est jamais persisté d'une partie à l'autre pour eux).
--
-- Contrairement à player_account_providers (migration 0020, jamais lisible
-- via anon), ces 2 tables sont librement LISIBLES via anon (comme
-- player_accounts) : afficher les badges d'un compte à d'autres joueurs est
-- le but même de la fonctionnalité. L'ÉCRITURE, en revanche, ne passe que
-- par award_game_rewards() (SECURITY DEFINER, contourne la RLS) : aucune
-- policy ni grant d'écriture vers anon/authenticated ci-dessous, un joueur
-- ne doit jamais pouvoir s'attribuer un badge depuis le navigateur.
create table if not exists player_badge_progress (
  account_id  uuid not null references player_accounts(id) on delete cascade,
  badge_key   text not null,
  progress    int not null default 0,
  tier        text not null default 'none' check (tier in ('none', 'bronze', 'argent', 'or')),
  updated_at  timestamptz not null default now(),
  primary key (account_id, badge_key)
);

create table if not exists player_badge_unlocks (
  account_id   uuid not null references player_accounts(id) on delete cascade,
  badge_key    text not null,
  tier         text not null check (tier in ('bronze', 'argent', 'or')),
  unlocked_at  timestamptz not null default now(),
  primary key (account_id, badge_key, tier)
);

create index if not exists idx_player_badge_progress_account on player_badge_progress(account_id);
create index if not exists idx_player_badge_unlocks_account on player_badge_unlocks(account_id);

alter table player_badge_progress enable row level security;
alter table player_badge_unlocks enable row level security;

create policy "lecture publique player_badge_progress" on player_badge_progress for select using (true);
grant select on player_badge_progress to anon, authenticated;

create policy "lecture publique player_badge_unlocks" on player_badge_unlocks for select using (true);
grant select on player_badge_unlocks to anon, authenticated;

-- Index utilisés massivement par award_game_rewards() ci-dessous (filtrage
-- par compte), absents jusqu'ici puisque rien ne filtrait round_attempts/
-- players par compte avant la phase 2 (usePlayerProfileData.ts filtre déjà
-- players par account_id, mais sans index dédié — corrigé ici en même temps).
create index if not exists idx_players_account on players(account_id) where account_id is not null;
create index if not exists idx_round_attempts_player on round_attempts(player_id);

-- ----------------------------------------------------------------------------
-- award_game_rewards(p_room_id) : calcule et attribue badges + XP pour
-- chaque compte présent dans la room, à appeler juste après avoir marqué la
-- room "finished" (voir finishRoom dans lib/rooms.ts et l'effet qui
-- l'appelle dans app/host/page.tsx).
--
-- Seuils bronze/argent/or dupliqués depuis cadrage_comptes_recompenses_rgpd.md
-- section badges — à garder synchronisé avec apps/web-host/src/lib/badges.ts
-- si jamais ces seuils changent. Le seuil "or" d'Éclectique (5) correspond au
-- nombre de clés de GENRE_PRESETS (packages/game-logic/src/genrePresets.ts) :
-- si un genre est ajouté à ce fichier, ce "5" doit être mis à jour ici aussi.
create or replace function award_game_rewards(p_room_id uuid) returns void as $$
declare
  v_already_awarded boolean;
  v_badge_keys text[] := array[
    'melomane', 'sans_faute', 'eclair', 'sur_une_lancee', 'comeback', 'chanceux',
    'reflexes', 'bonne_oreille', 'sang_froid', 'invincible', 'increvable',
    'champion', 'fidele', 'sociable', 'maitre_du_jeu', 'curateur', 'eclectique'
  ];
  v_bronze int[] := array[50, 1, 10, 1, 1, 5, 20, 20, 5, 2, 10, 1, 3, 5, 1, 5, 3];
  v_argent int[] := array[250, 5, 50, 10, 10, 20, 100, 100, 25, 5, 50, 10, 6, 20, 10, 20, 6];
  v_or     int[] := array[1000, 20, 200, 50, 30, 50, 400, 400, 100, 10, 200, 50, 12, 50, 50, 100, 5];
  v_progress int[];
  v_player record;
  i int;
  v_new_progress int;
  v_new_tier text;
  v_xp_bonus int;
  v_inserted_tier text;
  v_count_melomane int;
  v_count_sans_faute int;
  v_count_eclair int;
  v_count_sur_une_lancee int;
  v_count_comeback int;
  v_count_chanceux int;
  v_count_reflexes int;
  v_count_bonne_oreille int;
  v_count_sang_froid int;
  v_count_invincible int;
  v_count_increvable int;
  v_count_champion int;
  v_count_fidele int;
  v_count_sociable int;
  v_count_maitre_du_jeu int;
  v_count_curateur int;
  v_count_eclectique int;
begin
  select rewards_awarded_at is not null into v_already_awarded from rooms where id = p_room_id;
  if v_already_awarded is null then
    return; -- room introuvable : rien à faire (jamais censé arriver en usage normal).
  end if;

  -- Un tour de boucle par compte présent dans cette room (hôte y compris,
  -- s'il joue aussi — voir migration 0015). Les invités sans compte
  -- (account_id null) sont ignorés : rien à leur attribuer.
  for v_player in
    select distinct p.account_id, p.score
    from players p
    where p.room_id = p_room_id and p.account_id is not null
  loop
    -- === Performance en jeu =================================================

    -- Mélomane : bonnes réponses complètes cumulées (titre ET artiste sur
    -- une même tentative).
    select count(*) into v_count_melomane
    from round_attempts ra join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id and ra.title_found and ra.artist_found;

    -- Sans-faute : parties terminées où ce compte n'a JAMAIS raté un
    -- premier-buzz (aucune tentative à points négatifs) tout en ayant
    -- marqué au moins une fois (sinon une partie jouée passivement, sans
    -- aucune tentative, compterait à tort comme "100% de réussite").
    select count(*) into v_count_sans_faute
    from (
      select p.id
      from players p join rooms ro on ro.id = p.room_id
      where p.account_id = v_player.account_id and ro.status = 'finished'
        and exists (select 1 from round_attempts ra where ra.player_id = p.id and ra.points_awarded > 0)
        and not exists (select 1 from round_attempts ra where ra.player_id = p.id and ra.points_awarded < 0)
    ) t;

    -- Éclair : bonus vitesse déclenchés (round_attempts.speed_bonus_awarded,
    -- déjà posé par resolve_round_attempt — voir migration 0019).
    select count(*) into v_count_eclair
    from round_attempts ra join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id and ra.speed_bonus_awarded;

    -- Sur une lancée : nombre de fois où ce compte a atteint une série d'au
    -- moins 3 bonnes réponses complètes D'AFFILÉE dans une même room, sans
    -- qu'un AUTRE joueur ne réponde correctement entre-temps ("le buzzer
    -- revient à la normale quand quelqu'un d'autre répond bon" — voir
    -- migration 0017). Calculé directement depuis l'historique des bonnes
    -- réponses ("gaps and islands"), PAS depuis players.correct_streak_count
    -- : cette colonne ne se met à jour que si malus_streak_lockout_enabled
    -- est activé sur la room (voir migration 0019) et ne reflète que l'état
    -- COURANT, pas l'historique — recalculer depuis round_attempts donne un
    -- badge cohérent quels que soient les réglages bonus/malus choisis par
    -- l'hôte partie par partie.
    with correct_attempts as (
      select ra.player_id, ra.room_id, ra.created_at, p2.account_id
      from round_attempts ra join players p2 on p2.id = ra.player_id
      where ra.title_found and ra.artist_found
    ),
    ordered as (
      select *,
        row_number() over (partition by room_id order by created_at) as rn,
        lag(player_id) over (partition by room_id order by created_at) as prev_player_id
      from correct_attempts
    ),
    grouped as (
      select *,
        sum(case when player_id = prev_player_id then 0 else 1 end)
          over (partition by room_id order by rn) as grp
      from ordered
    ),
    run_lengths as (
      select room_id, player_id, account_id, grp, count(*) as len
      from grouped
      group by room_id, player_id, account_id, grp
    )
    select count(*) into v_count_sur_une_lancee
    from run_lengths
    where len >= 3 and account_id = v_player.account_id;

    -- Comeback : bonus remontada réussis (round_attempts.remontada_bonus_awarded).
    select count(*) into v_count_comeback
    from round_attempts ra join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id and ra.remontada_bonus_awarded;

    -- Chanceux : bonnes réponses complètes sur une manche joker (rounds.is_joker).
    select count(*) into v_count_chanceux
    from round_attempts ra
    join rounds ro on ro.id = ra.round_id
    join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id and ra.title_found and ra.artist_found and ro.is_joker;

    -- Réflexes : premier à buzzer sur une manche, peu importe le résultat
    -- ensuite (buzzes est rempli à CHAQUE tentative de buzz, y compris les
    -- refusées par resolve_buzz_winner — voir migration 0017 et sendBuzz
    -- dans lib/rooms.ts). "Premier" = le server_received_at le plus ancien
    -- pour cette manche, tous joueurs confondus.
    with first_buzz as (
      select distinct on (round_id) round_id, player_id
      from buzzes
      order by round_id, server_received_at asc
    )
    select count(*) into v_count_reflexes
    from first_buzz fb join players p2 on p2.id = fb.player_id
    where p2.account_id = v_player.account_id;

    -- Bonne oreille : réponses PARTIELLES cumulées (titre seul ou artiste
    -- seul sur une même tentative, jamais les deux à la fois).
    select count(*) into v_count_bonne_oreille
    from round_attempts ra join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id
      and (ra.title_found or ra.artist_found)
      and not (ra.title_found and ra.artist_found);

    -- Sang-froid : bonnes réponses complètes buzzées dans la toute dernière
    -- seconde du timer. ROUND_DURATION_SECONDS = 30 est défini en dur dans
    -- app/host/page.tsx (aucune colonne DB pour la durée d'une manche) : le
    -- seuil "29" ci-dessous doit être ajusté si cette constante change un
    -- jour côté client.
    select count(*) into v_count_sang_froid
    from round_attempts ra join players p2 on p2.id = ra.player_id
    where p2.account_id = v_player.account_id and ra.title_found and ra.artist_found
      and ra.reaction_seconds is not null and ra.reaction_seconds >= 29;

    -- Invincible : record de victoires consécutives (série la plus longue
    -- jamais atteinte, pas le nombre total de victoires). Victoire = score
    -- final égal au score max de la room (ex æquo inclus, comme pour
    -- Champion ci-dessous), parties ordonnées chronologiquement.
    with my_rooms as (
      select p.id as player_id, p.room_id, p.score, ro.created_at
      from players p join rooms ro on ro.id = p.room_id
      where p.account_id = v_player.account_id and ro.status = 'finished'
    ),
    room_max as (
      select room_id, max(score) as max_score
      from players
      where room_id in (select room_id from my_rooms)
      group by room_id
    ),
    games as (
      select mr.room_id, mr.created_at, (mr.score = rm.max_score) as won
      from my_rooms mr join room_max rm on rm.room_id = mr.room_id
    ),
    ranked as (
      select *, row_number() over (order by created_at) as rn from games
    ),
    grouped2 as (
      select *, sum(case when won then 0 else 1 end) over (order by rn) as grp from ranked
    ),
    win_runs as (
      select grp, count(*) as len from grouped2 where won group by grp
    )
    select coalesce(max(len), 0) into v_count_invincible from win_runs;

    -- === Assiduité ===========================================================

    -- Increvable : parties (rooms terminées) jouées.
    select count(distinct p.room_id) into v_count_increvable
    from players p join rooms ro on ro.id = p.room_id
    where p.account_id = v_player.account_id and ro.status = 'finished';

    -- Champion : parties terminées avec la 1ère place (ex æquo inclus).
    select count(*) into v_count_champion
    from (
      select p.room_id, p.score,
        (select max(score) from players where room_id = p.room_id) as max_score
      from players p join rooms ro on ro.id = p.room_id
      where p.account_id = v_player.account_id and ro.status = 'finished'
    ) t
    where t.score = t.max_score;

    -- Fidèle : mois calendaires distincts avec au moins une partie terminée.
    select count(distinct date_trunc('month', ro.created_at)) into v_count_fidele
    from players p join rooms ro on ro.id = p.room_id
    where p.account_id = v_player.account_id and ro.status = 'finished';

    -- === Social ==============================================================

    -- Sociable : comptes DISTINCTS rencontrés (co-présence dans une room
    -- terminée), tous invités anonymes exclus par définition (account_id
    -- non nul requis des deux côtés).
    select count(distinct p2.account_id) into v_count_sociable
    from players p1
    join players p2 on p2.room_id = p1.room_id and p2.account_id is not null and p2.account_id <> p1.account_id
    join rooms ro on ro.id = p1.room_id
    where p1.account_id = v_player.account_id and ro.status = 'finished';

    -- === Côté hôte ===========================================================

    -- Maître du jeu : parties (rooms terminées) organisées en tant qu'hôte
    -- (players.is_host — voir migration 0001, pas de host_player_id dédié).
    select count(distinct p.room_id) into v_count_maitre_du_jeu
    from players p join rooms ro on ro.id = p.room_id
    where p.account_id = v_player.account_id and p.is_host and ro.status = 'finished';

    -- Curateur : playlists Spotify importées en tant qu'hôte (voir
    -- room_playlist_imports ci-dessus, alimentée par handleImportPlaylist).
    select count(*) into v_count_curateur
    from room_playlist_imports rpi
    join players p2 on p2.room_id = rpi.room_id and p2.is_host and p2.account_id = v_player.account_id;

    -- Éclectique : genres distincts explorés en tant qu'hôte (voir
    -- room_genres_used ci-dessus, alimentée par handleGenerateGenrePlaylist).
    select count(distinct rgu.genre) into v_count_eclectique
    from room_genres_used rgu
    join players p2 on p2.room_id = rgu.room_id and p2.is_host and p2.account_id = v_player.account_id;

    v_progress := array[
      v_count_melomane, v_count_sans_faute, v_count_eclair, v_count_sur_une_lancee,
      v_count_comeback, v_count_chanceux, v_count_reflexes, v_count_bonne_oreille,
      v_count_sang_froid, v_count_invincible, v_count_increvable, v_count_champion,
      v_count_fidele, v_count_sociable, v_count_maitre_du_jeu, v_count_curateur,
      v_count_eclectique
    ];

    v_xp_bonus := 0;

    for i in 1..array_length(v_badge_keys, 1) loop
      v_new_progress := v_progress[i];
      v_new_tier := case
        when v_new_progress >= v_or[i] then 'or'
        when v_new_progress >= v_argent[i] then 'argent'
        when v_new_progress >= v_bronze[i] then 'bronze'
        else 'none'
      end;

      insert into player_badge_progress (account_id, badge_key, progress, tier, updated_at)
      values (v_player.account_id, v_badge_keys[i], v_new_progress, v_new_tier, now())
      on conflict (account_id, badge_key)
      do update set progress = excluded.progress, tier = excluded.tier, updated_at = now();

      -- +10 XP par palier bronze débloqué DURANT cette partie, +25 argent,
      -- +50 or (voir cadrage). La clé primaire de player_badge_unlocks
      -- empêche tout double-comptage même si cette fonction est rappelée
      -- plus tard pour ce même compte (voir le commentaire en tête de
      -- fichier) : "returning" ne renvoie une ligne que si l'insert a
      -- effectivement eu lieu, jamais sur un palier déjà débloqué avant.
      if v_new_progress >= v_bronze[i] then
        insert into player_badge_unlocks (account_id, badge_key, tier, unlocked_at)
        values (v_player.account_id, v_badge_keys[i], 'bronze', now())
        on conflict do nothing
        returning tier into v_inserted_tier;
        if v_inserted_tier is not null then
          v_xp_bonus := v_xp_bonus + 10;
          v_inserted_tier := null;
        end if;
      end if;
      if v_new_progress >= v_argent[i] then
        insert into player_badge_unlocks (account_id, badge_key, tier, unlocked_at)
        values (v_player.account_id, v_badge_keys[i], 'argent', now())
        on conflict do nothing
        returning tier into v_inserted_tier;
        if v_inserted_tier is not null then
          v_xp_bonus := v_xp_bonus + 25;
          v_inserted_tier := null;
        end if;
      end if;
      if v_new_progress >= v_or[i] then
        insert into player_badge_unlocks (account_id, badge_key, tier, unlocked_at)
        values (v_player.account_id, v_badge_keys[i], 'or', now())
        on conflict do nothing
        returning tier into v_inserted_tier;
        if v_inserted_tier is not null then
          v_xp_bonus := v_xp_bonus + 50;
          v_inserted_tier := null;
        end if;
      end if;
    end loop;

    -- Score final de CETTE partie ajouté à l'XP une seule fois (voir
    -- rewards_awarded_at plus haut) — greatest(...,0) : le score peut être
    -- négatif (bonus/malus, voir migration 0017/0019), on ne retire jamais
    -- d'XP déjà acquis pour une mauvaise partie.
    if not v_already_awarded then
      v_xp_bonus := v_xp_bonus + greatest(v_player.score, 0);
    end if;

    update player_accounts set xp = xp + v_xp_bonus where id = v_player.account_id;
  end loop;

  if not v_already_awarded then
    update rooms set rewards_awarded_at = now() where id = p_room_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function award_game_rewards(uuid) to anon, authenticated;
