# Blindtest App

Une appli pour faire des blind tests entre potes sans avoir besoin de quelqu'un dédié
au lancement des sons : les téléphones (ou ordis) des joueurs servent de buzzer, un
écran "hôte" (laptop projeté sur une TV, ou juste un ordi) diffuse le son via Spotify,
affiche le code de partie, les joueurs connectés, qui a buzzé en premier et
l'historique des manches.

Projet perso (premier projet d'appli), pensé pour apprendre en s'amusant — pas un
produit commercial. Voir `docs/architecture/blueprint.docx` pour le contexte initial
complet (concept, DA, roadmap, business plan) ; ce README documente l'état **réel** du
code, qui a pas mal évolué depuis ce document de départ.

## État actuel (à jour)

**Le MVP est jouable, déployé, et testé de bout en bout avec de vraies personnes sur
des réseaux différents.** Concrètement, ce qui marche aujourd'hui :

- Un hôte ouvre l'écran web, obtient un code de partie à 6 caractères. Un refresh ou
  un retour arrière navigateur ne casse plus la partie en cours (elle est retrouvée
  via `sessionStorage`) — un bouton "↻ Nouvelle partie" permet d'en redémarrer une
  explicitement si besoin.
- Des joueurs rejoignent depuis leur téléphone (navigateur, pas d'appli à installer)
  avec ce code + un pseudo.
- L'hôte se connecte à son compte Spotify Premium, construit une playlist (recherche
  manuelle morceau par morceau, et/ou import en masse d'une de ses playlists Spotify
  existantes — mélangée aléatoirement une seule fois, à l'import), réordonnable à la
  main par glisser-déposer avant de lancer la partie.
- **Deux modes de jeu**, choisis une fois en tout début de partie :
  - **Maître du jeu** : l'hôte gère la partie mais ne joue pas, il voit tous les
    titres à l'avance (utile en soirée avec quelqu'un qui anime).
  - **Tout le monde participe** : l'hôte joue aussi, les morceaux de la file
    d'attente restent masqués (juste "Morceau 1", "Morceau 2"…) pour ne pas se
    spoiler lui-même.
- L'hôte lance une manche → le son se joue sur son ordi, avec un compte à rebours de
  30 secondes affiché.
- Les joueurs buzzent depuis leur téléphone ; le premier à buzzer est déterminé de
  façon fiable côté serveur (pas de course possible même si deux buzz arrivent à
  quelques millisecondes d'écart) ; le son se coupe automatiquement et le timer se
  fige pendant que l'hôte juge la réponse.
- L'hôte révèle la réponse (automatique en mode Maître du jeu puisqu'il la connaît
  déjà ; via un clic explicite en mode Tout le monde participe, pour ne pas se la
  spoiler avant d'avoir buzzé lui-même) puis juge ce qui a été trouvé : titre seul,
  artiste seul, les deux, ou rien.
  - **+2 points** si titre et artiste sont trouvés → manche terminée, on enchaîne.
  - **+1 point** si un seul des deux est trouvé, **-1 point** si rien n'est trouvé —
    en mode Maître du jeu, la manche reprend alors exactement là où la musique
    s'était arrêtée pour laisser une autre chance (le joueur qui vient de répondre
    est temporairement bloqué jusqu'au buzz suivant d'un autre joueur), avec un
    historique de chaque tentative conservé ; en mode Tout le monde participe, la
    manche se termine dans tous les cas dès le premier buzz.
  - Si personne ne buzze avant la fin des 30 secondes, la réponse s'affiche et la
    manche se termine sans gagnant.
  - Le score peut descendre en négatif (pas de plancher à 0).
- Classement en temps réel avec gestion des égalités (deux joueurs à égalité
  partagent le même rang), affiché aux joueurs (pseudo, score, position) et à l'hôte.
- Historique replié des manches déjà jouées, avec le détail de chaque tentative
  (qui a buzzé, quoi trouvé, combien de points) pour les manches à rallonge.
- Testé en conditions réelles : hôte + plusieurs joueurs sur des réseaux différents
  (pas besoin d'être sur le même wifi), via l'app déployée sur Vercel.

Ce qui **ne marche pas encore** / n'est pas fait :

- **Appli mobile native (Expo)** : le code existe (`apps/mobile`) et reproduit la
  logique rejoindre + buzzer (pas les évolutions récentes des règles/modes de jeu),
  mais n'a jamais été validée de bout en bout — bloquée sur des soucis de toolchain
  natif (CocoaPods / Ruby / libyaml) côté compilation iOS. Mise de côté
  volontairement : le buzzer web (`/play`, accessible depuis n'importe quel
  navigateur mobile) remplit déjà ce rôle et a été testé en conditions réelles.
- Pas de mode équipe, pas de thèmes/playlists pré-construites, pas de génération de
  playlist par IA, pas de mode réponse vocale (tout ça était prévu dans le blueprint
  initial mais pas commencé).
- Pas de vraie authentification (voir section RLS / sécurité plus bas — c'est une
  limite assumée pour cette phase "entre potes").
- La file d'attente n'est pas persistée côté serveur (table `playlists` du schéma
  prévue mais pas branchée) : elle vit en mémoire côté hôte + `sessionStorage`, donc
  ne survit qu'à un refresh de la même partie, pas à une réutilisation entre parties
  distinctes.

## Comment jouer (procédure exacte)

**En ligne (recommandé, pas besoin d'être sur le même réseau) :**

- Hôte : ouvre `https://blindtest-app-web-host.vercel.app/` sur ton ordi, connecte-toi
  à Spotify (compte Premium requis, voir plus bas), choisis un mode de jeu, construis
  ta playlist, note le code affiché.
- Joueurs : chacun ouvre `https://blindtest-app-web-host.vercel.app/play` sur son
  téléphone, entre le code + un pseudo.

**En local (pour développer) :**

- Hôte : `http://localhost:3000/` (redirige automatiquement vers `127.0.0.1`, requis
  pour que la connexion Spotify fonctionne — voir "Pourquoi 127.0.0.1 et pas
  localhost" plus bas).
- Joueurs : `http://localhost:3000/play` dans d'autres onglets, ou depuis un autre
  appareil sur le même réseau via `http://<IP locale de l'hôte>:3000/play`.

Une partie est retrouvée automatiquement au rechargement de la page hôte (stockée en
`sessionStorage`) : pour repartir de zéro (nouveau code, scores remis à zéro), utiliser
le bouton "↻ Nouvelle partie" plutôt que de recharger la page.

## Le jeu, techniquement

### Modèle de données (voir `supabase/migrations/`)

Pas de table "hosts" séparée : l'hôte est juste le navigateur qui a créé la `room` et
s'est connecté à Spotify dessus. Les tables principales :

- `rooms` : une partie (code, statut lobby/in_progress/finished).
- `players` : un joueur ayant rejoint une room (pseudo, score, device_id).
- `rounds` : une manche = un morceau. Cycle de vie du statut :
  `pending → playing → buzzed → revealed → scored` — avec un cas particulier en mode
  Maître du jeu : une manche `revealed` jugée comme incomplète (titre ou artiste
  seulement) repasse à `playing` plutôt que `scored`, pour laisser une autre chance de
  buzzer. `rounds` porte aussi `title_found`/`artist_found` (cumulatifs sur la durée
  de la manche), `locked_player_id` (dernier joueur jugé, bloqué jusqu'au prochain
  buzz d'un autre joueur) et `elapsed_seconds` (temps de jeu réel déjà écoulé avant le
  "stint" en cours, pour que le timer se fige pendant qu'on juge une réponse).
- `buzzes` : chaque tentative de buzz (pas juste le gagnant), horodatée côté serveur.
- `round_attempts` : une ligne par tentative **jugée** (pas chaque buzz brut) —
  qui a buzzé, titre/artiste trouvés ou non, points attribués. Alimente le panneau
  d'historique détaillé côté hôte.
- `teams`, `playlists`, `answers` : présentes dans le schéma pour des features futures
  (mode équipe, playlists pré-construites, réponse écrite/vocale) mais pas encore
  utilisées par le code actuel.

### Résolution du buzz (voir `supabase/migrations/0002_buzz_resolution.sql`, étendu par `0008` et `0009`)

Plutôt que de laisser le client décider "qui a buzzé en premier" (source de bugs si
deux buzz arrivent presque en même temps), un trigger Postgres
(`resolve_buzz_winner`) fait une `UPDATE ... WHERE status = 'playing'` à chaque insert
dans `buzzes` : seul le premier insert à valider sa transaction gagne, grâce au verrou
de ligne pris par la clause `WHERE`. Le trigger exclut en plus le joueur actuellement
`locked_player_id` (mode Maître du jeu, réponse partielle) et incrémente
`elapsed_seconds` au moment exact du buzz gagnant, pour que le timer visuel côté hôte
reste exact même après plusieurs reprises sur la même manche.

### Révélation et validation de la réponse (voir `0006_reveal_round.sql`, `0008_partial_answers.sql`, `0009_timer_pause_on_buzz.sql`)

- `reveal_round(round_id)` fait passer une manche `buzzed` → `revealed`. Appelé
  automatiquement côté client en mode Maître du jeu (le titre est déjà affiché en
  permanence, un clic manuel n'apporterait rien) ; appelé manuellement par l'hôte en
  mode Tout le monde participe (il ne doit pas voir la réponse avant d'avoir cliqué,
  au cas où il joue lui-même).
- `resolve_round_attempt(round_id, title_found, artist_found, force_end)` (RPC
  appelée depuis `resolveRoundAttempt()` dans `rooms.ts`) calcule les points (2 / 1 /
  -1), crédite le joueur, insère une ligne dans `round_attempts`, puis soit clôture la
  manche (`scored`) si titre + artiste sont acquis ou si `force_end` est vrai (mode
  Tout le monde participe), soit la fait repartir en `playing` (mode Maître du jeu,
  réponse incomplète) en réinitialisant `started_at` pour que le budget de 30 secondes
  ne décompte pas le temps passé à juger.
- `timeout_round(round_id)` clôture une manche `playing → scored` sans gagnant si le
  timer côté hôte arrive à 0 avant qu'un joueur ne buzze.

### Temps réel

Tout passe par **Supabase Realtime** (`postgres_changes`) : les tables `players`,
`rounds`, `buzzes` et **`round_attempts`** doivent être ajoutées à la publication
`supabase_realtime`. Piège rencontré et corrigé (`0010_round_attempts_realtime.sql`) :
ajouter une nouvelle table au schéma ne suffit pas, il faut aussi explicitement
l'ajouter à cette publication (par SQL ou via Database → Replication dans le dashboard
Supabase) — sans quoi ses lignes s'insèrent bien en base mais le client ne reçoit
jamais l'événement qui le préviendrait, et l'UI qui en dépend (ici : l'historique
détaillé) reste figée sur son état initial.

### Intégration Spotify (voir `packages/api-clients/src/spotify.ts` et `apps/web-host/src/lib/spotifyAuth.ts`)

Points importants, vérifiés en 2026 :

- **Compte Spotify Premium obligatoire côté hôte.** Spotify a supprimé l'accès aux
  extraits gratuits de 30s (`preview_url`) pour toute app créée après le 27/11/2024 —
  il n'y a plus moyen de contourner ça, seule la lecture complète via un SDK officiel
  fonctionne, et ce SDK exige Premium.
- **Web Playback SDK** : crée un "device" Spotify Connect directement dans l'onglet du
  navigateur de l'hôte. Le son sort de l'ordi de l'hôte, pas besoin d'enceinte
  connectée en Bluetooth.
- **Deux appels de lecture distincts** : `playTrackOnHostDevice` (avec un body
  `{ uris, position_ms }`) démarre un morceau depuis le début, utilisé pour chaque
  nouvelle manche ; `resumePlayback` (sans body) reprend la lecture exactement là où
  elle avait été mise en pause, utilisé quand une manche reprend après une réponse
  partielle en mode Maître du jeu — ne pas confondre les deux, un appel avec body
  relance toujours le morceau depuis zéro.
- **Auth : Authorization Code Flow + PKCE**, pas de Client Secret utilisé (ni stocké
  côté serveur). Tokens (access + refresh) stockés en cookies `httpOnly`, pas en base.
  Une seule session Spotify active à la fois (celle de l'hôte).
- **Recherche** : `GET /v1/search`, avec le token utilisateur obtenu via PKCE.
- Plusieurs endpoints Spotify (recommendations, audio-features, audio-analysis,
  related-artists, featured-playlists) sont dépréciés pour les nouvelles apps depuis
  nov. 2024 — ne pas construire de logique dessus.
- Avant validation "Extended Quota Mode" par Spotify, l'app Spotify Developer est
  limitée à 5 utilisateurs de test en Developer Mode (largement suffisant pour jouer
  entre potes).
- **Import de playlists : uniquement celles dont l'hôte est propriétaire ou
  collaborateur.** Depuis les changements API de février 2026, Spotify ne renvoie le
  contenu (`GET /playlists/{id}/tracks`) que pour ces cas-là ; toute autre playlist (y
  compris une playlist simplement suivie, ou une playlist éditoriale Spotify comme
  Découvertes de la semaine) renvoie un 403 Forbidden. Vérifié (juillet 2026) : il
  n'existe aucun contournement officiel ni connu de la communauté développeurs pour ce
  point précis. Pour importer une playlist construite avec des amis sans en être
  l'auteur, la solution est de la rendre collaborative et de s'y faire ajouter comme
  collaborateur (pas juste "suivre") — l'app gère déjà ce cas. Les morceaux importés
  sont mélangés aléatoirement (Fisher-Yates) une seule fois, à l'import — pas
  remélangés à chaque reprise de partie (piège rencontré : remélanger à chaque clic
  sur "manche suivante" écrasait silencieusement tout réordonnancement manuel fait
  par l'hôte via glisser-déposer).

### Limites connues sur mobile (Safari iOS)

Le **Web Playback SDK ne doit pas être utilisé comme lecteur audio sur Safari iOS** :
plusieurs bugs distincts, documentés indépendamment par d'autres développeurs (pas
spécifiques à cette app), rendent l'expérience non fiable sur ce navigateur :

- Autoplay bloqué après un transfert de lecture initié côté serveur (contourné en
  partie via `player.activateElement()`, voir `useSpotifyPlayer.ts`, mais pas de façon
  garantie selon les rapports de la communauté Spotify).
- Le "device" du Web Playback SDK peut disparaître (erreur `404 Device not found`) si
  l'app Spotify native est ouverte manuellement sur le même téléphone, ou si l'onglet
  Safari est mis en arrière-plan trop longtemps.
- Bug WebKit connu et non résolu : le son peut sortir par le haut-parleur du téléphone
  au lieu d'un casque/enceinte Bluetooth connecté, sans rapport avec Spotify.

**Recommandation : héberge la page `/` (écran + son) depuis un ordinateur (Mac/PC),
qui reste la config officiellement fiable pour le Web Playback SDK.** Les téléphones
restent parfaitement adaptés pour `/play` (buzzer), qui ne dépend pas du tout de
Spotify. Si l'hôte veut aussi jouer, il peut utiliser le mode "Tout le monde participe"
sur son ordinateur et ouvrir `/play` sur son propre téléphone comme n'importe quel
autre joueur. Un hôte 100% mobile fiable nécessiterait de reprendre l'app native
(`apps/mobile`) avec le SDK Spotify "App Remote" (différent du Web Playback SDK) —
non fait, voir roadmap.

### Pourquoi 127.0.0.1 et pas localhost

L'URI de redirection OAuth Spotify doit être enregistrée exactement dans le dashboard
développeur, et Spotify exige `127.0.0.1` plutôt que `localhost` depuis fin 2025. Or
les cookies posés sur `localhost` sont invisibles depuis `127.0.0.1` (le navigateur les
traite comme deux origines différentes) — ce qui cassait la connexion Spotify de façon
assez peu intuitive (`state mismatch`) si on testait sur `localhost`. Un garde-fou
(`useForceLoopbackHost`, utilisé dans `page.tsx` et `spotify-test/page.tsx`) redirige
automatiquement vers `127.0.0.1` si jamais la page est ouverte via `localhost`, pour ne
plus jamais retomber dans ce piège. Cette redirection ne s'applique qu'en local ; en
prod (un vrai domaine HTTPS) elle ne fait rien.

## Architecture / stack

- `apps/web-host/` — Next.js 16 (App Router, Turbopack) : **l'appli réellement
  utilisée aujourd'hui** (écran hôte, page joueur `/play`, connexion Spotify).
- `apps/mobile/` — Expo (React Native) : écrit mais jamais validé de bout en bout,
  mis de côté (voir "État actuel").
- `packages/game-logic/` — génération de code de room, scoring, résolution de buzz,
  matching de réponse : TypeScript partagé entre web-host et mobile.
- `packages/ui/` — design system partagé (tokens couleur/typo), embryonnaire.
- `packages/api-clients/` — wrappers API musique. `spotify.ts` est complet (recherche,
  lecture, reprise de lecture, import de playlist). `youtube.ts` / `deezer.ts` sont
  des stubs non utilisés.
- `supabase/migrations/` — schéma Postgres + RLS + fonctions, versionné et numéroté :
  - `0001_init` : schéma de base + RLS activée (deny-all par défaut)
  - `0002_buzz_resolution` : trigger de résolution atomique du buzz
  - `0003_dev_policies` : policies RLS permissives (phase prototype)
  - `0004_rls_hardening` : durcissement (colonnes restreintes, fonctions
    SECURITY DEFINER) — voir la section Sécurité plus bas
  - `0005_resolve_round` : RPC de validation de réponse + attribution du score
    (remplacée depuis par `resolve_round_attempt`, voir `0008`)
  - `0006_reveal_round` : étape de révélation explicite avant validation
  - `0007_round_timeout_and_history` : timeout de manche + `was_correct` pour
    l'historique
  - `0008_partial_answers` : réponses partielles (titre/artiste seul), reprise de
    manche, verrouillage de buzzer, table `round_attempts`
  - `0009_timer_pause_on_buzz` : `elapsed_seconds`, timer qui se fige pendant le
    jugement d'une réponse
  - `0010_round_attempts_realtime` : ajout de `round_attempts` à la publication
    Realtime (voir "Temps réel" plus haut)
- `docs/architecture/` — document de conception initial (`blueprint.docx`).
- `.github/workflows/ci.yml` — lint + typecheck des deux apps sur push/PR.

### apps/web-host en détail

- `src/app/page.tsx` — écran hôte : code de partie, joueurs, choix du mode de jeu,
  construction de playlist (recherche + import + glisser-déposer), lancement de
  manche, timer, jugement de la réponse, historique.
- `src/app/play/page.tsx` — écran joueur : rejoindre par code + pseudo, bouton buzz,
  pseudo/score/classement permanents, nom du premier buzzeur, réponse révélée
  uniquement une fois la manche réellement terminée.
- `src/app/spotify-test/page.tsx` — page de validation isolée de la connexion Spotify
  (utile pour déboguer l'auth sans dépendre d'une partie en cours).
- `src/app/api/spotify/login/route.ts` — démarre le flow OAuth PKCE, pose les cookies
  verifier/state.
- `src/app/api/spotify/callback/route.ts` — échange le code contre les tokens, pose
  les cookies de session.
- `src/app/api/spotify/token/route.ts` — renvoie un access token valide au client
  (refresh automatique si besoin).
- `src/app/api/spotify/logout/route.ts` — supprime les cookies de session Spotify.
- `src/lib/rooms.ts` — toutes les fonctions Supabase : créer/rejoindre une room,
  s'abonner aux joueurs/manches/historique/tentatives en temps réel, lancer une
  manche, buzzer, révéler, juger une tentative, clôturer par timeout.
- `src/lib/ranking.ts` — classement partagé (rangs avec égalités) entre écran hôte et
  écran joueur, pour qu'ils affichent toujours exactement le même classement.
- `src/lib/spotifyAuth.ts` — fonctions pures PKCE (génération verifier/challenge/state,
  échange de code, refresh) ; pas de cookies ici, c'est chaque route qui les manipule
  directement.
- `src/lib/useSpotifyPlayer.ts` — hook : connexion au Web Playback SDK, expose device
  id + access token + état de connexion.
- `src/lib/useForceLoopbackHost.ts` — garde-fou localhost → 127.0.0.1 (voir plus haut).
- `src/lib/supabase.ts` — client Supabase (clé anon, lit les variables d'env).

## Sécurité / RLS — limites assumées

**Il n'y a pas d'authentification réelle** (Supabase Auth n'est pas branché). Les
joueurs sont identifiés par un `device_id` généré côté client, non vérifié. C'est un
choix assumé pour cette phase "prototype entre amis" (voir les commentaires en tête de
`0003_dev_policies.sql`), pas un oubli — mais il faut en avoir conscience avant
d'envisager d'ouvrir l'app à des inconnus :

- N'importe qui connaissant le code d'une partie peut la rejoindre.
- Un client techniquement curieux pourrait appeler les routes Supabase directement
  (avec la clé anon, publique par nature) plutôt que de passer par l'interface.

Ceci dit, `0004_rls_hardening.sql` réduit déjà pas mal la surface : plus aucune policy
`UPDATE` ouverte sur `players` ou `rounds` (un client ne peut plus modifier le score de
quelqu'un d'autre ou trafiquer le statut d'une manche directement) ; les colonnes
insérables sont restreintes via des `GRANT` ciblés (impossible de s'auto-déclarer hôte,
de truquer un score à la création, ou de falsifier l'horodatage d'un buzz) ; les seules
transitions d'état encore possibles passent par des fonctions Postgres
`SECURITY DEFINER` (`resolve_buzz_winner`, `reveal_round`, `resolve_round_attempt`,
`timeout_round`) qui ne font qu'une chose précise chacune. `round_attempts` a une
policy `select` permissive (lecture libre) puisque le client la lit directement pour
l'historique, sans passer par une RPC — mais aucune policy `insert`/`update` ouverte,
seule la fonction `resolve_round_attempt` peut y écrire. À faire avant une vraie
ouverture au public : brancher Supabase Auth (même anonyme) et réécrire les policies
pour restreindre "appartenir à sa propre room / son propre player".

## Démarrer en local

Prérequis : Node.js 18+, un compte [Supabase](https://supabase.com) (gratuit), un
compte [Spotify Developer](https://developer.spotify.com/dashboard) (gratuit, **et un
compte Spotify Premium** pour tester la lecture), un navigateur Chrome de préférence
(testé et fiable ; Safari a des comportements différents avec les cookies sur IP
littérale, voir "Limites connues sur mobile" plus haut).

Étapes :

1. Installer les dépendances de tout le monorepo : `npm install`
2. Lancer l'écran hôte web (http://localhost:3000, redirige vers 127.0.0.1) :
   `npm run web-host`
3. (Optionnel, non maintenu activement) l'app mobile Expo : `npm run mobile`

### Variables d'environnement

Dans `apps/web-host/.env.local` (jamais commité, voir `.gitignore`) :

- `NEXT_PUBLIC_SUPABASE_URL` = https://ton-projet.supabase.co
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clé anon publique du projet Supabase
- `SPOTIFY_CLIENT_ID` = Client ID de ton app Spotify Developer
- `SPOTIFY_REDIRECT_URI` = http://127.0.0.1:3000/api/spotify/callback

Pas de `SPOTIFY_CLIENT_SECRET` nécessaire (flow PKCE).

### Configuration Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans SQL Editor, exécute dans l'ordre les fichiers de `supabase/migrations/`
   (0001 → 0010). Chaque fichier est commenté pour expliquer ce qu'il fait.
3. Dans Database → Publications → `supabase_realtime`, vérifie que les tables
   `players`, `rounds`, `buzzes`, `rooms` et `round_attempts` sont bien activées
   (la migration `0010` le fait déjà pour `round_attempts` par SQL, mais un nouveau
   projet Supabase créé de zéro peut nécessiter de vérifier les autres tables à la
   main — piège rencontré et documenté dans l'historique du repo : sans ça,
   l'interface hôte ne se met pas à jour en temps réel).

### Configuration Spotify Developer

1. Crée une app sur le [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Dans Settings → Redirect URIs, ajoute `http://127.0.0.1:3000/api/spotify/callback`
   (et l'URL de prod si tu déploies, voir plus bas).
3. Copie le Client ID dans `.env.local` (pas besoin du Client Secret).

## Déploiement (Vercel)

L'app est déployée sur Vercel (offre Hobby, gratuite pour un usage personnel/non
commercial) : **https://blindtest-app-web-host.vercel.app**

Pour redéployer ou recréer le déploiement :

1. Sur [vercel.com](https://vercel.com), importe le repo GitHub, avec **Root
   Directory = `apps/web-host`** (monorepo — Vercel doit savoir où trouver l'app
   Next.js).
2. Renseigne les variables d'environnement (mêmes noms qu'en local, sauf
   `SPOTIFY_REDIRECT_URI` qui doit pointer vers le domaine Vercel réel, ex.
   `https://blindtest-app-web-host.vercel.app/api/spotify/callback`).
3. Ajoute cette même URL dans les Redirect URIs du Spotify Developer Dashboard (en plus
   de celle en `127.0.0.1`, garder les deux).
4. Deploy.

Les cookies de session Spotify sont automatiquement en `secure: true` en production
(HTTPS) et `secure: false` en local (HTTP) — géré via
`process.env.NODE_ENV === "production"` dans les routes `api/spotify/*`.

## Qualité / CI

- **ESLint** (config flat, ESLint 9) : `eslint-config-next` pour web-host,
  `eslint-config-expo` pour mobile.
- **TypeScript strict** sur les deux apps (`npm run typecheck --workspace=apps/...`).
- **GitHub Actions** (`.github/workflows/ci.yml`) : lint + typecheck des deux apps à
  chaque push/PR sur `develop` et `main`.

Commandes utiles :

- `npm run lint --workspace=apps/web-host`
- `npm run typecheck --workspace=apps/web-host`
- `npm run lint --workspace=apps/mobile`
- `npm run typecheck --workspace=apps/mobile`

Avant tout commit sur ce projet, valider dans l'ordre : lint, typecheck, puis un
build de production (`rm -rf .next && npx next build` dans `apps/web-host`) — le
build échoue dans un environnement sans `.env.local` (message `supabaseUrl is
required` au moment du prerendering de `/`), c'est attendu et sans rapport avec le
code : sur la machine de dev (avec de vraies variables d'environnement), il passe.

## Conventions Git

- `main` : branche stable, mise à jour après validation d'un palier (merge depuis
  `develop`).
- `develop` : branche de travail au quotidien.
- `feature/<nom>` : optionnel, pour une fonctionnalité isolée avant de merger dans
  `develop`.
- Commits au format [Conventional Commits](https://www.conventionalcommits.org/) :
  `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Repo hébergé sur un compte GitHub **personnel**, distinct du compte professionnel
  utilisé sur cette même machine (config git locale au repo, pas globale — voir
  `git config --local -l` si besoin de vérifier).
- Toute migration SQL doit être à la fois committée dans `supabase/migrations/` **et**
  collée manuellement dans Supabase → SQL Editor : committer le fichier seul ne
  l'applique pas à la base.

## Roadmap (mis à jour)

Complété par rapport au plan initial (`docs/architecture/blueprint.docx`) :

- ✅ Mécanique buzzer temps réel (résolution atomique, testée sous charge normale).
- ✅ Intégration Spotify complète (recherche, import de playlist, lecture, pause
  et reprise automatiques).
- ✅ Boucle de jeu complète : deux modes de jeu, réponses partielles avec reprise de
  manche, système de score 2/1/-1, timer 30s qui se fige pendant le jugement,
  historique détaillé, classement avec égalités.
- ✅ Persistance de la partie en cours (survit à un refresh / retour arrière).
- ✅ Déploiement public (Vercel), jouable à distance entre plusieurs réseaux.
- ✅ CI (lint + typecheck), policies RLS durcies dans la limite du raisonnable sans
  auth.

Pas encore fait, par ordre de valeur perçue :

- Mode équipe, thèmes/playlists pré-construites, playlists générées par IA.
- Persister la file d'attente côté serveur pour la réutiliser d'une partie à l'autre.
- Reprendre l'app mobile native (si le confort d'une vraie app est souhaité un jour —
  pas indispensable, le buzzer web fonctionne bien).
- DA / polish visuel à continuer d'affiner (la base "arcade néon" est posée, mais
  certains écrans mériteraient encore du travail).
- Authentification réelle + policies RLS restreintes par utilisateur, si l'app devait
  s'ouvrir au-delà d'un cercle d'amis de confiance.
