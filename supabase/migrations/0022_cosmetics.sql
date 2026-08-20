-- ============================================================================
-- Cosmétiques de buzzer — phase 4 du plan décrit dans
-- cadrage_comptes_recompenses_rgpd.md (section 5.5). Comme pour les badges
-- (migration 0021), les DÉFINITIONS (couleurs/dégradés, icônes, conditions
-- de déblocage) vivent dans le CODE (voir apps/web-host/src/lib/cosmetics.tsx),
-- jamais en base — seuls le déblocage et l'équipement sont persistés ici.
-- Visuels et seuils repris fidèlement de la maquette validée
-- (maquette_comptes_espace_joueur.html, section "Skin du buzzer").
--
-- Catalogue (32 cosmétiques) :
--   - Uni (11) : 8 couleurs de base disponibles dès le départ sans condition
--     + 3 teintes de palier (bronze/argent/or), débloquées dès le premier
--     badge obtenu à ce palier, toutes catégories confondues.
--   - Nature (7) : verrouillée avant le Niveau 5, puis chaque motif débloqué
--     individuellement par le palier OR d'un badge précis.
--   - Cosmique (6) : verrouillée avant le Niveau 5, puis chaque motif débloqué
--     soit par un niveau plus élevé, soit par le palier OR d'un badge rare.
--   - Slay (8, drapeaux) : verrouillée avant le Niveau 5, puis tout le set
--     débloqué d'un coup à ce niveau (pas de déblocage un par un ici).
--
-- L'ÉQUIPEMENT (quel cosmétique est actif) ne passe PAS par une fonction
-- SECURITY DEFINER publique comme award_game_rewards : contrairement au
-- recalcul de badges (qui ne fait que refléter un historique de partie déjà
-- vrai, donc sans risque même déclenché par n'importe qui dans la room),
-- équiper un cosmétique modifie un choix personnel du compte, qui doit être
-- vérifié contre LA SESSION du joueur — chose que la clé anon ne peut pas
-- authentifier ici (pas d'auth Supabase réelle, juste un cookie de session
-- custom, voir playerAuth.ts). C'est donc une route API serveur
-- (api/player-account/equip-cosmetic, utilisant supabaseAdmin comme
-- update-pseudo/delete) qui gère l'équipement, jamais un appel direct depuis
-- le navigateur avec la clé anon.
-- ============================================================================

create table if not exists player_cosmetics (
  account_id    uuid not null references player_accounts(id) on delete cascade,
  cosmetic_key  text not null,
  unlocked_at   timestamptz not null default now(),
  equipped      boolean not null default false,
  primary key (account_id, cosmetic_key)
);

-- Un seul cosmétique équipé à la fois par compte (le "skin du buzzer" est
-- unique, pas une liste) : index unique partiel plutôt qu'une colonne dédiée
-- sur player_accounts, pour rester cohérent avec le principe "tout ce qui
-- touche aux cosmétiques reste dans player_cosmetics".
create unique index if not exists idx_player_cosmetics_one_equipped
  on player_cosmetics(account_id) where equipped;

create index if not exists idx_player_cosmetics_account on player_cosmetics(account_id);

alter table player_cosmetics enable row level security;

-- Lecture publique comme player_accounts/player_badge_progress (afficher le
-- skin équipé d'un autre joueur n'a rien de sensible). Aucun grant d'écriture
-- à anon/authenticated : les mutations passent uniquement par
-- award_cosmetic_unlocks (SECURITY DEFINER, déblocages) ou par la route API
-- equip-cosmetic (service_role, équipement — voir le commentaire en tête de
-- fichier).
create policy "lecture publique player_cosmetics" on player_cosmetics for select using (true);
grant select on player_cosmetics to anon, authenticated;

-- ----------------------------------------------------------------------------
-- award_cosmetic_unlocks(p_account_id) : calcule et débloque les cosmétiques
-- gagnés par ce compte, à partir de son XP actuel et de ses paliers de
-- badges déjà connus (player_badge_unlocks, tenu à jour par
-- award_game_rewards — voir migration 0021 et l'appel ajouté plus bas).
-- Recalcul complet à chaque appel (comme pour les badges) : ON CONFLICT DO
-- NOTHING rend chaque insertion idempotente, aucun risque à la rappeler.
--
-- Niveau = palier tous les 100 XP, MÊME FORMULE que levelForXp (voir
-- apps/web-host/src/lib/badges.ts) — dupliquée ici faute de pouvoir partager
-- ce calcul avec Postgres, à garder synchronisée si la formule change un jour.
create or replace function award_cosmetic_unlocks(p_account_id uuid) returns void as $$
declare
  v_xp int;
  v_level int;
begin
  select xp into v_xp from player_accounts where id = p_account_id;
  if v_xp is null then
    return; -- compte introuvable : rien à faire.
  end if;
  v_level := (greatest(v_xp, 0) / 100) + 1;

  -- Uni — teintes de palier : dès le premier badge obtenu à CE palier,
  -- toutes catégories de badges confondues.
  if exists (select 1 from player_badge_unlocks where account_id = p_account_id and tier = 'bronze') then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'uni_bronze') on conflict do nothing;
  end if;
  if exists (select 1 from player_badge_unlocks where account_id = p_account_id and tier = 'argent') then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'uni_argent') on conflict do nothing;
  end if;
  if exists (select 1 from player_badge_unlocks where account_id = p_account_id and tier = 'or') then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'uni_or') on conflict do nothing;
  end if;

  -- Nature (7) + 2 motifs Cosmique (Planète, Fusée) : Niveau 5 ET palier OR
  -- du badge lié (voir COSMETIC_DEFINITIONS dans cosmetics.tsx pour le
  -- mapping complet, dupliqué ici).
  if v_level >= 5 then
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'eclair' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_tigre') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'sans_faute' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_leopard') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'increvable' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_vache') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'sociable' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_zebre') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'sang_froid' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_serpent') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'fidele' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_feuillage') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'bonne_oreille' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'nature_floral') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'invincible' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_planete') on conflict do nothing;
    end if;
    if exists (select 1 from player_badge_unlocks where account_id = p_account_id and badge_key = 'maitre_du_jeu' and tier = 'or') then
      insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_fusee') on conflict do nothing;
    end if;

    -- Slay (8) : tout le set d'un coup dès le Niveau 5, pas de déblocage un
    -- par un ici (contrairement à Nature/Cosmique) — voir le cadrage.
    insert into player_cosmetics (account_id, cosmetic_key)
    values
      (p_account_id, 'slay_pride'), (p_account_id, 'slay_gay'), (p_account_id, 'slay_bi'),
      (p_account_id, 'slay_trans'), (p_account_id, 'slay_nonbinaire'), (p_account_id, 'slay_lesbienne'),
      (p_account_id, 'slay_pan'), (p_account_id, 'slay_ace')
    on conflict do nothing;
  end if;

  -- Cosmique (4) — motifs à pur seuil de niveau (déjà >= 5, aucune
  -- vérification supplémentaire nécessaire).
  if v_level >= 12 then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_comete') on conflict do nothing;
  end if;
  if v_level >= 15 then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_galaxie') on conflict do nothing;
  end if;
  if v_level >= 18 then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_voie_lactee') on conflict do nothing;
  end if;
  if v_level >= 20 then
    insert into player_cosmetics (account_id, cosmetic_key) values (p_account_id, 'cosmique_aurore') on conflict do nothing;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function award_cosmetic_unlocks(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- award_game_rewards() redéfinie (corps identique à la migration 0021) pour
-- appeler award_cosmetic_unlocks() juste après avoir mis à jour l'XP de
-- chaque compte — un seul ajout, voir le commentaire "Cosmétiques de
-- buzzer" avant la fin de la boucle ci-dessous.
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

    -- Cosmétiques de buzzer (phase 4, voir plus haut dans ce fichier) :
    -- recalculés juste après l'XP de ce compte pour cette partie, pour que
    -- le niveau utilisé par award_cosmetic_unlocks() reflète déjà le
    -- nouveau total.
    perform award_cosmetic_unlocks(v_player.account_id);
  end loop;

  if not v_already_awarded then
    update rooms set rewards_awarded_at = now() where id = p_room_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

grant execute on function award_game_rewards(uuid) to anon, authenticated;
