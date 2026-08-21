"use client";

// Page volontairement non pré-générée statiquement : elle dépend de
// sessionStorage et de Supabase au premier rendu, ça n'a pas de sens de la
// figer au moment du build.
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { spotify } from "@blindtest/api-clients";
import { GENRE_PRESETS, ALL_GENRES_KEY, getArtistPool } from "@blindtest/game-logic";
import {
  createRoom,
  getRoomById,
  subscribeToPlayers,
  subscribeToRounds,
  subscribeToRoundHistory,
  subscribeToRoundAttempts,
  startRoundWithTrack,
  revealRound,
  resolveRoundAttempt,
  timeoutRound,
  finishRoom,
  resumeRoom,
  resetRoomScores,
  joinRoomAsHost,
  sendBuzz,
  updateRoomBonusMalusSettings,
  awardGameRewards,
  recordGenreUsed,
  recordPlaylistImport,
  type Player,
  type Round,
  type RoundAttempt,
  type Room,
} from "../../lib/rooms";
import { withRanks, formatOrdinal, podiumRowClasses } from "../../lib/ranking";
import { isFullyBlockedThisRound, buzzUnlockedAtMs } from "../../lib/buzzLockout";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";
import {
  getSpotifyQuotaLocks,
  setSpotifyQuotaLock,
  clearSpotifyQuotaLock,
  subscribeToSpotifyQuotaLocks,
  type SpotifyQuotaLocks,
} from "../../lib/spotifyQuotaLock";
import { useSpotifyPlayer } from "../../lib/useSpotifyPlayer";
import { PlayerAccountCorner } from "../_components/PlayerAccountCorner";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { usePlayerCosmetics } from "../../lib/usePlayerCosmetics";
import { COSMETIC_BY_KEY, DEFAULT_COSMETIC_KEY, type CosmeticDefinition } from "../../lib/cosmetics";
import {
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  LogOut,
  Music2,
  CheckCircle2,
  XCircle,
  Mic,
  Bell,
  Eye,
  EyeOff,
  Target,
  Hash,
  Headphones,
  Mic2,
  Trophy,
  Music,
  Zap,
  Flame,
  Play,
  Search,
  ListMusic,
  Dice5,
  AlertTriangle,
  Check,
  GripVertical,
  LayoutDashboard,
  Gamepad2,
  UserPlus,
  TrendingUp,
} from "lucide-react";

type HostMode = "gamemaster" | "player";

// Les 5 réglages bonus/malus (voir migration 0018 et Room dans lib/rooms.ts)
// regroupés sous un seul type utilitaire — évite de répéter l'union des 5
// clés à chaque fois (handleToggleBonusMalusSetting, BonusMalusToggleRow).
type BonusMalusSettings = Pick<
  Room,
  | "bonus_joker_enabled"
  | "bonus_speed_enabled"
  | "bonus_remontada_enabled"
  | "malus_streak_lockout_enabled"
  | "malus_streak_block_enabled"
>;

// Durée du timer visuel par manche : purement indicatif jusqu'à 0, à ce
// moment-là la musique est coupée et la manche est clôturée sans gagnant
// (voir l'effet de timer plus bas et timeoutRound dans lib/rooms.ts).
const ROUND_DURATION_SECONDS = 30;

// ============================================================================
// Persistance de la partie en cours dans sessionStorage — pour qu'un
// refresh ou un retour en arrière navigateur (fausse manip courante) ne
// force pas à recommencer une partie avec un nouveau code : l'écran hôte
// retrouve la même room (et la même file d'attente/mode de jeu) au lieu
// d'en créer une nouvelle à chaque chargement.
//
// sessionStorage plutôt que localStorage volontairement : ça survit au
// refresh et au bouton précédent/suivant du navigateur (ce qui est demandé
// ici), mais pas à la fermeture de l'onglet, et surtout n'est PAS partagé
// entre onglets — donc ouvrir un deuxième onglet hôte ne vient pas se
// raccrocher silencieusement à la même partie (et au même device Spotify).
// ============================================================================

const ROOM_STORAGE_KEY = "blindtest_host_room";
const MODE_STORAGE_KEY = "blindtest_host_mode";
const QUEUE_STORAGE_KEY = "blindtest_host_queue";
const QUEUE_INDEX_STORAGE_KEY = "blindtest_host_queue_index";
const BUILDING_STORAGE_KEY = "blindtest_host_building_playlist";
// Score à atteindre pour gagner (optionnel) : voir `targetScore` plus bas.
// null = comportement historique, la partie dure jusqu'à la fin de la
// playlist.
const TARGET_SCORE_STORAGE_KEY = "blindtest_host_target_score";
// Nombre de morceaux max (optionnel) : même principe que le score cible,
// mais sur le nombre de manches jouées plutôt que sur le score — permet de
// charger une grosse playlist existante sans devoir la jouer en entier.
// Cumulable avec targetScore (voir maxRoundsReached / targetScoreReached
// plus bas) : la partie s'arrête dès que la première des deux limites est
// atteinte, ou à la fin de la playlist si aucune des deux n'est fixée.
const MAX_ROUNDS_STORAGE_KEY = "blindtest_host_max_rounds";
// "Tu joues aussi sur cet écran ?" (mode "Tout le monde participe"
// uniquement, voir blindMode) : décision prise UNE SEULE FOIS, avant le
// lancement de la toute première manche (sinon le premier morceau démarre
// avant que l'hôte ait pu s'inscrire comme joueur) — pas un toggle qu'on
// peut changer d'avis en cours de partie, voir hostJoinResolved plus bas.
// hostPlayerId identifie la ligne `players` (is_host = true, voir
// joinRoomAsHost) créée si l'hôte répond "oui" ; hostJoinSkipped mémorise
// qu'il a répondu "non" (pour ne pas réafficher la question). hostView ne
// pilote que l'écran actuellement affiché (admin vs buzzer) : basculé
// automatiquement au lancement d'une manche et au premier buzz, voir
// handlePlayNextInQueue et l'effet de bascule automatique plus bas — plus
// aucun contrôle manuel côté hôte pour ça.
const HOST_PLAYER_ID_STORAGE_KEY = "blindtest_host_player_id";
const HOST_JOIN_SKIPPED_STORAGE_KEY = "blindtest_host_join_skipped";
const HOST_VIEW_STORAGE_KEY = "blindtest_host_view";

function readStoredJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée stricte, quota, etc.) : pas
    // grave, la partie fonctionnera juste sans survivre à un refresh.
  }
}

function clearStoredGameState() {
  if (typeof window === "undefined") return;
  for (const key of [
    ROOM_STORAGE_KEY,
    MODE_STORAGE_KEY,
    QUEUE_STORAGE_KEY,
    QUEUE_INDEX_STORAGE_KEY,
    BUILDING_STORAGE_KEY,
    TARGET_SCORE_STORAGE_KEY,
    MAX_ROUNDS_STORAGE_KEY,
    HOST_PLAYER_ID_STORAGE_KEY,
    HOST_JOIN_SKIPPED_STORAGE_KEY,
    HOST_VIEW_STORAGE_KEY,
  ]) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // idem
    }
  }
}

// Mélange une copie du tableau (Fisher-Yates) — utilisé pour l'import de
// playlist en mode "tout le monde participe", pour qu'un hôte qui connaît
// sa propre playlist ne puisse pas deviner l'ordre des manches à venir.
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Une ligne de réglage bonus/malus (voir migration 0018) : nom clair +
// icône + interrupteur compact, explication complète au survol via l'attribut
// title natif (choisi plutôt qu'un popover custom — demandé "qui ne
// prennent pas trop de place", pas la peine d'ajouter la mécanique d'un
// vrai tooltip pour ça). Interrupteur volontairement plus petit
// (w-9 h-5) que celui utilisé par le passé pour "l'hôte joue aussi"
// (w-14 h-8, retiré depuis) : cinq d'entre eux tiennent côte à côte sans
// prendre toute la largeur du panneau.
function BonusMalusToggleRow({
  label,
  description,
  icon,
  iconClassName,
  enabled,
  saving,
  onToggle,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  iconClassName: string;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      title={description}
      className="flex items-center justify-between gap-3 bg-inkSurface3 rounded-lg px-3 py-2 cursor-default"
    >
      <span className="flex items-center gap-1.5 text-sm text-inkMuted min-w-0">
        <span className={`shrink-0 ${iconClassName}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={saving}
        onClick={onToggle}
        className={`relative shrink-0 w-9 h-5 rounded-full border transition-colors disabled:opacity-50 ${
          enabled ? "bg-sage border-sage" : "bg-inkSurface2 border-inkBorder"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/**
 * Vue "hôte joueur" (montée dès que hostView === "buzzer", voir l'early
 * return dans HostScreen) : porte
 * quasiment tel quel la logique de BuzzerView (app/play/page.tsx) — même
 * calculs canBuzz/alreadyBuzzed/iWon, même style de bouton fixe vert plein
 * / outlined — mais réutilise round/players déjà chargés côté hôte
 * (subscribeToRounds/subscribeToPlayers dans HostScreen) plutôt que
 * d'ouvrir une deuxième souscription Realtime redondante. Ne réplique pas
 * l'écran de fin de partie enrichi de /play (podium, stats) : quand la
 * partie est terminée, un simple message renvoie vers la vue admin, qui a
 * déjà son propre écran de fin.
 */
function HostBuzzerView({
  round,
  players,
  hostPlayerId,
  gameOver,
  sending,
  onBuzz,
  onBackToAdmin,
  equippedCosmetic,
}: {
  round: Round | null;
  players: Player[];
  hostPlayerId: string;
  gameOver: boolean;
  sending: boolean;
  onBuzz: () => void;
  onBackToAdmin: () => void;
  equippedCosmetic: CosmeticDefinition;
}) {
  const alreadyBuzzed =
    round?.status === "buzzed" || round?.status === "revealed" || round?.status === "scored";
  // Mode "Maître du jeu" uniquement en pratique (voir HostScreen : ce
  // composant n'est monté qu'en blindMode) — locked_player_id existe pour
  // les deux modes côté données, gardé ici pour rester symétrique avec
  // BuzzerView.
  const isLocked = round?.status === "playing" && round.locked_player_id === hostPlayerId;
  const iWon = alreadyBuzzed && round?.buzzed_by_player_id === hostPlayerId;
  const buzzer = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;
  const somethingAlreadyFound = round && (round.title_found || round.artist_found);
  // Comme côté /play : la réponse ne s'affiche sur CE buzzer qu'une fois
  // "scored", jamais dès "revealed" — sinon l'hôte verrait le titre/artiste
  // s'afficher ici avant même d'avoir basculé sur la vue admin pour juger,
  // ce qui casserait l'effet "je ne connais pas la réponse à l'avance" pour
  // lui-même.
  const answerRevealed = round?.status === "scored";

  const ranked = withRanks(players);
  const me = ranked.find((p) => p.id === hostPlayerId);

  // Malus buzzer (voir lib/buzzLockout.ts + migration 0017) : la vraie
  // application se fait côté serveur (resolve_buzz_winner), ceci ne sert
  // qu'à refléter visuellement l'état à l'hôte quand il joue. Tick toutes
  // les 250ms (même granularité que le timer de manche côté vue admin)
  // pour faire décompter le délai malus 1 et réactiver le bouton pile au
  // bon moment.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (round?.status !== "playing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNow(null);
      return;
    }
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [round?.id, round?.status]);

  const fullyBlocked = me && round ? isFullyBlockedThisRound(me, round) : false;
  const unlockedAtMs = me && round ? buzzUnlockedAtMs(me.correct_streak_count, round.started_at) : null;
  const lockoutRemainingSeconds =
    now !== null && unlockedAtMs ? Math.max(0, Math.ceil((unlockedAtMs - now) / 1000)) : 0;
  const isLockedOut = lockoutRemainingSeconds > 0;

  const canBuzz = round?.status === "playing" && !sending && !isLocked && !fullyBlocked && !isLockedOut;

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      <div className="relative w-full flex justify-between items-center bg-inkSurface border border-inkBorder rounded-2xl px-5 py-3">
        <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-sage" />
        <span className="font-bold truncate">{me?.display_name ?? "Toi"}</span>
        <span className="text-sm text-inkMuted whitespace-nowrap">
          {me ? `${formatOrdinal(me.rank)} / ${players.length}` : ""}{" "}
          <span className="font-bold text-sage">· {me?.score ?? 0} pts</span>
        </span>
      </div>

      {gameOver ? (
        <p className="text-xl text-inkMuted text-center">
          La partie est terminée — reviens sur la vue admin pour voir les résultats.
        </p>
      ) : !round ? (
        <p className="text-xl text-inkMuted text-center animate-pulse">
          En attente du lancement d’une manche…
        </p>
      ) : (
        <>
          {round.is_joker && (
            <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full">
              <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
            </span>
          )}
          {somethingAlreadyFound && (
            <p className="text-sm text-inkMuted text-center">
              Déjà trouvé : {[round.title_found && "titre", round.artist_found && "artiste"]
                .filter(Boolean)
                .join(" et ")}
              {" — à vous de jouer pour le reste !"}
            </p>
          )}
          <button
            onClick={onBuzz}
            disabled={!canBuzz}
            className={`relative overflow-hidden w-56 h-56 rounded-full text-3xl font-black transition ${
              canBuzz
                ? "active:scale-95"
                : alreadyBuzzed
                  ? iWon
                    ? "bg-transparent"
                    : "bg-inkSurface2 text-inkMuted shadow-[0_0_0_6px_#0A0A0C,0_0_0_9px_#3A3A45]"
                  : "bg-inkSurface2 text-inkMuted shadow-[0_0_0_6px_#0A0A0C,0_0_0_9px_#3A3A45]"
            }`}
            /* Skin de buzzer équipé (voir usePlayerCosmetics, migration
               0022) — même traitement que BuzzerView (app/play/page.tsx) :
               ce composant est un quasi-duplicata volontaire (voir le
               commentaire en tête de HostBuzzerView), donc reproduit ici à
               l'identique plutôt que factorisé. */
            style={
              canBuzz
                ? {
                    background: equippedCosmetic.swatch,
                    color: equippedCosmetic.textOn === "dark" ? "#0A0A0C" : "#FFFFFF",
                    boxShadow: `0 0 0 6px #0A0A0C, 0 0 0 9px ${equippedCosmetic.accentColor}`,
                  }
                : alreadyBuzzed && iWon
                  ? { color: equippedCosmetic.accentColor, boxShadow: `0 0 0 6px #0A0A0C, 0 0 0 9px ${equippedCosmetic.accentColor}` }
                  : undefined
            }
          >
            {(canBuzz || (alreadyBuzzed && iWon)) && equippedCosmetic.icon && (
              <span className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                {equippedCosmetic.icon({ size: 140 })}
              </span>
            )}
            <span className="relative">
            {alreadyBuzzed ? (
              iWon ? (
                <span className="inline-flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-9 h-9" />
                  BUZZÉ !
                </span>
              ) : (
                "BUZZÉ"
              )
            ) : fullyBlocked ? (
              "BLOQUÉ"
            ) : isLockedOut ? (
              `${lockoutRemainingSeconds}s`
            ) : (
              "BUZZ"
            )}
            </span>
          </button>
          {alreadyBuzzed && (
            <p className={`text-xl font-bold text-center ${iWon ? "text-sage" : "text-danger"}`}>
              {iWon
                ? "Tu as buzzé en premier !"
                : round.buzzed_by_player_id === null
                  ? "Personne n’a buzzé à temps"
                  : `${buzzer?.display_name ?? "Un autre joueur"} a buzzé en premier !`}
            </p>
          )}
          {!alreadyBuzzed && fullyBlocked && (
            <p className="text-sm text-danger text-center">
              Ton buzzer est bloqué ce tour-ci — trop de premières réponses ratées d’affilée.
            </p>
          )}
          {!alreadyBuzzed && !fullyBlocked && isLockedOut && (
            <p className="text-sm text-inkMuted text-center">
              Trop de bonnes réponses d’affilée : buzzer débloqué dans {lockoutRemainingSeconds}s.
            </p>
          )}
          {isLocked && (
            <p className="text-sm text-inkMuted text-center">
              Tu viens de répondre — attends qu’un autre joueur tente sa chance avant de rebuzzer.
            </p>
          )}
          {answerRevealed && (
            <div className="w-full text-center bg-inkSurface border border-inkBorder rounded-2xl px-6 py-4">
              <p className="text-sm text-inkMuted mb-1">La réponse était :</p>
              <p className="text-xl font-bold text-sage font-display">
                {round.title} — {round.artist}
              </p>
            </div>
          )}
        </>
      )}

      <button
        onClick={onBackToAdmin}
        className="text-xs text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1"
      >
        <LayoutDashboard className="w-3.5 h-3.5" /> Vue admin
      </button>
    </div>
  );
}

// Options d'époque pour la génération de playlist par genre (voir
// handleGenerateGenrePlaylist) : décennies larges plutôt qu'un input libre —
// plus rapide à choisir pour l'hôte, et évite une plage d'années mal
// formée. "Toutes années" ne filtre pas du tout par year: côté Spotify.
const ERA_OPTIONS: { label: string; range: { from: number; to: number } | null }[] = [
  { label: "Toutes années", range: null },
  { label: "Années 70", range: { from: 1970, to: 1979 } },
  { label: "Années 80", range: { from: 1980, to: 1989 } },
  { label: "Années 90", range: { from: 1990, to: 1999 } },
  { label: "Années 2000", range: { from: 2000, to: 2009 } },
  { label: "Années 2010", range: { from: 2010, to: 2019 } },
  { label: "Années 2020", range: { from: 2020, to: 2029 } },
];

// Clé localStorage pour persister artistSearchCache (voir plus bas) entre
// deux chargements de la page /host — le quota Spotify Developer Mode est
// désormais compté par compte développeur (pas juste par app) et ne se
// débloque pas rapidement une fois dépassé (pas de fenêtre glissante de 30s
// comme le rate-limit classique) : un simple F5 pendant les tests ne doit
// pas effacer ce qu'on a déjà réussi à récupérer, sous peine de re-brûler du
// quota pour les mêmes artistes.
const ARTIST_SEARCH_CACHE_STORAGE_KEY = "blindtest_artist_search_cache_v1";

// Rafraîchit le token Spotify juste avant un appel API fait "en tâche de
// fond" (recherche, chargement/import de playlist, lancement de manche...),
// plutôt que de se fier à spotifyPlayer.accessTokenRef.current directement :
// ce dernier date du chargement de la page (ou du dernier rafraîchissement
// interne du Web Playback SDK, qui ne se déclenche que quand LUI en a
// besoin pour la lecture, pas pour ces appels-ci) et peut avoir expiré
// depuis (durée de vie ~1h côté Spotify). Sans ce refresh explicite, une
// session hôte ouverte depuis un moment fait échouer ces appels en 401 (ou
// parfois en 403 "Restriction violated" sur /player/play, Spotify n'étant
// pas toujours cohérent sur le code renvoyé pour un token borderline) —
// pattern déjà en place pour handleGenerateGenrePlaylist, généralisé ici à
// handleSearch / handleLoadMyPlaylists / handleImportPlaylist / launchRound
// après le double signalement d'un 401 sur l'import et d'un 403 sur
// "manche suivante" en local. /api/spotify/token gère déjà le refresh via
// le refresh_token cookie ; on l'appelle ici pour être sûr d'avoir un token
// valide avant l'appel réel. Retombe sur `fallback` si le refresh échoue
// pour une raison réseau (au pire l'appel qui suit échouera comme avant) ;
// retourne null si la connexion Spotify est carrément perdue (refresh_token
// absent/invalide côté serveur).
async function getFreshSpotifyAccessToken(fallback: string | null): Promise<string | null> {
  try {
    const res = await fetch("/api/spotify/token");
    const data = await res.json();
    if (!data.connected) return null;
    return data.accessToken as string;
  } catch {
    return fallback;
  }
}

// Formatage lisible du temps restant avant la fin du coupe-circuit quota
// Spotify (voir searchQuotaCooldownSeconds / playlistsQuotaCooldownSeconds)
// — en heures + minutes plutôt qu'en secondes brutes, ce délai se comptant
// potentiellement en heures.
function formatCooldownDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.max(1, Math.ceil((totalSeconds % 3600) / 60));
  return hours > 0 ? `${hours}h${minutes > 0 ? ` ${minutes}min` : ""}` : `${minutes}min`;
}

// Secondes restantes avant blockedUntilIso (0 si passé/absent) — dérivé de
// `now` plutôt que recalculé via Date.now() à chaque appel, pour que le
// rendu réagisse au ticker (voir quotaNowTick dans HostScreen) sans dépendre
// de l'horloge système au moment précis du rendu.
function secondsUntil(blockedUntilIso: string | undefined, now: number): number {
  if (!blockedUntilIso) return 0;
  const remaining = new Date(blockedUntilIso).getTime() - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

// Spotify ne documente aucun délai de réinitialisation pour ce quota — un
// délai fixe deviné au hasard est soit trop court (constaté : un 429 encore
// actif après seulement 1h d'attente), soit trop long. Backoff exponentiel
// à la place, en miroir du coupe-circuit local (voir QUOTA_BLOCK_BASE_MS
// dans packages/api-clients/src/spotify.ts) : 1h la première fois, doublé à
// chaque confirmation QUOTA_EXCEEDED consécutive, plafonné à 24h — et remis
// à zéro dès qu'une requête réussit (voir les clearSpotifyQuotaLock
// ci-dessous, dans les handlers).
const SHARED_QUOTA_LOCK_BASE_MS = 60 * 60 * 1000; // 1h
const SHARED_QUOTA_LOCK_MAX_MS = 24 * 60 * 60 * 1000; // 24h — plafond de sécurité, pas un chiffre officiel

function computeSharedQuotaBackoffMs(previousHits: number): number {
  const nextHits = previousHits + 1;
  return Math.min(SHARED_QUOTA_LOCK_BASE_MS * 2 ** (nextHits - 1), SHARED_QUOTA_LOCK_MAX_MS);
}

/**
 * Pose (ou prolonge avec backoff) le verrou PARTAGÉ (voir
 * spotifyQuotaLock.ts) uniquement si l'erreur capturée est un 429
 * QUOTA_EXCEEDED confirmé (pas n'importe quelle erreur réseau) — appelé
 * depuis les catch de handleSearch / handleLoadMyPlaylists /
 * handleImportPlaylist / handleGenerateGenrePlaylist, avec le nombre de
 * coups consécutifs déjà connus (quotaLocks[category]?.consecutiveHits) en
 * paramètre puisque cette fonction, hors du composant, n'a pas accès à
 * l'état React. Le "await" est volontairement absent côté appelant
 * (fire-and-forget) : un échec de l'écriture Supabase ne doit pas empêcher
 * d'afficher l'erreur Spotify elle-même à l'hôte.
 */
function recordSharedQuotaLockIfNeeded(
  category: "search" | "playlists",
  error: unknown,
  previousHits: number
): void {
  if (!(error instanceof spotify.SpotifySearchError) || error.reason !== "QUOTA_EXCEEDED") return;
  const durationMs = computeSharedQuotaBackoffMs(previousHits);
  setSpotifyQuotaLock(category, new Date(Date.now() + durationMs).toISOString(), previousHits + 1).catch(
    () => {
      // Pas grave : le coupe-circuit local (packages/api-clients/src/spotify.ts)
      // continue de protéger cette session même si l'écriture partagée échoue.
    }
  );
}

/**
 * Écran hôte / "TV" — voir les commentaires dans supabase/migrations et dans
 * lib/rooms.ts pour le détail du modèle temps réel. Rappel : cette page
 * n'affiche jamais de réponse privée, seulement l'état commun de la partie
 * (joueurs connectés, manche en cours, qui a buzzé).
 *
 * Nécessite maintenant un compte Spotify Premium connecté sur cet onglet
 * (voir lib/useSpotifyPlayer.ts) pour choisir et lancer un vrai morceau à
 * chaque manche — d'où le garde-fou 127.0.0.1 (cf. useForceLoopbackHost).
 *
 * La file d'attente (queue) est gardée en mémoire côté client et mise en
 * cache dans sessionStorage (pas persistée dans la table `playlists`, qui
 * existe dans le schéma mais reste verrouillée par RLS pour l'instant) :
 * ça évite d'ouvrir une nouvelle policy RLS pour ce premier incrément, tout
 * en survivant à un refresh (voir le bloc sessionStorage plus haut). Un
 * refresh/retour en arrière retrouve donc la même room, le même mode et la
 * même file d'attente — un vrai redémarrage passe par le bouton "Nouvelle
 * partie". À revoir si on veut un jour pouvoir réutiliser une playlist
 * entre plusieurs parties distinctes (pas juste survivre à un refresh de
 * la même partie).
 *
 * Deux modes de jeu (choisis une fois en tout début de partie, voir
 * hostMode) : "gamemaster" (comportement historique, l'hôte voit toute la
 * playlist à l'avance car il/elle ne joue pas) et "player" (l'hôte joue
 * aussi : titres/artistes sont masqués dans la file d'attente et l'aperçu
 * de la prochaine manche, révélés uniquement une fois qu'un joueur a
 * buzzé — moment où il faut de toute façon les afficher pour juger la
 * réponse).
 */
export default function HostScreen() {
  useForceLoopbackHost();

  // Skin de buzzer équipé (voir usePlayerCosmetics, migration 0022) : pour
  // l'hôte qui joue aussi (voir HostBuzzerView plus haut) — même logique
  // que côté /play (BuzzerView), un hôte non connecté à un compte joueur
  // garde le rendu par défaut (Sage), inchangé.
  const { account: hostPlayerAccount } = usePlayerAccount();
  const { equippedKey: hostEquippedKey } = usePlayerCosmetics(hostPlayerAccount?.id ?? "");
  const hostEquippedCosmetic =
    COSMETIC_BY_KEY[hostPlayerAccount ? hostEquippedKey : DEFAULT_COSMETIC_KEY] ?? COSMETIC_BY_KEY[DEFAULT_COSMETIC_KEY];

  const [room, setRoom] = useState<Room | null>(null);
  // Passe à true une fois qu'on sait si on a repris une partie existante
  // (sessionStorage + vérif Supabase) ou créé une nouvelle room à zéro.
  // Tant que ce n'est pas fait, on n'écrit rien dans sessionStorage — sinon
  // les valeurs par défaut (queue vide, etc.) du tout premier rendu
  // écraseraient une partie sauvegardée avant même d'avoir eu la chance de
  // la relire.
  const [hydrated, setHydrated] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [roundHistory, setRoundHistory] = useState<Round[]>([]);
  const [roundAttempts, setRoundAttempts] = useState<RoundAttempt[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<spotify.SpotifyTrack[]>([]);
  // Les 3 méthodes d'ajout de morceaux (recherche / import Spotify /
  // génération par genre) partagent le même panneau plutôt que d'être
  // empilées verticalement : ça libère la place pour garder la file
  // d'attente visible en permanence à côté (voir le layout deux colonnes
  // plus bas). Chaque onglet a sa propre couleur d'identité (sauge / bleu
  // "info" / ambre) reprise du mockup validé.
  const [addMethodTab, setAddMethodTab] = useState<"search" | "import" | "genre">("search");
  const [hostMode, setHostMode] = useState<HostMode | null>(null);
  // Voir le commentaire sur HOST_PLAYER_ID_STORAGE_KEY plus haut.
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null);
  const [hostJoinSkipped, setHostJoinSkipped] = useState(false);
  const [hostView, setHostView] = useState<"admin" | "buzzer">("admin");
  const [joinHostFormOpen, setJoinHostFormOpen] = useState(false);
  const [hostNameDraft, setHostNameDraft] = useState("Hôte");
  const [joiningAsHost, setJoiningAsHost] = useState(false);
  const [sendingHostBuzz, setSendingHostBuzz] = useState(false);
  // Clé du réglage bonus/malus en cours d'écriture (voir
  // handleToggleBonusMalusSetting) — juste pour désactiver brièvement le
  // toggle correspondant et éviter un double-clic pendant l'aller-retour
  // réseau, pas un vrai état de chargement bloquant.
  const [savingBonusMalusSetting, setSavingBonusMalusSetting] = useState<string | null>(null);
  // Garde anti double-clic sur "Révéler la réponse" (voir handleReveal) :
  // sans ça, un double-clic (ou un simple clic répété par impatience sur
  // une connexion lente) envoie deux appels reveal_round pour la même
  // manche — le premier réussit (buzzed -> revealed), le second échoue
  // puisque le statut n'est déjà plus "buzzed", ce qui remontait le
  // message d'erreur brut "Manche introuvable ou pas encore buzzée." en
  // plein écran (voir le rendu `if (error)` plus bas) alors que la manche
  // avait en réalité déjà été révélée avec succès par le premier clic.
  const [revealing, setRevealing] = useState(false);
  // null = pas de score cible, la partie dure jusqu'à la fin de la
  // playlist (comportement historique). Sinon, la partie se termine dès
  // qu'un joueur atteint (ou dépasse) ce score, même si la playlist n'est
  // pas épuisée (voir `targetScoreReached` plus bas) — pensé pour pouvoir
  // charger de grosses playlists (100+ morceaux) sans que la partie soit
  // interminable.
  const [targetScore, setTargetScore] = useState<number | null>(null);
  // null = pas de limite de manches, la partie dure jusqu'à la fin de la
  // playlist (ou jusqu'au score cible, voir ci-dessus) — voir
  // MAX_ROUNDS_STORAGE_KEY.
  const [maxRounds, setMaxRounds] = useState<number | null>(null);
  const [spotifyOAuthError, setSpotifyOAuthError] = useState<string | null>(null);
  // true entre le clic sur "manche suivante" et la confirmation (via
  // Supabase Realtime) que la nouvelle manche est bien passée en "playing".
  // Évite un flash visuel : queueIndex avance dès que launchRound résout,
  // mais round (mis à jour par un canal Realtime séparé, donc pas
  // synchronisé) peut arriver un peu après, ce qui recalculait brièvement
  // l'aperçu avec l'index déjà incrémenté (donc le morceau suivant du
  // suivant) avant que l'écran ne bascule sur "manche en cours".
  const [launchingRound, setLaunchingRound] = useState(false);
  // Compte à rebours affiché pendant une manche "playing", recalculé à
  // partir de round.started_at (pas d'un simple compteur local) pour rester
  // exact même si l'onglet hôte est rafraîchi en plein milieu d'une manche.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  // Id de la dernière manche "timeout" (personne n'a buzzé) déjà acquittée
  // par l'hôte via le bouton "Continuer" — tant que ce n'est pas fait, on
  // reste sur l'encart affichant la réponse non trouvée au lieu de sauter
  // directement à l'écran de la manche suivante.
  const [acknowledgedTimeoutRoundId, setAcknowledgedTimeoutRoundId] = useState<string | null>(null);

  // File d'attente : les morceaux d'indice < queueIndex ont déjà été joués,
  // ceux à partir de queueIndex restent à venir.
  const [queue, setQueue] = useState<spotify.SpotifyTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [buildingPlaylist, setBuildingPlaylist] = useState(true);
  const [myPlaylists, setMyPlaylists] = useState<spotify.SpotifyPlaylistSummary[] | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [importingPlaylistId, setImportingPlaylistId] = useState<string | null>(null);

  // Génération de playlist par genre + époque + nombre : à partir de
  // listes d'artistes curées à la main (voir @blindtest/game-logic,
  // genrePresets.ts) plutôt que du filtre genre: de Spotify — trop
  // imprécis pour des catégories larges (variétés, disco...) et sans tri
  // par popularité possible depuis février 2026 (voir commentaire sur
  // searchArtistTracks dans packages/api-clients/src/spotify.ts). L'hôte
  // ne voit jamais la liste de morceaux se construire au fur et à mesure
  // (contrairement à une recherche manuelle ou un import direct) : il
  // choisit juste 3 paramètres et la playlist apparaît déjà faite, ce qui
  // garde la surprise même pour lui s'il joue aussi.
  const [genreChoice, setGenreChoice] = useState<string>(ALL_GENRES_KEY);
  const [eraChoice, setEraChoice] = useState(0); // index dans ERA_OPTIONS
  const [genreCount, setGenreCount] = useState(15);
  const [generatingGenrePlaylist, setGeneratingGenrePlaylist] = useState(false);
  const [genrePlaylistTried, setGenrePlaylistTried] = useState(0);
  const [genrePlaylistResult, setGenrePlaylistResult] = useState<{
    foundCount: number;
    requestedCount: number;
    error?: string;
  } | null>(null);
  // Verrou PARTAGÉ (Supabase, voir spotifyQuotaLock.ts) plutôt qu'un simple
  // état local : un coupe-circuit purement local (localStorage) ne protège
  // que CE navigateur — si l'hôte ouvre /host depuis un autre appareil ou
  // après avoir vidé son cache pendant que le quota Spotify est encore
  // dépassé côté serveur, ce nouveau contexte n'a aucune trace du blocage et
  // retente un appel qui échoue à nouveau. quotaLocks est synchronisé en
  // direct via Realtime (voir l'effet plus bas) ; quotaNowTick force un
  // recalcul du temps restant toutes les 30s même sans nouvel événement.
  const [quotaLocks, setQuotaLocks] = useState<SpotifyQuotaLocks>({});
  const [quotaNowTick, setQuotaNowTick] = useState(() => Date.now());
  const searchQuotaCooldownSeconds = secondsUntil(quotaLocks.search?.blockedUntil, quotaNowTick);
  const playlistsQuotaCooldownSeconds = secondsUntil(quotaLocks.playlists?.blockedUntil, quotaNowTick);

  const spotifyPlayer = useSpotifyPlayer();
  // Cache des recherches par artiste + époque, gardé pour toute la durée de
  // la session hôte (pas juste un appel à handleGenerateGenrePlaylist) : la
  // limite de requêtes Spotify (voir searchTracks/SpotifySearchError dans
  // @blindtest/api-clients) est un quota Developer Mode assez strict, et
  // pendant une soirée l'hôte régénère souvent plusieurs fois avec les mêmes
  // paramètres (ou des paramètres proches) pour piocher un mix différent —
  // sans cache, chaque clic re-interroge Spotify pour les mêmes artistes.
  // Clé : "artiste::plage d'années" (ou "artiste::all" si aucune époque).
  const artistSearchCache = useRef<Map<string, spotify.SpotifyTrack[]>>(new Map());
  const pausedForRoundId = useRef<string | null>(null);
  const timedOutRoundId = useRef<string | null>(null);
  const autoRevealedRoundKey = useRef<string | null>(null);
  // Index (dans upcomingQueue) du morceau en cours de glisser-déposer —
  // simple ref plutôt que du state, la valeur n'a besoin d'être lue qu'au
  // moment du drop, pas de re-render nécessaire pendant le glissé.
  const dragIndexRef = useRef<number | null>(null);
  // Évite d'appeler finishRoom() en boucle tant que l'écran "Playlist
  // terminée !" reste affiché (queueExhausted ne change pas entre deux
  // rendus) — remis à false dès que la partie n'est plus en état épuisé
  // (nouvelle partie, ou reprise via "+ Ajouter d'autres morceaux").
  const finishedRoomRef = useRef(false);

  // Recharge le cache de recherches par artiste (voir artistSearchCache
  // ci-dessus) depuis localStorage au montage : survit à un F5, ce qui
  // compte quand le quota Spotify (compté par compte développeur, pas par
  // app, depuis la mise à jour de juillet 2026) ne se débloque pas vite —
  // pas la peine de re-payer en quota pour des artistes déjà interrogés lors
  // d'un chargement précédent de la page.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ARTIST_SEARCH_CACHE_STORAGE_KEY);
      if (raw) {
        const entries = JSON.parse(raw) as [string, spotify.SpotifyTrack[]][];
        artistSearchCache.current = new Map(entries);
      }
    } catch {
      // Cache corrompu ou localStorage indisponible : on repart d'un cache
      // vide, ce n'est qu'une optimisation, pas une dépendance bloquante.
    }
  }, []);

  // Charge le verrou partagé au montage, puis reste synchronisé en direct
  // via Realtime (voir spotifyQuotaLock.ts) : si UNE AUTRE session (autre
  // navigateur, autre appareil, ou celle-ci après un F5) pose ou lève le
  // verrou, cette page le sait quasi instantanément sans avoir besoin de
  // retenter un appel Spotify pour "découvrir" le blocage. Le ticker de 30s
  // ne resynchronise rien depuis Supabase : il force juste un recalcul de
  // secondsUntil() pour faire décompter l'affichage et réactiver les
  // boutons une fois le délai écoulé.
  useEffect(() => {
    let cancelled = false;
    getSpotifyQuotaLocks().then((locks) => {
      if (!cancelled) setQuotaLocks(locks);
    });
    const unsubscribe = subscribeToSpotifyQuotaLocks((locks) => {
      if (!cancelled) setQuotaLocks(locks);
    });
    const tick = setInterval(() => setQuotaNowTick(Date.now()), 30_000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const startFresh = async () => {
      clearStoredGameState();
      try {
        const r = await createRoom();
        if (cancelled) return;
        writeStoredJSON(ROOM_STORAGE_KEY, { id: r.id, code: r.code });
        setRoom(r);
        setHostMode(null);
        setQueue([]);
        setQueueIndex(0);
        setBuildingPlaylist(true);
        setHostPlayerId(null);
        setHostJoinSkipped(false);
        setHostView("admin");
        setHydrated(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erreur de connexion à Supabase");
      }
    };

    (async () => {
      const stored = readStoredJSON<{ id: string; code: string } | null>(ROOM_STORAGE_KEY, null);
      if (!stored) {
        await startFresh();
        return;
      }
      // On vérifie que la room existe toujours côté Supabase avant de la
      // réutiliser : sessionStorage peut très bien pointer vers une partie
      // qui n'existe plus (base réinitialisée, etc.).
      const existing = await getRoomById(stored.id);
      if (cancelled) return;
      if (!existing) {
        await startFresh();
        return;
      }
      setRoom(existing);
      setHostMode(readStoredJSON(MODE_STORAGE_KEY, null));
      setHostPlayerId(readStoredJSON(HOST_PLAYER_ID_STORAGE_KEY, null));
      setHostJoinSkipped(readStoredJSON(HOST_JOIN_SKIPPED_STORAGE_KEY, false));
      setHostView(readStoredJSON(HOST_VIEW_STORAGE_KEY, "admin"));
      setTargetScore(readStoredJSON(TARGET_SCORE_STORAGE_KEY, null));
      setMaxRounds(readStoredJSON(MAX_ROUNDS_STORAGE_KEY, null));
      setQueue(readStoredJSON(QUEUE_STORAGE_KEY, []));
      setQueueIndex(readStoredJSON(QUEUE_INDEX_STORAGE_KEY, 0));
      setBuildingPlaylist(readStoredJSON(BUILDING_STORAGE_KEY, true));
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persiste la file d'attente / le mode de jeu à chaque changement, une
  // fois qu'on sait qu'on ne va pas écraser une partie sauvegardée en cours
  // de relecture (voir le commentaire sur `hydrated` plus haut).
  useEffect(() => {
    if (!hydrated) return;
    writeStoredJSON(MODE_STORAGE_KEY, hostMode);
    writeStoredJSON(TARGET_SCORE_STORAGE_KEY, targetScore);
    writeStoredJSON(MAX_ROUNDS_STORAGE_KEY, maxRounds);
    writeStoredJSON(QUEUE_STORAGE_KEY, queue);
    writeStoredJSON(QUEUE_INDEX_STORAGE_KEY, queueIndex);
    writeStoredJSON(BUILDING_STORAGE_KEY, buildingPlaylist);
    writeStoredJSON(HOST_PLAYER_ID_STORAGE_KEY, hostPlayerId);
    writeStoredJSON(HOST_JOIN_SKIPPED_STORAGE_KEY, hostJoinSkipped);
    writeStoredJSON(HOST_VIEW_STORAGE_KEY, hostView);
  }, [
    hydrated,
    hostMode,
    targetScore,
    maxRounds,
    queue,
    queueIndex,
    buildingPlaylist,
    hostPlayerId,
    hostJoinSkipped,
    hostView,
  ]);

  useEffect(() => {
    if (!room) return;
    const unsubPlayers = subscribeToPlayers(room.id, setPlayers);
    const unsubRounds = subscribeToRounds(room.id, setRound);
    const unsubHistory = subscribeToRoundHistory(room.id, setRoundHistory);
    const unsubAttempts = subscribeToRoundAttempts(room.id, setRoundAttempts);
    return () => {
      unsubPlayers();
      unsubRounds();
      unsubHistory();
      unsubAttempts();
    };
  }, [room]);

  // Bascule automatique vers la vue admin dès qu'un buzz survient (le
  // sien ou celui d'un autre joueur) — pour l'hôte qui joue aussi (voir
  // hostPlayerId) : il doit reprendre la main pour révéler la réponse et
  // juger, sans avoir à penser à rebasculer lui-même. Sens inverse (admin
  // -> buzzer au lancement d'une manche) géré dans handlePlayNextInQueue.
  useEffect(() => {
    if (hostPlayerId && round?.status === "buzzed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHostView("admin");
    }
  }, [hostPlayerId, round?.status]);

  // Récupère les erreurs/succès renvoyés par /api/spotify/callback dans
  // l'URL (lecture ponctuelle au montage), puis nettoie l'URL pour ne pas
  // rejouer ça sur un rechargement de page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (err) setSpotifyOAuthError(`Erreur Spotify : ${err}`);
    if (err || params.get("connected")) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Coupe le son dès qu'un joueur buzze — une seule fois par "stint" de
  // lecture (le ref évite de rappeler pausePlayback à chaque re-render tant
  // que la manche reste au statut "buzzed"). Clé composite round.id +
  // started_at plutôt que round.id seul : en mode "Maître du jeu", une
  // manche reprise après une réponse partielle GARDE le même id (c'est la
  // même manche) mais started_at est réinitialisé à la reprise (migration
  // 0009) — sans ça, le 2e buzz (et les suivants) sur la même manche ne
  // coupait plus le son, round.id étant déjà égal à la valeur mémorisée par
  // le tout premier buzz.
  useEffect(() => {
    const pauseKey = round?.id && round.started_at ? `${round.id}:${round.started_at}` : null;
    if (
      round?.status === "buzzed" &&
      pauseKey &&
      pauseKey !== pausedForRoundId.current &&
      spotifyPlayer.deviceId &&
      spotifyPlayer.accessTokenRef.current
    ) {
      pausedForRoundId.current = pauseKey;
      spotify.pausePlayback(spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef.current).catch(() => {
        // Pas grave si la pause échoue (ex: token expiré entre-temps) : le
        // morceau continue mais le buzz est déjà résolu côté base.
      });
    }
  }, [round, spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef]);

  // En mode "Maître du jeu", le titre/artiste restent affichés en
  // permanence (voir plus bas) : le clic manuel "Révéler la réponse"
  // n'apporte donc rien, c'est un clic en trop pour l'hôte qui voit déjà
  // le morceau. On révèle automatiquement dès qu'un buzz est enregistré.
  // En mode "Tout le monde participe" en revanche, l'hôte peut être en
  // train de jouer lui-même : il ne doit pas voir la réponse avant d'avoir
  // volontairement cliqué (voir handleReveal / le bouton dans le JSX),
  // donc pas d'auto-révélation dans ce mode.
  //
  // Même clé composite round.id + started_at que pour la coupure du son
  // ci-dessus : une manche reprise après une réponse partielle garde le
  // même id mais started_at change à chaque reprise, donc chaque "stint"
  // (chaque nouveau buzz) redéclenche bien l'auto-révélation.
  useEffect(() => {
    const revealKey = round?.id && round.started_at ? `${round.id}:${round.started_at}` : null;
    if (
      round?.status === "buzzed" &&
      hostMode !== "player" &&
      revealKey &&
      revealKey !== autoRevealedRoundKey.current
    ) {
      autoRevealedRoundKey.current = revealKey;
      revealRound(round.id).catch((e: any) => {
        setError(e?.message ?? "Impossible de révéler la réponse.");
      });
    }
  }, [round, hostMode]);

  // Marque la room comme "finished" dès que la file d'attente est épuisée
  // OU dès qu'un joueur a atteint le score cible (voir targetScore) —
  // c'est le seul signal dont dispose /play pour savoir que la partie est
  // terminée, puisque `rounds` ne change plus une fois la dernière manche
  // jouée. Le ref évite de renvoyer la même mise à jour à chaque render tant
  // que l'écran de fin de partie reste affiché, et se réinitialise dès que
  // la partie n'est plus dans cet état (nouvelle partie, ou reprise).
  useEffect(() => {
    if (!room) return;
    const canStart = !round || round.status === "scored";
    const exhausted = canStart && queueIndex > 0 && queue.slice(queueIndex).length === 0;
    const scoreTargetHit =
      canStart &&
      queueIndex > 0 &&
      targetScore !== null &&
      players.some((p) => p.score >= targetScore);
    const roundsLimitHit = canStart && maxRounds !== null && queueIndex >= maxRounds && queueIndex > 0;
    const over = exhausted || scoreTargetHit || roundsLimitHit;
    if (over && !finishedRoomRef.current) {
      finishedRoomRef.current = true;
      finishRoom(room.id).catch(() => {});
      // Badges/XP (voir migration 0021) : recalculés à chaque vraie fin de
      // partie, y compris si l'hôte reprend puis termine à nouveau (voir le
      // commentaire d'award_game_rewards — idempotent par construction,
      // sauf pour le score final qui n'est ajouté qu'une fois grâce à
      // rooms.rewards_awarded_at). Fire-and-forget : ne doit jamais bloquer
      // ni retarder l'écran de fin de partie.
      awardGameRewards(room.id).catch(() => {});
    } else if (!over && finishedRoomRef.current) {
      finishedRoomRef.current = false;
    }
  }, [room, round, queueIndex, queue, targetScore, maxRounds, players]);

  // Timer visuel de la manche en cours : calculé à partir de round.started_at
  // (horodatage serveur) plutôt qu'un simple compteur local, pour rester
  // exact même après un refresh de la page en plein milieu d'une manche. À
  // 0, coupe le son (même geste que sur un buzz) et clôture la manche sans
  // gagnant via timeoutRound — no-op côté serveur si un joueur avait buzzé
  // entre-temps (la RPC exige status = 'playing').
  useEffect(() => {
    if (round?.status !== "playing" || !round.started_at) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTimeLeft(null);
      return;
    }
    const startedAtMs = new Date(round.started_at).getTime();
    // elapsed_seconds capture le temps déjà réellement joué AVANT ce stint
    // (voir migration 0009) : sans ça, le temps passé à juger une réponse
    // partielle (musique coupée, round "buzzed"/"revealed") se décomptait
    // à tort du budget des 30s, donnant l'impression que le timer ne
    // s'arrêtait jamais au buzz.
    const elapsedBeforeStint = round.elapsed_seconds;
    const roundId = round.id;

    const tick = () => {
      const elapsedSeconds = elapsedBeforeStint + (Date.now() - startedAtMs) / 1000;
      const remaining = Math.max(0, Math.ceil(ROUND_DURATION_SECONDS - elapsedSeconds));
      setTimeLeft(remaining);

      if (remaining <= 0 && timedOutRoundId.current !== roundId) {
        timedOutRoundId.current = roundId;
        if (spotifyPlayer.deviceId && spotifyPlayer.accessTokenRef.current) {
          spotify.pausePlayback(spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef.current).catch(() => {
            // Pas grave si la pause échoue : la manche est clôturée quand
            // même côté base, le morceau continuera juste un peu en fond.
          });
        }
        // Ce timer côté navigateur et un buzz réel côté serveur peuvent se
        // produire à quelques millisecondes d'écart : si un joueur buzze
        // juste avant l'expiration, la RPC timeout_round (qui exige
        // status='playing') ne trouve plus rien à clôturer et lève une
        // erreur — un vrai no-op côté résultat de la manche (le buzz a
        // déjà pris le relais), mais qui remontait jusqu'ici comme un
        // message rouge trompeur côté hôte tant que la page n'était pas
        // rechargée. Volontairement silencieux : rien n'est réellement en
        // échec dans ce cas précis.
        timeoutRound(roundId).catch(() => {});
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    round?.id,
    round?.status,
    round?.started_at,
    round?.elapsed_seconds,
    spotifyPlayer.deviceId,
    spotifyPlayer.accessTokenRef,
  ]);

  const handleSearch = async () => {
    if (!spotifyPlayer.accessTokenRef.current || searchQuotaCooldownSeconds > 0) return;
    try {
      const accessToken = await getFreshSpotifyAccessToken(spotifyPlayer.accessTokenRef.current);
      if (!accessToken) {
        setError("Connexion Spotify perdue — recharge la page pour te reconnecter, puis réessaie.");
        return;
      }
      const tracks = await spotify.searchTracks(query, accessToken);
      setResults(tracks);
      if (quotaLocks.search) clearSpotifyQuotaLock("search").catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? "Recherche Spotify échouée.");
      recordSharedQuotaLockIfNeeded("search", e, quotaLocks.search?.consecutiveHits ?? 0);
    }
  };

  const handleAddToQueue = (track: spotify.SpotifyTrack) => {
    setQueue((q) => [...q, track]);
  };

  const handleRemoveFromQueue = (upcomingIndex: number) => {
    const realIndex = queueIndex + upcomingIndex;
    setQueue((q) => q.filter((_, i) => i !== realIndex));
  };

  // Ne retire que la portion "à venir" (à partir de queueIndex) : les
  // morceaux déjà joués avant queueIndex restent en historique, seule la
  // file d'attente encore à jouer est vidée.
  const handleClearQueue = () => {
    setQueue((q) => q.slice(0, queueIndex));
  };

  // Réordonnancement par glisser-déposer, restreint à la portion "à venir"
  // de la file (queueIndex et au-delà) : les morceaux déjà joués ne doivent
  // jamais bouger.
  const handleDragStart = (upcomingIndex: number) => () => {
    dragIndexRef.current = upcomingIndex;
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
  };

  const handleDrop = (targetUpcomingIndex: number) => (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    dragIndexRef.current = null;
    if (fromIndex === null || fromIndex === targetUpcomingIndex) return;

    setQueue((q) => {
      const played = q.slice(0, queueIndex);
      const upcoming = q.slice(queueIndex);
      const reordered = [...upcoming];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(targetUpcomingIndex, 0, moved);
      return [...played, ...reordered];
    });
  };

  const handleLoadMyPlaylists = async () => {
    if (!spotifyPlayer.accessTokenRef.current || playlistsQuotaCooldownSeconds > 0) return;
    setLoadingPlaylists(true);
    try {
      const accessToken = await getFreshSpotifyAccessToken(spotifyPlayer.accessTokenRef.current);
      if (!accessToken) {
        setError("Connexion Spotify perdue — recharge la page pour te reconnecter, puis réessaie.");
        setLoadingPlaylists(false);
        return;
      }
      const playlists = await spotify.listUserPlaylists(accessToken);
      // Tri alphabétique (insensible à la casse/accents) pour retrouver une
      // playlist facilement, plutôt que de dépendre de l'ordre renvoyé par
      // l'API Spotify (généralement : la plus récemment modifiée en premier).
      const sorted = [...playlists].sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
      );
      setMyPlaylists(sorted);
      if (quotaLocks.playlists) clearSpotifyQuotaLock("playlists").catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger tes playlists Spotify.");
      recordSharedQuotaLockIfNeeded("playlists", e, quotaLocks.playlists?.consecutiveHits ?? 0);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleImportPlaylist = async (playlistId: string) => {
    if (!spotifyPlayer.accessTokenRef.current || playlistsQuotaCooldownSeconds > 0) return;
    setImportingPlaylistId(playlistId);
    try {
      const accessToken = await getFreshSpotifyAccessToken(spotifyPlayer.accessTokenRef.current);
      if (!accessToken) {
        setError("Connexion Spotify perdue — recharge la page pour te reconnecter, puis réessaie.");
        setImportingPlaylistId(null);
        return;
      }
      const tracks = await spotify.getPlaylistTracks(playlistId, accessToken);
      // Mélangé pour qu'un hôte qui joue aussi (mode "player") ne puisse pas
      // déduire l'ordre des prochaines manches à partir de sa propre
      // playlist.
      setQueue((q) => [...q, ...shuffle(tracks)]);
      // Badge "Curateur" (voir migration 0021) : fire-and-forget, ne doit
      // jamais faire échouer l'import lui-même.
      if (room) recordPlaylistImport(room.id, playlistId).catch(() => {});
      if (quotaLocks.playlists) clearSpotifyQuotaLock("playlists").catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? "Impossible d’importer cette playlist.");
      recordSharedQuotaLockIfNeeded("playlists", e, quotaLocks.playlists?.consecutiveHits ?? 0);
    } finally {
      setImportingPlaylistId(null);
    }
  };

  /**
   * Génère une playlist "à l'aveugle" à partir d'un genre + une époque +
   * un nombre de morceaux souhaité — voir le commentaire sur genreChoice
   * plus haut pour le pourquoi de cette approche (artistes curés plutôt
   * que le filtre genre: de Spotify). Pioche des artistes au hasard dans
   * le pool du genre choisi, récupère jusqu'à 3 de leurs morceaux par
   * artiste (filtrés par année si une époque est choisie), puis retient
   * `genreCount` morceaux au hasard parmi tout ce qui a été trouvé —
   * s'arrête dès qu'on a assez d'ARTISTES DIFFÉRENTS plutôt que d'interroger
   * tout le pool, pour ne pas multiplier les appels Spotify inutilement.
   *
   * La sélection finale se fait en 2 passes plutôt qu'un tirage uniforme sur
   * tous les morceaux candidats : chaque artiste peut fournir jusqu'à 3
   * morceaux candidats, donc un tirage uniforme pioche mécaniquement le même
   * artiste 2-3 fois assez souvent (surtout avec peu d'artistes/morceaux
   * demandés) — statistiquement logique, mais bizarre à l'usage pour un
   * blind-test. On priorise donc 1 morceau par artiste, et on ne complète
   * avec des doublons d'artiste qu'en dernier recours si le pool ne fournit
   * pas assez d'artistes distincts pour atteindre le nombre demandé.
   */
  const handleGenerateGenrePlaylist = async () => {
    if (!spotifyPlayer.accessTokenRef.current || searchQuotaCooldownSeconds > 0) return;
    const yearRange = ERA_OPTIONS[eraChoice].range;
    const pool = shuffle(getArtistPool(genreChoice));
    const wanted = Math.max(1, genreCount);

    setGeneratingGenrePlaylist(true);
    setGenrePlaylistResult(null);
    setGenrePlaylistTried(0);

    // Le token en mémoire (accessTokenRef) date du chargement de la page et
    // peut avoir expiré depuis (durée de vie ~1h côté Spotify) : le Web
    // Playback SDK ne le rafraîchit que quand LUI en a besoin pour la
    // lecture, pas pour ces appels à l'API Search faits en arrière-plan. Sans
    // ce refresh explicite, une session hôte ouverte depuis un moment fait
    // échouer TOUTES les recherches (401) en silence (voir le catch
    // ci-dessous) — ça ressemble à "il ne trouve plus rien", même en
    // recréant une partie, puisque recréer une partie ne touche jamais à la
    // session Spotify du navigateur. /api/spotify/token gère déjà le refresh
    // via le refresh_token cookie ; on l'appelle ici pour être sûr d'avoir un
    // token valide avant de lancer la série de recherches.
    let accessToken = spotifyPlayer.accessTokenRef.current;
    try {
      const tokenRes = await fetch("/api/spotify/token");
      const tokenData = await tokenRes.json();
      if (!tokenData.connected) {
        setGenrePlaylistResult({
          foundCount: 0,
          requestedCount: wanted,
          error: "Connexion Spotify perdue — recharge la page pour te reconnecter, puis réessaie.",
        });
        setGeneratingGenrePlaylist(false);
        return;
      }
      // On ne réécrit pas spotifyPlayer.accessTokenRef.current ici : c'est
      // une valeur issue du hook useSpotifyPlayer, et ESLint (règle
      // react-hooks/immutability, react-compiler) interdit de la muter
      // depuis l'extérieur du hook. On garde le token frais dans une
      // variable locale, ce qui suffit pour toute la durée de cette
      // génération (quelques dizaines de secondes max).
      accessToken = tokenData.accessToken;
    } catch {
      // Si le refresh échoue (réseau...), on retente avec le token qu'on
      // avait déjà — au pire les recherches échoueront individuellement
      // plus bas et seront comptées dans errorCount.
    }

    const candidates: { track: spotify.SpotifyTrack; artistName: string }[] = [];
    const seenTrackIds = new Set<string>();
    const contributingArtists = new Set<string>();
    let errorCount = 0;
    let sawRateLimit = false;
    let sawAuthError = false;
    let sawQuotaExceeded = false;
    let retryAfterSeconds: number | null = null;
    const eraCacheKey = yearRange ? `${yearRange.from}-${yearRange.to}` : "all";

    for (const artistName of pool) {
      // Marge x2 : laisse de la place au tirage aléatoire final sans être
      // bloqué par des morceaux déjà vus ou des artistes sans résultat pour
      // l'année choisie.
      if (contributingArtists.size >= wanted * 2) break;
      // Dès qu'on a tapé un 429, tous les artistes suivants échoueront aussi
      // (même fenêtre de quota) : on arrête plutôt que de brûler encore plus
      // de quota pour rien et allonger l'attente avant que ça se débloque.
      if (sawRateLimit) break;

      const cacheKey = `${artistName}::${eraCacheKey}`;
      const cached = artistSearchCache.current.get(cacheKey);

      if (cached) {
        // Déjà interrogé pendant cette session hôte (une régénération
        // précédente avec le même genre/époque, par exemple) : pas besoin de
        // re-solliciter Spotify, ça ne consomme aucun quota.
        for (const track of shuffle(cached).slice(0, 3)) {
          if (!seenTrackIds.has(track.sourceTrackId)) {
            seenTrackIds.add(track.sourceTrackId);
            candidates.push({ track, artistName });
            contributingArtists.add(artistName);
          }
        }
        setGenrePlaylistTried((n) => n + 1);
        continue;
      }

      try {
        const tracks = await spotify.searchArtistTracks(artistName, yearRange, accessToken);
        artistSearchCache.current.set(cacheKey, tracks);
        for (const track of shuffle(tracks).slice(0, 3)) {
          if (!seenTrackIds.has(track.sourceTrackId)) {
            seenTrackIds.add(track.sourceTrackId);
            candidates.push({ track, artistName });
            contributingArtists.add(artistName);
          }
        }
      } catch (e) {
        // On continue avec l'artiste suivant, mais on compte l'échec pour
        // pouvoir distinguer "aucun résultat pertinent" d'une vraie panne
        // dans le message final. SpotifySearchError porte le code HTTP et,
        // pour un 429, le Retry-After renvoyé par Spotify — on ne le
        // met PAS en cache (échec transitoire, pas un "pas de morceaux").
        errorCount += 1;
        if (e instanceof spotify.SpotifySearchError) {
          if (e.status === 429) {
            sawRateLimit = true;
            retryAfterSeconds = e.retryAfterSeconds;
            if (e.reason === "QUOTA_EXCEEDED") sawQuotaExceeded = true;
          }
          if (e.status === 401) sawAuthError = true;
        }
      }
      setGenrePlaylistTried((n) => n + 1);
      // Petite pause entre deux recherches (seulement pour les vrais appels
      // réseau, pas les hits de cache ci-dessus) : une génération enchaîne
      // des dizaines de requêtes Spotify à la suite, et les envoyer en
      // rafale sans aucune pause est ce qui déclenche le 429 en premier
      // lieu, même en usage normal.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    // Sauvegarde le cache mis à jour (nouveaux artistes interrogés pendant
    // cette génération) en une seule écriture localStorage groupée, plutôt
    // qu'à chaque itération de la boucle ci-dessus — inutile d'écrire sur
    // disque des dizaines de fois pour une seule génération.
    try {
      window.localStorage.setItem(
        ARTIST_SEARCH_CACHE_STORAGE_KEY,
        JSON.stringify(Array.from(artistSearchCache.current.entries()))
      );
    } catch {
      // Quota localStorage dépassé ou navigateur en mode privé : tant pis,
      // le cache reste utile pour le reste de cette session en mémoire.
    }

    const shuffledCandidates = shuffle(candidates);
    const picked: spotify.SpotifyTrack[] = [];
    const pickedIds = new Set<string>();
    const usedArtists = new Set<string>();

    // Passe 1 : au plus 1 morceau par artiste.
    for (const c of shuffledCandidates) {
      if (picked.length >= wanted) break;
      if (usedArtists.has(c.artistName)) continue;
      usedArtists.add(c.artistName);
      pickedIds.add(c.track.sourceTrackId);
      picked.push(c.track);
    }
    // Passe 2 (dernier recours) : complète avec des doublons d'artiste si le
    // pool n'avait pas assez d'artistes distincts pour atteindre `wanted`.
    if (picked.length < wanted) {
      for (const c of shuffledCandidates) {
        if (picked.length >= wanted) break;
        if (pickedIds.has(c.track.sourceTrackId)) continue;
        pickedIds.add(c.track.sourceTrackId);
        picked.push(c.track);
      }
    }

    if (picked.length > 0) {
      setQueue((q) => [...q, ...picked]);
      // Badge "Éclectique" (voir migration 0021) : ALL_GENRES_KEY n'est pas
      // un genre précis, on ne l'enregistre volontairement pas ici.
      // Fire-and-forget, ne doit jamais faire échouer la génération.
      if (room && genreChoice !== ALL_GENRES_KEY) {
        recordGenreUsed(room.id, genreChoice).catch(() => {});
      }
    }
    let error: string | undefined;
    if (picked.length === 0 && errorCount > 0) {
      if (sawRateLimit) {
        error = retryAfterSeconds
          ? `Spotify a temporairement bloqué les recherches (trop de requêtes d'un coup) — réessaie dans ${retryAfterSeconds} secondes.`
          : "Spotify a temporairement bloqué les recherches (trop de requêtes d'un coup) — attends une minute avant de réessayer, ou demande moins de morceaux.";
      } else if (sawAuthError) {
        error = "Connexion Spotify expirée — recharge la page (F5) pour te reconnecter, puis réessaie.";
      } else {
        error = "Erreur de connexion à Spotify pendant la recherche — réessaie dans quelques instants.";
      }
    }
    setGenrePlaylistResult({ foundCount: picked.length, requestedCount: wanted, error });
    if (sawQuotaExceeded) {
      const durationMs = computeSharedQuotaBackoffMs(quotaLocks.search?.consecutiveHits ?? 0);
      setSpotifyQuotaLock(
        "search",
        new Date(Date.now() + durationMs).toISOString(),
        (quotaLocks.search?.consecutiveHits ?? 0) + 1
      ).catch(() => {
        // Pas grave : le coupe-circuit local continue de protéger cette session.
      });
    } else if (candidates.length > 0 && quotaLocks.search) {
      // Au moins une recherche a réussi pendant cette génération sans
      // qu'aucun 429 QUOTA_EXCEEDED ne soit survenu : le quota semble bien
      // débloqué, on efface le verrou plutôt que de laisser une escalade
      // passée traîner inutilement.
      clearSpotifyQuotaLock("search").catch(() => {});
    }
    setGeneratingGenrePlaylist(false);
  };

  const launchRound = async (track: spotify.SpotifyTrack) => {
    if (!room || !spotifyPlayer.deviceId || !spotifyPlayer.accessTokenRef.current) return;
    try {
      const accessToken = await getFreshSpotifyAccessToken(spotifyPlayer.accessTokenRef.current);
      if (!accessToken) {
        setError("Connexion Spotify perdue — recharge la page pour te reconnecter, puis réessaie.");
        return;
      }
      await spotify.playTrackOnHostDevice(track.sourceTrackId, spotifyPlayer.deviceId, accessToken);
      const newRound = await startRoundWithTrack(
        room.id,
        {
          sourceTrackId: track.sourceTrackId,
          title: track.title,
          artist: track.artist,
        },
        blindMode,
        room.bonus_joker_enabled
      );
      // Mise à jour immédiate depuis la ligne retournée par l'insert (déjà
      // au statut "playing"), sans attendre l'écho de Supabase Realtime :
      // ce canal est indépendant et peut arriver après que queueIndex ait
      // déjà avancé, ce qui recréait la fenêtre de flash qu'on cherche à
      // éliminer. Le realtime finira par renvoyer la même donnée un peu
      // plus tard (idempotent, sans effet visible).
      setRound(newRound);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de lancer la manche.");
    }
  };

  // Un seul bouton pour "démarrer la partie" ET "manche suivante" : les deux
  // font exactement la même chose (jouer le prochain morceau de la file),
  // seul le libellé affiché change selon qu'on a déjà commencé ou non.
  //
  // Le mélange aléatoire est fait UNE SEULE FOIS, au moment de l'import
  // d'une playlist Spotify (voir handleImportPlaylist ci-dessous) — pas ici.
  // Avant, la portion "à venir" de la file était re-mélangée à chaque fois
  // qu'on quittait l'écran de construction de playlist (buildingPlaylist
  // true -> false) : ça semblait pratique pour garantir un ordre aléatoire
  // même en combinant plusieurs imports/ajouts manuels, mais ça cassait
  // silencieusement tout réordonnancement manuel (glisser-déposer) fait par
  // l'hôte en cours de partie — rouvrir l'écran "+ Ajouter d'autres
  // morceaux" puis relancer une manche remélangeait TOUTE la suite de la
  // file, y compris les morceaux déjà remis dans un ordre précis à la main.
  // On avance donc simplement dans l'ordre actuel de `queue`, qui reflète
  // déjà fidèlement : l'ordre mélangé de chaque import de playlist, l'ordre
  // d'ajout pour la recherche manuelle, et tout réordonnancement manuel.
  const handlePlayNextInQueue = async () => {
    if (queueIndex >= queue.length) return;
    if (players.length === 0) return; // pas de joueur = personne ne peut buzzer, le jeu resterait bloqué
    if (launchingRound) return; // évite un double-clic pendant le lancement

    // Doit être appelé de façon synchrone, tout en haut du handler de clic
    // (avant le moindre await), pour rester dans la fenêtre de "user
    // gesture" qu'iOS Safari exige avant d'autoriser l'audio — voir le
    // commentaire dans useSpotifyPlayer.ts.
    spotifyPlayer.activateElement();
    setLaunchingRound(true);

    await launchRound(queue[queueIndex]);
    setQueueIndex((i) => i + 1);
    setBuildingPlaylist(false);
    setLaunchingRound(false);
    // Bascule automatique sur le buzzer dès qu'une manche démarre, pour
    // l'hôte qui joue aussi (voir hostJoinResolved/hostPlayerId) : couvre
    // à la fois "Démarrer la partie" (première manche) et "Manche
    // suivante" (mêmes bouton et handler, voir le commentaire plus haut).
    // Le sens inverse (buzz -> vue admin) est géré par un effet séparé plus
    // bas, sur round?.status.
    if (hostPlayerId) setHostView("buzzer");
  };

  const handleReveal = async () => {
    if (!round || revealing) return;
    setRevealing(true);
    try {
      await revealRound(round.id);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de révéler la réponse.");
    } finally {
      setRevealing(false);
    }
  };

  // "Tu joues aussi sur cet écran ?" (voir le bloc affiché juste après le
  // choix du mode de jeu, uniquement en blindMode, tant que
  // hostJoinResolved est false) : décision prise une seule fois avant le
  // lancement de la première manche. Crée la ligne `players` de l'hôte
  // (is_host=true, voir joinRoomAsHost) — hostView bascule ensuite tout
  // seul entre admin et buzzer au fil de la partie (voir
  // handlePlayNextInQueue pour le sens "manche suivante -> buzzer", et
  // l'effet plus bas pour le sens "quelqu'un buzze -> admin").
  // Si l'hôte a un compte joueur connecté (hostPlayerAccount, déjà utilisé
  // pour les cosmétiques du buzzer), on rattache directement account_id ici
  // — joinRoomAsHost l'accepte déjà en 3e argument (voir lib/rooms.ts),
  // seul cet appel ne le lui donnait pas jusqu'ici. Conséquence : un hôte
  // connecté qui joue voit désormais cette partie compter dans son XP/ses
  // badges, comme n'importe quel autre joueur connecté.
  const handleJoinAsHost = async (name: string) => {
    if (!room) return;
    setJoiningAsHost(true);
    try {
      const player = await joinRoomAsHost(room.id, name.trim() || "Hôte", hostPlayerAccount?.id ?? null);
      setHostPlayerId(player.id);
      setJoinHostFormOpen(false);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de te connecter comme joueur sur cet écran.");
    } finally {
      setJoiningAsHost(false);
    }
  };

  // Équivalent de onBuzz côté /play (voir play/page.tsx), mais pour le
  // buzz de l'hôte lui-même : round est déjà disponible via
  // subscribeToRounds (pas besoin d'une deuxième souscription dédiée).
  const handleHostBuzz = async () => {
    if (!round || !hostPlayerId) return;
    setSendingHostBuzz(true);
    try {
      await sendBuzz(round.id, hostPlayerId);
    } finally {
      setSendingHostBuzz(false);
    }
  };

  // Active/désactive un réglage bonus/malus (voir migration 0018) —
  // modifiable à tout moment, y compris en cours de partie, comme le score
  // cible et le nombre de morceaux max. Mise à jour optimiste (le toggle
  // bascule immédiatement) : ces colonnes n'ont aucun effet tant que la
  // manche en cours n'est pas terminée (voir resolve_round_attempt/
  // resolve_buzz_winner côté SQL, qui relisent la room à chaque appel), donc
  // pas besoin d'attendre la confirmation serveur pour refléter le choix.
  const handleToggleBonusMalusSetting = async (key: keyof BonusMalusSettings) => {
    if (!room) return;
    const nextValue = !room[key];
    setRoom({ ...room, [key]: nextValue });
    setSavingBonusMalusSetting(key);
    try {
      await updateRoomBonusMalusSettings(room.id, { [key]: nextValue });
    } catch (e: any) {
      // Rollback si l'écriture serveur échoue, pour ne pas laisser le
      // toggle mentir sur l'état réellement appliqué.
      setRoom((current) => (current ? { ...current, [key]: !nextValue } : current));
      setError(e?.message ?? "Impossible de mettre à jour ce réglage.");
    } finally {
      setSavingBonusMalusSetting(null);
    }
  };

  // Juge la tentative du joueur qui a buzzé (voir resolveRoundAttempt dans
  // lib/rooms.ts pour le détail des 4 issues possibles et de la reprise de
  // manche). forceEnd = true en mode "Tout le monde participe" (blindMode) :
  // un seul buzz suffit à clôturer la manche dans ce mode, quel que soit le
  // résultat — contrairement au mode "Maître du jeu" où seule la
  // complétude (titre ET artiste trouvés, cumulativement) clôture.
  const handleJudge = async (titleFound: boolean, artistFound: boolean) => {
    if (!round) return;
    try {
      await resolveRoundAttempt(round.id, titleFound, artistFound, blindMode);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de valider la manche.");
      return;
    }

    // La manche reprend (mode "Maître du jeu", pas encore complète) : il
    // faut explicitement relancer la lecture Spotify, qui reste en pause
    // depuis le buzz sinon (voir spotify.resumePlayback — reprend
    // exactement là où pausePlayback avait arrêté, pas depuis le début).
    // Calcul purement local, en miroir de la logique côté RPC
    // resolve_round_attempt : déterministe, donc fiable sans aller-retour
    // serveur supplémentaire.
    const newTitleFound = round.title_found || titleFound;
    const newArtistFound = round.artist_found || artistFound;
    const willResume = !blindMode && !(newTitleFound && newArtistFound);
    if (willResume && spotifyPlayer.deviceId && spotifyPlayer.accessTokenRef.current) {
      try {
        await spotify.resumePlayback(spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef.current);
      } catch (e: any) {
        setError(e?.message ?? "Impossible de relancer le morceau côté Spotify.");
      }
    }
  };

  // Seul moyen explicite de repartir sur une partie neuve (nouveau code,
  // scores remis à zéro) : un refresh ou un retour en arrière ne le fait
  // plus tout seul depuis qu'on reprend la partie stockée en
  // sessionStorage. Confirmation demandée car c'est irréversible pour tout
  // le monde (joueurs déjà connectés compris).
  // "Redémarrer une partie" (bouton sur l'écran de fin) : contrairement à
  // handleStartNewGame ci-dessous, la room et les joueurs connectés restent
  // les mêmes (pas de nouveau code, pas de reconnexion à faire) — seuls les
  // scores et l'historique des manches repartent à zéro. La file d'attente
  // n'est PAS réinitialisée : queueIndex reste où il était, donc les
  // morceaux déjà joués ne repasseront pas, et l'hôte peut toujours en
  // ajouter d'autres via le panneau playlist ensuite (setBuildingPlaylist).
  const handleRestartGame = async () => {
    if (!room) return;
    if (
      !window.confirm(
        "Redémarrer la partie ? Les scores et l'historique actuels seront remis à zéro (les joueurs restent connectés)."
      )
    ) {
      return;
    }
    try {
      await resetRoomScores(room.id);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de redémarrer la partie.");
      return;
    }
    // Si la partie s'est terminée parce que la limite de morceaux (et non le
    // score cible) était atteinte, la lever : queueIndex ne changeant pas au
    // redémarrage, cette limite resterait sinon immédiatement franchie et la
    // partie repasserait en "terminée" dès le prochain rendu (voir l'effet
    // qui appelle finishRoom plus haut). Le score cible n'a pas ce problème,
    // les scores repassant justement à zéro.
    if (maxRoundsReached) {
      setMaxRounds(null);
    }
    resumeRoom(room.id).catch(() => {});
    setBuildingPlaylist(true);
  };

  const handleStartNewGame = async () => {
    if (
      !window.confirm(
        "Lancer une nouvelle partie ? Le code actuel et les scores en cours seront perdus."
      )
    ) {
      return;
    }
    clearStoredGameState();
    setHydrated(false);
    setPlayers([]);
    setRound(null);
    setRoundHistory([]);
    setRoundAttempts([]);
    setTimeLeft(null);
    timedOutRoundId.current = null;
    setAcknowledgedTimeoutRoundId(null);
    setHostMode(null);
    setQueue([]);
    setQueueIndex(0);
    setBuildingPlaylist(true);
    setHostPlayerId(null);
    setHostJoinSkipped(false);
    setHostView("admin");
    try {
      const r = await createRoom();
      writeStoredJSON(ROOM_STORAGE_KEY, { id: r.id, code: r.code });
      setRoom(r);
      setHydrated(true);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer une nouvelle partie.");
    }
  };

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen p-10 text-center bg-ink">
        <div className="max-w-md bg-inkSurface border border-danger/40 rounded-2xl p-8">
          <p className="text-xl text-danger font-bold mb-2">Oups</p>
          <p className="text-white/90">
            {error}
            <br />
            <span className="text-inkMuted text-sm">
              Vérifie que apps/web-host/.env.local contient bien NEXT_PUBLIC_SUPABASE_URL et
              NEXT_PUBLIC_SUPABASE_ANON_KEY, puis relance `npm run web-host`.
            </span>
          </p>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-ink">
        <p className="text-xl text-inkMuted animate-pulse">Création de la partie…</p>
      </main>
    );
  }

  const winner = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;

  // "revealed" n'autorise plus le démarrage d'une nouvelle manche : la
  // réponse a été montrée mais pas encore validée (bonne/mauvaise), il faut
  // d'abord passer par handleResolve pour arriver à "scored".
  const canStartRound = !round || round.status === "scored";
  const upcomingQueue = queue.slice(queueIndex);
  const queueExhausted = canStartRound && queueIndex > 0 && upcomingQueue.length === 0;
  const gameStarted = queueIndex > 0;
  // Joueur(s) ayant atteint (ou dépassé) le score cible — s'il y en a
  // plusieurs sur la même manche, c'est une égalité traitée comme une
  // victoire partagée plutôt qu'un vainqueur unique (voir podium plus bas,
  // qui gère déjà les rangs à égalité).
  const playersReachingTargetScore =
    targetScore !== null ? players.filter((p) => p.score >= targetScore) : [];
  const targetScoreReached = canStartRound && gameStarted && playersReachingTargetScore.length > 0;
  // Même logique que targetScoreReached mais sur le nombre de manches
  // jouées (queueIndex) plutôt que sur le score — cumulable avec le score
  // cible : la partie s'arrête dès la première limite atteinte.
  const maxRoundsReached =
    canStartRound && maxRounds !== null && queueIndex >= maxRounds && gameStarted;
  // La partie est terminée si l'une de ces trois conditions est vraie :
  // playlist épuisée, score cible atteint, ou nombre de morceaux max joué.
  // Le même écran de fin s'affiche dans les trois cas, seul le titre
  // change (voir plus bas) — priorité au score cible s'il coïncide avec
  // une autre limite, car c'est l'info la plus intéressante à afficher.
  const gameOver = queueExhausted || targetScoreReached || maxRoundsReached;
  const rankedPlayers = withRanks(players);
  const modeChosen = hostMode !== null;
  const blindMode = hostMode === "player";
  // "Tu joues aussi sur cet écran ?" doit être tranché avant de pouvoir
  // continuer vers la préparation Spotify/playlist (voir les blocs plus
  // bas gardés par hostJoinResolved) : pas de sens en mode "Maître du jeu"
  // (toujours résolu), résolu dès que l'hôte a rejoint OU a explicitement
  // décliné.
  const hostJoinResolved = !blindMode || hostPlayerId !== null || hostJoinSkipped;
  // Manche clôturée par expiration du timer (personne n'a buzzé) et pas
  // encore acquittée par l'hôte : buzzed_by_player_id reste null dans ce
  // cas précis (une manche résolue via Bonne/Mauvaise réponse a toujours un
  // buzzed_by_player_id renseigné), donc ce test suffit à la distinguer
  // d'une manche normalement jugée.
  const isUnresolvedTimeout =
    canStartRound &&
    round !== null &&
    round.buzzed_by_player_id === null &&
    acknowledgedTimeoutRoundId !== round.id;

  // Pour l'écran de fin de partie (voir plus bas) : la tentative la plus
  // rapide parmi celles où titre ET artiste ont été trouvés (points_awarded
  // === 2 uniquement — une réponse fausse ou partielle rapide ne doit pas
  // remporter le titre de "buzzeur le plus rapide", même si son
  // reaction_seconds est très bas).
  const fastestAttempt = roundAttempts
    .filter((a) => a.title_found && a.artist_found && a.reaction_seconds !== null)
    .reduce<RoundAttempt | null>((best, a) => {
      if (!best || (a.reaction_seconds as number) < (best.reaction_seconds as number)) return a;
      return best;
    }, null);
  const fastestPlayer = fastestAttempt
    ? players.find((p) => p.id === fastestAttempt.player_id)
    : null;

  // La manche ayant nécessité le plus de tentatives jugées (réponses
  // partielles successives en mode Maître du jeu) — un seul passage suffit
  // toujours en mode Tout le monde participe, cette stat n'a donc de relief
  // qu'en mode Maître du jeu, mais reste correcte à calculer dans les deux.
  const attemptCountByRound = new Map<string, number>();
  for (const a of roundAttempts) {
    attemptCountByRound.set(a.round_id, (attemptCountByRound.get(a.round_id) ?? 0) + 1);
  }
  let mostContestedRound: Round | null = null;
  let mostContestedCount = 0;
  for (const r of roundHistory) {
    const count = attemptCountByRound.get(r.id) ?? 0;
    if (count > mostContestedCount) {
      mostContestedCount = count;
      mostContestedRound = r;
    }
  }

  // Bascule complète de l'écran hôte vers un buzzer, pilotée
  // automatiquement (voir handlePlayNextInQueue et l'effet de bascule
  // automatique sur le buzz plus haut, plus aucun contrôle manuel) : un
  // early return plutôt qu'un rendu conditionnel imbriqué dans le JSX
  // ci-dessous, qui est déjà volumineux et pas du tout structuré pour ce
  // cas — tous les hooks/handlers du composant ont déjà tourné à ce stade
  // (règles des Hooks respectées), ce early return ne fait que remplacer
  // le JSX produit.
  if (room && hostPlayerId && hostView === "buzzer") {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-ink">
        <HostBuzzerView
          round={round}
          players={players}
          hostPlayerId={hostPlayerId}
          gameOver={gameOver}
          sending={sendingHostBuzz}
          onBuzz={handleHostBuzz}
          onBackToAdmin={() => setHostView("admin")}
          equippedCosmetic={hostEquippedCosmetic}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 md:p-10 bg-ink">
      <PlayerAccountCorner />
      {gameStarted ? (
        <>
          <div className="text-center bg-inkSurface border border-inkBorder rounded-2xl px-10 py-6">
            <p className="text-sm uppercase tracking-[0.3em] text-inkMuted mb-1">
              Rejoignez la partie avec le code
            </p>
            <p className="text-4xl sm:text-6xl font-bold tracking-widest text-sage font-display">{room.code}</p>
            <div className="flex justify-center gap-4 mt-3">
              <Link
                href="/"
                className="text-xs text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Accueil
              </Link>
              <button
                onClick={handleStartNewGame}
                className="text-xs text-inkMuted hover:text-danger underline transition inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Nouvelle partie
              </button>
            </div>
          </div>

          <div className="relative w-full max-w-xl bg-inkSurface border border-inkBorder rounded-2xl p-6">
            <span className="absolute top-0 left-6 right-6 h-1 rounded-b-md bg-gold" />
            <h2 className="text-2xl font-bold mb-4 font-display">Joueurs connectés ({players.length})</h2>
            <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {players.length === 0 && <li className="text-inkMuted">En attente de joueurs…</li>}
              {rankedPlayers.map((p) => {
                const plate = podiumRowClasses(p.rank);
                return (
                  <li
                    key={p.id}
                    className={`flex justify-between items-center rounded-xl px-4 py-3 text-xl ${plate.row}`}
                  >
                    <span className={`flex items-center gap-3 min-w-0 ${plate.text}`}>
                      <span className="font-display font-black w-5 shrink-0 text-center">{p.rank}</span>
                      <span className="truncate font-medium">{p.display_name}</span>
                      {/* Malus buzzer en cours (voir lib/buzzLockout.ts) : purement
                          informatif ici, l'application réelle se fait côté serveur. */}
                      {p.correct_streak_count >= 3 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-xs text-amber shrink-0"
                          title={`${p.correct_streak_count} bonnes réponses d'affilée — buzzer retardé`}
                        >
                          <Flame className="w-3.5 h-3.5" /> {p.correct_streak_count}
                        </span>
                      )}
                      {round && isFullyBlockedThisRound(p, round) && (
                        <span className="text-xs text-danger shrink-0" title="Buzzer bloqué ce tour-ci">
                          bloqué
                        </span>
                      )}
                    </span>
                    <span className={`font-black font-display shrink-0 ${plate.text}`}>{p.score} pts</span>
                  </li>
                );
              })}
            </ul>
          </div>

        </>
      ) : (
        // Avant le début de la partie, les scores n'ont aucun sens (tout le
        // monde est à 0) : un bandeau compact (code + joueurs + mode) suffit
        // et laisse toute la place à la préparation de la playlist plutôt
        // que d'empiler 2 grandes cartes peu informatives à ce stade.
        <div className="relative w-full max-w-xl bg-inkSurface border border-inkBorder rounded-2xl px-6 py-4 flex flex-col gap-2">
          <span className="absolute top-0 left-6 right-6 h-1 rounded-b-md bg-sage" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-2xl font-bold tracking-widest text-sage font-display">{room.code}</span>
            <div className="flex gap-4">
              <Link
                href="/"
                className="text-xs text-inkMuted hover:text-sage underline transition inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Accueil
              </Link>
              <button
                onClick={handleStartNewGame}
                className="text-xs text-inkMuted hover:text-danger underline transition inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Nouvelle partie
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-inkMuted">
            <div className="flex items-center justify-between gap-3">
              <span>
                {players.length === 0
                  ? "En attente de joueurs…"
                  : `${players.length} joueur${players.length > 1 ? "s" : ""}`}
              </span>
              {hostMode && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap bg-inkSurface2 border border-inkBorder rounded-full px-3 py-1 text-xs font-medium">
                  {hostMode === "gamemaster" ? (
                    <Mic2 className="w-3.5 h-3.5 text-sage" />
                  ) : (
                    <Headphones className="w-3.5 h-3.5 text-sage" />
                  )}
                  {hostMode === "gamemaster" ? "Maître du jeu" : "Tout le monde participe"}
                </span>
              )}
            </div>
            {/* Liste des joueurs plutôt qu'une phrase séparée par des
                virgules : chaque nom reste lisible individuellement même
                quand il y en a beaucoup, et ça s'enroule naturellement sur
                plusieurs lignes au lieu de produire une longue chaîne. */}
            {players.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {players.map((p) => (
                  <li
                    key={p.id}
                    className="bg-inkSurface2 border border-inkBorder rounded-lg px-2.5 py-1 text-xs text-white truncate max-w-[160px]"
                  >
                    {p.display_name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {roundHistory.length > 0 && (
      <div className="w-full max-w-xl">
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-sm text-inkMuted hover:text-sage underline transition"
        >
          {showHistory
            ? "▲ Masquer l’historique des manches"
            : `▼ Voir l’historique des manches (${roundHistory.length})`}
        </button>
        {showHistory && (
          <div className="mt-2 bg-inkSurface border border-inkBorder rounded-2xl p-4 max-h-72 overflow-y-auto">
            {roundHistory.length === 0 ? (
              <p className="text-inkMuted text-sm">Aucune manche jouée pour l’instant.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...roundHistory].reverse().map((r) => {
                  // Affichage decroissant (derniere manche jouee en haut),
                  // mais on garde le numero base sur l'ordre chronologique
                  // reel (order_index) plutot que de renumeroter depuis le
                  // haut -- plus parlant : le numero le plus eleve est
                  // toujours la manche la plus recente.
                  const i = roundHistory.findIndex((h) => h.id === r.id);
                  const attemptsForRound = roundAttempts.filter((a) => a.round_id === r.id);
                  return (
                    <li key={r.id} className="bg-inkSurface2 rounded-xl px-4 py-2 text-sm">
                      <p className="truncate font-medium flex items-center gap-1.5">
                        {i + 1}. {r.title} — {r.artist}
                        {r.is_joker && <Dice5 className="w-3.5 h-3.5 text-amber shrink-0" />}
                      </p>
                      {attemptsForRound.length === 0 ? (
                        <p className="text-inkMuted">Personne n’a trouvé</p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {attemptsForRound.map((a) => {
                            const attemptPlayer = players.find((p) => p.id === a.player_id);
                            const label = a.title_found && a.artist_found
                              ? "titre + artiste"
                              : a.title_found
                                ? "titre seul"
                                : a.artist_found
                                  ? "artiste seul"
                                  : "rien trouvé";
                            const colorClass =
                              a.points_awarded > 0 ? "text-sage" : "text-danger";
                            const bonusLabels = [
                              a.speed_bonus_awarded && "bonus vitesse",
                              a.remontada_bonus_awarded && "bonus remontada",
                            ].filter(Boolean);
                            return (
                              <li key={a.id} className={`flex justify-between gap-3 ${colorClass}`}>
                                <span className="truncate min-w-0 flex-1">
                                  {attemptPlayer?.display_name ?? "Joueur"} — {label}
                                  {bonusLabels.length > 0 && ` (${bonusLabels.join(", ")})`}
                                </span>
                                <span className="whitespace-nowrap font-bold">
                                  {a.points_awarded > 0 ? `+${a.points_awarded}` : a.points_awarded} pt
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      )}

      <div className="w-full max-w-6xl text-center">
        {!canStartRound && round?.status === "playing" && (
          <div className="relative bg-inkSurface border border-inkBorder rounded-2xl px-8 py-10 animate-pulseGlow">
            <span className="absolute top-0 left-8 right-8 h-1 rounded-b-md bg-sage" />
            {round.is_joker && (
              <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full mb-3">
                <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
              </span>
            )}
            <p className="text-2xl font-bold flex items-center justify-center gap-2">
              <Music2 className="w-6 h-6 text-sage" /> Manche en cours — en attente d’un buzz…
            </p>
            {!blindMode && (
              <p className="text-lg text-inkMuted mt-1">
                {round.title} — {round.artist}
              </p>
            )}
            {(round.title_found || round.artist_found) && (
              <p className="text-lg text-inkMuted mt-2">
                {round.title_found ? `Titre trouvé : ${round.title}` : "Titre encore à trouver"}
                {" · "}
                {round.artist_found ? `Artiste trouvé : ${round.artist}` : "Artiste encore à trouver"}
              </p>
            )}
            {timeLeft !== null && (
              <p className="text-4xl sm:text-5xl font-bold mt-4 text-sage tabular-nums font-display">{timeLeft}s</p>
            )}
          </div>
        )}
        {!canStartRound && round?.status === "buzzed" && (
          <div className="relative flex flex-col items-center gap-4 bg-inkSurface border border-inkBorder rounded-2xl px-8 py-8">
            <span className="absolute top-0 left-8 right-8 h-1 rounded-b-md bg-sage" />
            {round.is_joker && (
              <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full">
                <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
              </span>
            )}
            <p className="text-3xl font-bold text-white flex items-center justify-center gap-2">
              <Bell className="w-7 h-7 text-sage" /> {winner?.display_name ?? "Un joueur"} a buzzé en premier !
            </p>
            {!blindMode && (
              <p className="text-lg text-inkMuted">
                {round.title} — {round.artist}
              </p>
            )}
            {(round.title_found || round.artist_found) && (
              <p className="text-sm text-inkMuted">
                Déjà trouvé : {[round.title_found && "titre", round.artist_found && "artiste"]
                  .filter(Boolean)
                  .join(" et ")}
              </p>
            )}
            {blindMode ? (
              <>
                <p className="text-sm text-inkMuted">
                  Laisse-le/la donner sa réponse à voix haute, puis révèle le titre.
                </p>
                <button
                  onClick={handleReveal}
                  disabled={revealing}
                  className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-60 transition px-6 py-3 rounded-xl text-lg font-bold inline-flex items-center gap-2"
                >
                  <Eye className="w-5 h-5" /> {revealing ? "..." : "Révéler la réponse"}
                </button>
              </>
            ) : (
              <p className="text-sm text-inkMuted">
                Laisse-le/la donner sa réponse à voix haute…
              </p>
            )}
          </div>
        )}
        {!canStartRound && round?.status === "revealed" && (
          <div className="relative flex flex-col items-center gap-4 bg-inkSurface border border-inkBorder rounded-2xl px-8 py-8">
            <span className="absolute top-0 left-8 right-8 h-1 rounded-b-md bg-sage" />
            {round.is_joker && (
              <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full">
                <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
              </span>
            )}
            <p className="text-3xl font-bold text-white flex items-center justify-center gap-2">
              <Bell className="w-7 h-7 text-sage" /> {winner?.display_name ?? "Un joueur"} a buzzé en premier !
            </p>
            <p className="text-lg text-inkMuted">
              {round.title} — {round.artist}
            </p>
            {round.title_found && !round.artist_found ? (
              <div className="flex gap-4 w-full max-w-md">
                <button
                  onClick={() => handleJudge(false, true)}
                  className="flex-1 bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition px-6 py-3 rounded-xl text-lg font-bold inline-flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5 text-sage" /> Artiste trouvé
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="flex-1 bg-transparent border border-danger/50 text-danger hover:bg-danger/10 transition px-6 py-3 rounded-xl text-lg font-bold inline-flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" /> Toujours pas
                </button>
              </div>
            ) : !round.title_found && round.artist_found ? (
              <div className="flex gap-4 w-full max-w-md">
                <button
                  onClick={() => handleJudge(true, false)}
                  className="flex-1 bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition px-6 py-3 rounded-xl text-lg font-bold inline-flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5 text-sage" /> Titre trouvé
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="flex-1 bg-transparent border border-danger/50 text-danger hover:bg-danger/10 transition px-6 py-3 rounded-xl text-lg font-bold inline-flex items-center justify-center gap-2"
                >
                  <XCircle className="w-5 h-5" /> Toujours pas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                <button
                  onClick={() => handleJudge(true, false)}
                  className="bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition px-4 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2"
                >
                  <Music className="w-4 h-4 text-sage" /> Titre seul (+1)
                </button>
                <button
                  onClick={() => handleJudge(false, true)}
                  className="bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition px-4 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2"
                >
                  <Mic className="w-4 h-4 text-sage" /> Artiste seul (+1)
                </button>
                <button
                  onClick={() => handleJudge(true, true)}
                  className="bg-sage text-ink hover:bg-sage/90 transition px-4 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Les deux (+2)
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="bg-transparent border border-danger/50 text-danger hover:bg-danger/10 transition px-4 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" /> Aucun (-1)
                </button>
              </div>
            )}
          </div>
        )}

        {isUnresolvedTimeout && round && (
          <div className="flex flex-col items-center gap-4 bg-inkSurface border border-inkBorder rounded-2xl px-8 py-8">
            <p className="text-3xl font-bold text-danger">Personne n’a buzzé à temps</p>
            <p className="text-lg text-inkMuted">
              La réponse était :{" "}
              <span className="font-bold text-sage">
                {round.title} — {round.artist}
              </span>
            </p>
            <button
              onClick={() => setAcknowledgedTimeoutRoundId(round.id)}
              className="bg-sage text-ink hover:bg-sage/90 transition px-6 py-3 rounded-xl text-lg font-bold"
            >
              Continuer
            </button>
          </div>
        )}

        {canStartRound && !modeChosen && !isUnresolvedTimeout && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-2xl font-bold">Comment veux-tu jouer cette partie ?</p>

            <div className="flex flex-col md:flex-row gap-4 w-full">
              <button
                onClick={() => setHostMode("gamemaster")}
                className="relative flex-1 bg-inkSurface hover:bg-inkSurface2 transition border-2 border-inkBorderStrong hover:border-sage rounded-2xl px-6 py-5 text-left"
              >
                <span className="absolute top-0 left-6 right-6 h-1 rounded-b-md bg-sage" />
                <p className="text-lg font-bold mb-1 text-white flex items-center gap-2">
                  <Mic2 className="w-5 h-5 text-sage" /> Maître du jeu
                </p>
                <p className="text-sm text-inkMuted">
                  Tu gères la playlist et les manches mais tu ne joues pas toi-même : tu vois tous
                  les titres à l’avance.
                </p>
              </button>
              <button
                onClick={() => setHostMode("player")}
                className="relative flex-1 bg-inkSurface hover:bg-inkSurface2 transition border-2 border-inkBorderStrong hover:border-info rounded-2xl px-6 py-5 text-left"
              >
                <span className="absolute top-0 left-6 right-6 h-1 rounded-b-md bg-info" />
                <p className="text-lg font-bold mb-1 text-white flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-info" /> Tout le monde participe
                </p>
                <p className="text-sm text-inkMuted">
                  Tu joues aussi ! Les titres et artistes de la file d’attente restent masqués,
                  révélés seulement pour valider une réponse.
                </p>
              </button>
            </div>

            {/* Score cible optionnel : permet de charger une grosse playlist
                (100+ morceaux) sans que la partie soit interminable, en la
                terminant dès qu'un joueur atteint ce score plutôt que
                d'attendre la fin de la file d'attente. Vide = comportement
                historique (jusqu'à la fin de la playlist). Réglable aussi
                plus tard depuis le panneau playlist (voir plus bas). */}
            <div className="relative w-full max-w-sm bg-inkSurface border border-inkBorder rounded-2xl px-5 py-4 flex flex-col gap-2">
              <span className="absolute top-0 left-5 right-5 h-1 rounded-b-md bg-info" />
              <label htmlFor="target-score" className="text-sm font-bold text-inkMuted flex items-center gap-1.5">
                <Target className="w-4 h-4" /> Score à atteindre pour gagner (optionnel)
              </label>
              <input
                id="target-score"
                type="number"
                min={1}
                inputMode="numeric"
                value={targetScore ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setTargetScore(null);
                    return;
                  }
                  const parsed = Number.parseInt(raw, 10);
                  setTargetScore(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                }}
                placeholder="Illimité (jusqu'à la fin de la playlist)"
                className="bg-inkSurface2 border-2 border-inkBorder focus:border-sage rounded-xl px-4 py-2 text-sm appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
              />
              <p className="text-xs text-inkMuted">
                Laisse vide pour jouer jusqu’à la fin de la playlist. Sinon, la partie se termine
                dès qu’un joueur atteint ce score.
              </p>

              <label htmlFor="max-rounds" className="text-sm font-bold text-inkMuted mt-2 flex items-center gap-1.5">
                <Hash className="w-4 h-4" /> Nombre de morceaux max (optionnel)
              </label>
              <input
                id="max-rounds"
                type="number"
                min={1}
                inputMode="numeric"
                value={maxRounds ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setMaxRounds(null);
                    return;
                  }
                  const parsed = Number.parseInt(raw, 10);
                  setMaxRounds(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                }}
                placeholder="Toute la playlist"
                className="bg-inkSurface2 border-2 border-inkBorder focus:border-sage rounded-xl px-4 py-2 text-sm appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
              />
              <p className="text-xs text-inkMuted">
                Laisse vide pour jouer toute la playlist. Sinon, la partie se termine dès que ce
                nombre de morceaux a été joué. Cumulable avec le score cible ci-dessus.
              </p>
            </div>
          </div>
        )}

        {/* "Tu joues aussi sur cet écran ?" : uniquement en mode "Tout le
            monde participe" (blindMode), et uniquement avant que la
            question soit tranchée (hostJoinResolved) — décision prise une
            seule fois, avant de lancer la première manche (sinon le
            premier morceau démarrerait avant que l'hôte ait eu la chance
            de s'inscrire comme joueur). Tous les blocs suivants (connexion
            Spotify, construction de playlist…) restent masqués tant que ce
            n'est pas résolu. */}
        {canStartRound && modeChosen && blindMode && !hostJoinResolved && !isUnresolvedTimeout && (
          <div className="relative flex flex-col items-center gap-4 w-full max-w-sm mx-auto bg-inkSurface border border-inkBorder rounded-2xl px-6 py-6">
            <span className="absolute top-0 left-6 right-6 h-1 rounded-b-md bg-sage" />
            <p className="text-lg font-bold text-white text-center flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-sage" /> Tu joues aussi sur cet écran ?
            </p>
            <p className="text-sm text-inkMuted text-center">
              Transforme cet écran en buzzer pour toi entre les manches, sans besoin d’un autre
              appareil. À décider maintenant : ça ne pourra plus être changé une fois la partie
              commencée.
            </p>
            {hostPlayerAccount ? (
              // Hôte connecté (Compte joueur déjà utilisé pour les
              // cosmétiques) : pseudo déjà connu, inutile de le redemander
              // — un seul clic inscrit directement l'hôte avec son pseudo
              // ET son account_id (voir handleJoinAsHost).
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => handleJoinAsHost(hostPlayerAccount.pseudo)}
                  disabled={joiningAsHost}
                  className="flex-1 bg-sage text-ink hover:bg-sage/90 disabled:opacity-40 transition px-4 py-3 rounded-xl font-bold"
                >
                  {joiningAsHost ? "..." : `Oui, je joue (en tant que ${hostPlayerAccount.pseudo})`}
                </button>
                <button
                  onClick={() => setHostJoinSkipped(true)}
                  className="flex-1 bg-inkSurface2 border border-inkBorderStrong hover:border-white transition px-4 py-3 rounded-xl font-bold text-inkMuted"
                >
                  Non, je gère juste le jeu
                </button>
              </div>
            ) : !joinHostFormOpen ? (
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setJoinHostFormOpen(true)}
                  className="flex-1 bg-sage text-ink hover:bg-sage/90 transition px-4 py-3 rounded-xl font-bold"
                >
                  Oui, je joue
                </button>
                <button
                  onClick={() => setHostJoinSkipped(true)}
                  className="flex-1 bg-inkSurface2 border border-inkBorderStrong hover:border-white transition px-4 py-3 rounded-xl font-bold text-inkMuted"
                >
                  Non, je gère juste le jeu
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <input
                  value={hostNameDraft}
                  onChange={(e) => setHostNameDraft(e.target.value)}
                  className="min-w-0 flex-1 bg-inkSurface2 border-2 border-inkBorder focus:border-sage outline-none transition rounded-xl px-3 py-2 text-white"
                />
                <button
                  onClick={() => handleJoinAsHost(hostNameDraft)}
                  disabled={joiningAsHost || hostNameDraft.trim().length === 0}
                  className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-40 transition px-4 py-2 rounded-xl font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <UserPlus className="w-4 h-4" /> {joiningAsHost ? "..." : "Confirmer"}
                </button>
              </div>
            )}
          </div>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && (
          <button
            onClick={() => {
              if (window.confirm("Se déconnecter de Spotify pour connecter un autre compte ?")) {
                spotifyPlayer.disconnect();
              }
            }}
            className="text-xs text-inkMuted hover:text-danger underline transition self-end -mb-2 inline-flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnecter Spotify (changer de compte)
          </button>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "checking" && (
          <p className="text-inkMuted">Vérification de la connexion Spotify…</p>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "disconnected" && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={spotifyPlayer.connect}
              className="bg-sage text-ink hover:bg-sage/90 transition px-8 py-4 rounded-xl text-xl font-bold"
            >
              Se connecter à Spotify pour préparer une playlist
            </button>
            {/* Distincte du "Compte joueur" (voir PlayerAccountCorner, coin
                supérieur droit) : ici on connecte Spotify pour lancer la
                musique (Web Playback SDK, nécessite Premium), pas pour
                identifier l'hôte en tant que joueur — retour utilisateur
                direct, les deux étaient confondues quand l'hôte joue aussi. */}
            <p className="text-xs text-inkMuted text-center max-w-xs">
              Connexion technique pour lancer la musique — différente du &laquo; Compte joueur &raquo; en haut à droite.
            </p>
          </div>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "connecting_player" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-inkMuted">Connexion au lecteur Spotify…</p>
            {/* Bug remonté : cet écran restait parfois bloqué ici
                indéfiniment (veille de l'ordinateur, coupure réseau
                passagère...), seul un rechargement complet de la page en
                sortait. spotifyPlayer.stuckTooLong (voir useSpotifyPlayer.ts)
                s'arme après 12s sans succès : on propose alors de réessayer
                sans quitter la page, plutôt que de laisser l'hôte deviner
                qu'il doit recharger. */}
            {spotifyPlayer.stuckTooLong && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-inkMuted/70 text-center max-w-xs">
                  Ça prend plus longtemps que prévu.
                </p>
                <button
                  onClick={spotifyPlayer.reconnect}
                  className="bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition rounded-xl px-4 py-2 text-sm font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Réessayer
                </button>
              </div>
            )}
          </div>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && gameOver && !buildingPlaylist && (
          <div className="relative flex flex-col items-center gap-6 bg-inkSurface border border-inkBorder rounded-2xl px-8 py-8">
            <span className="absolute top-0 left-8 right-8 h-1 rounded-b-md bg-gold" />
            <Trophy className="w-10 h-10 text-gold" />
            {targetScoreReached ? (
              <p className="text-2xl font-bold text-white text-center font-display">
                {playersReachingTargetScore.map((p) => p.display_name).join(" et ")}{" "}
                {playersReachingTargetScore.length > 1 ? "ont" : "a"} atteint les {targetScore}{" "}
                points
              </p>
            ) : maxRoundsReached ? (
              <p className="text-2xl font-bold text-white text-center font-display">
                Limite de {maxRounds} morceau{maxRounds && maxRounds > 1 ? "x" : ""} atteinte
              </p>
            ) : (
              <p className="text-2xl font-bold text-white font-display">Playlist terminée</p>
            )}

            {/* Podium visuel des 3 premiers (gestion des égalités déjà faite
                par withRanks : deux joueurs à égalité partagent le même
                rang, donc "top 3" ici veut dire les 3 premiers RANGS, pas
                forcément 3 joueurs si égalité). */}
            {rankedPlayers.length > 0 && (
              <div className="flex items-end justify-center gap-3">
                {rankedPlayers
                  .filter((p) => p.rank <= 3)
                  .sort((a, b) => a.rank - b.rank)
                  .map((p) => {
                    const height = p.rank === 1 ? "h-24" : p.rank === 2 ? "h-16" : "h-12";
                    // Or / argent / bronze pour le podium (1er, 2e, 3e) —
                    // seuls les 3 premiers RANGS sont affichés ici (voir le
                    // filter juste au-dessus), donc rank vaut toujours 1, 2
                    // ou 3 à ce stade.
                    const podiumColor =
                      p.rank === 1
                        ? "border-gold bg-gold/10 text-gold"
                        : p.rank === 2
                          ? "border-silver bg-silver/10 text-silver"
                          : "border-bronze bg-bronze/10 text-bronze";
                    return (
                      <div key={p.id} className="flex flex-col items-center gap-1 w-20">
                        <span className="text-sm truncate w-full text-center">{p.display_name}</span>
                        <div
                          className={`w-full ${height} rounded-t-xl border-2 flex items-start justify-center pt-2 font-black text-lg ${podiumColor}`}
                        >
                          {p.rank}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {(fastestAttempt || mostContestedCount > 1) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-md">
                {fastestAttempt && (
                  <div className="bg-inkSurface2 rounded-xl px-4 py-3 text-left">
                    <p className="text-xs text-inkMuted flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Buzzeur le plus rapide</p>
                    <p className="text-sm font-bold text-sage">
                      {fastestPlayer?.display_name ?? "Joueur"} —{" "}
                      {(fastestAttempt.reaction_seconds as number).toFixed(1)}s
                    </p>
                  </div>
                )}
                {mostContestedRound && mostContestedCount > 1 && (
                  <div className="bg-inkSurface2 rounded-xl px-4 py-3 text-left">
                    <p className="text-xs text-inkMuted flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Manche la plus disputée</p>
                    <p className="text-sm font-bold text-sage">
                      {mostContestedRound.title} ({mostContestedCount} tentatives)
                    </p>
                  </div>
                )}
              </div>
            )}

            <ul className="w-full space-y-2 text-left max-h-64 overflow-y-auto pr-1">
              {rankedPlayers.map((p) => {
                const plate = podiumRowClasses(p.rank);
                return (
                  <li
                    key={p.id}
                    className={`flex justify-between items-center rounded-xl px-4 py-3 ${plate.row}`}
                  >
                    <span className={`flex items-center gap-3 ${plate.text}`}>
                      <span className="font-display font-black w-5 text-center">{p.rank}</span>
                      <span className="font-medium">{p.display_name}</span>
                    </span>
                    <span className={`font-black font-display ${plate.text}`}>{p.score} pts</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
              <button
                onClick={() => {
                  resumeRoom(room.id).catch(() => {});
                  setBuildingPlaylist(true);
                }}
                className="flex-none sm:min-w-[220px] bg-sage text-ink hover:bg-sage/90 transition px-6 py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> Continuer la partie
              </button>
              <button
                onClick={handleRestartGame}
                className="flex-none sm:min-w-[220px] bg-inkSurface2 border border-inkBorderStrong hover:border-sage transition px-6 py-3 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Redémarrer une partie
              </button>
            </div>
            <p className="text-xs text-inkMuted text-center max-w-sm">
              « Continuer » garde les scores et ajoute d’autres morceaux à la suite. «
              Redémarrer » garde les mêmes joueurs mais remet les scores et l’historique à zéro.
            </p>
          </div>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && !gameOver && !buildingPlaylist && (
          <div className="flex flex-col items-center gap-4 bg-inkSurface border border-inkBorder rounded-2xl px-8 py-8">
            {launchingRound ? (
              <p className="text-xl font-bold text-inkMuted animate-pulse">Lancement de la manche…</p>
            ) : (
              <>
                <p className="text-inkMuted">
                  Manche {queueIndex + 1} / {queue.length} à venir :
                </p>
                <p className="text-xl font-bold">
                  {blindMode
                    ? `Morceau ${queueIndex + 1}`
                    : `${upcomingQueue[0]?.title} — ${upcomingQueue[0]?.artist}`}
                </p>
              </>
            )}
            <button
              onClick={handlePlayNextInQueue}
              disabled={players.length === 0 || launchingRound}
              className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-40 transition px-8 py-4 rounded-xl text-xl font-bold inline-flex items-center gap-2"
            >
              <Play className="w-5 h-5" /> Manche suivante
            </button>
            {players.length === 0 && (
              <p className="text-sm text-inkMuted">
                En attente d’au moins un joueur avant de pouvoir lancer la manche.
              </p>
            )}
            <button
              onClick={() => setBuildingPlaylist(true)}
              className="text-sm text-inkMuted hover:text-sage underline transition"
            >
              + Ajouter d’autres morceaux à la file
            </button>
          </div>
        )}

        {canStartRound && modeChosen && hostJoinResolved && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && buildingPlaylist && (
          <div className="relative w-full flex flex-col gap-7 text-left bg-inkSurface2 border border-inkBorder rounded-2xl p-7 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_12px_28px_rgba(0,0,0,0.45)]">
            <span className="absolute top-0 left-7 right-7 h-1 rounded-b-md bg-sage" />
            <div className="flex justify-between items-center">
              <span className="text-sm text-inkMuted flex items-center gap-1.5">
                Mode :
                {hostMode === "gamemaster" ? (
                  <span className="inline-flex items-center gap-1.5 bg-inkSurface3 rounded-full px-3 py-1 text-xs font-medium">
                    <Mic2 className="w-3.5 h-3.5 text-sage" /> Maître du jeu
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-inkSurface3 rounded-full px-3 py-1 text-xs font-medium">
                    <Headphones className="w-3.5 h-3.5 text-sage" /> Tout le monde participe
                  </span>
                )}
              </span>
              <button
                onClick={() => setHostMode(null)}
                className="text-sm text-inkMuted hover:text-sage underline transition"
              >
                Changer de mode
              </button>
            </div>

            {/* Score cible et morceaux max fusionnés en une seule ligne
                compacte (au lieu de 2 blocs empilés avec leur propre texte
                d'aide) : les 2 réglages restent modifiables à tout moment
                sans repasser par "Changer de mode" (voir targetScore plus
                haut), mais prennent beaucoup moins de place verticale. */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-inkMuted">
                Réglages de partie
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <label
                  htmlFor="target-score-inline"
                  title="Laisse vide pour jouer jusqu'à la fin de la playlist. Sinon, la partie se termine dès qu'un joueur atteint ce score."
                  className="flex items-center gap-2 bg-inkSurface3 rounded-xl px-4 py-2.5"
                >
                  <Target className="w-4 h-4 text-inkMuted shrink-0" />
                  <span className="text-inkMuted whitespace-nowrap">Score cible</span>
                  <input
                    id="target-score-inline"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={targetScore ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setTargetScore(null);
                        return;
                      }
                      const parsed = Number.parseInt(raw, 10);
                      setTargetScore(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                    }}
                    placeholder="Illimité"
                    className="w-16 bg-inkSurface border border-inkBorderStrong focus:border-sage outline-none transition rounded-lg px-2 py-1 text-white font-bold text-center appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                  />
                  <span className="text-inkMuted">pts</span>
                </label>
                <label
                  htmlFor="max-rounds-inline"
                  title="Laisse vide pour jouer toute la playlist. Sinon, la partie se termine dès que ce nombre de morceaux a été joué. Cumulable avec le score cible."
                  className="flex items-center gap-2 bg-inkSurface3 rounded-xl px-4 py-2.5"
                >
                  <Hash className="w-4 h-4 text-inkMuted shrink-0" />
                  <span className="text-inkMuted whitespace-nowrap">Morceaux max</span>
                  <input
                    id="max-rounds-inline"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={maxRounds ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setMaxRounds(null);
                        return;
                      }
                      const parsed = Number.parseInt(raw, 10);
                      setMaxRounds(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                    }}
                    placeholder="Toute la playlist"
                    className="w-32 bg-inkSurface border border-inkBorderStrong focus:border-sage outline-none transition rounded-lg px-2 py-1 text-white font-bold appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                  />
                </label>
              </div>
            </div>

            {/* Réglages bonus/malus (voir migration 0018) : comme le score
                cible et les morceaux max ci-dessus, modifiables à tout
                moment en cours de partie — un changement s'applique dès la
                prochaine manche jugée (voire dès le prochain tirage pour le
                joker). Grille à 2 colonnes (bonus | malus) plutôt qu'une
                liste empilée : ça tient sur moins de hauteur pour les 5
                réglages, le détail de chacun restant accessible au survol
                (voir le title sur BonusMalusToggleRow). */}
            {room && (
              <div className="flex flex-col gap-3 text-sm pt-1 border-t border-inkBorder/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkMuted">
                  Bonus &amp; malus
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex flex-col gap-2">
                    <BonusMalusToggleRow
                      label="Manche joker"
                      description="Environ 1 manche sur 10 double les points, dans les deux sens (bonne réponse complète : 4 pts au lieu de 2 ; mauvaise réponse : -2 au lieu de -1)."
                      icon={<Dice5 className="w-4 h-4" />}
                      iconClassName="text-amber"
                      enabled={room.bonus_joker_enabled}
                      saving={savingBonusMalusSetting === "bonus_joker_enabled"}
                      onToggle={() => handleToggleBonusMalusSetting("bonus_joker_enabled")}
                    />
                    <BonusMalusToggleRow
                      label="Bonus vitesse"
                      description="+1 point si la réponse complète (titre + artiste) est buzzée en moins de 2 secondes."
                      icon={<Zap className="w-4 h-4" />}
                      iconClassName="text-sage"
                      enabled={room.bonus_speed_enabled}
                      saving={savingBonusMalusSetting === "bonus_speed_enabled"}
                      onToggle={() => handleToggleBonusMalusSetting("bonus_speed_enabled")}
                    />
                    <BonusMalusToggleRow
                      label="Bonus remontada"
                      description="+1 point si tu réponds juste alors que tu es strictement dernier·ère au classement, avec plus de 5 points d'écart avec l'avant-dernier."
                      icon={<TrendingUp className="w-4 h-4" />}
                      iconClassName="text-sage"
                      enabled={room.bonus_remontada_enabled}
                      saving={savingBonusMalusSetting === "bonus_remontada_enabled"}
                      onToggle={() => handleToggleBonusMalusSetting("bonus_remontada_enabled")}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <BonusMalusToggleRow
                      label="Malus série"
                      description="3 bonnes réponses d'affilée par la même personne : son buzzer est retardé de 5s, puis 10s, puis 15s au tour suivant, tant que personne d'autre n'a répondu juste."
                      icon={<Flame className="w-4 h-4" />}
                      iconClassName="text-amber"
                      enabled={room.malus_streak_lockout_enabled}
                      saving={savingBonusMalusSetting === "malus_streak_lockout_enabled"}
                      onToggle={() => handleToggleBonusMalusSetting("malus_streak_lockout_enabled")}
                    />
                    <BonusMalusToggleRow
                      label="Malus buzzer bloqué"
                      description="3 premiers-buzz ratés d'affilée par la même personne : son buzzer est complètement bloqué à la manche suivante."
                      icon={<XCircle className="w-4 h-4" />}
                      iconClassName="text-danger"
                      enabled={room.malus_streak_block_enabled}
                      saving={savingBonusMalusSetting === "malus_streak_block_enabled"}
                      onToggle={() => handleToggleBonusMalusSetting("malus_streak_block_enabled")}
                    />
                    {blindMode && (
                      <p className="text-xs text-inkMuted px-1 pt-1 flex items-start gap-1.5">
                        <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Les morceaux ajoutés restent masqués — préfère importer une playlist
                        entière pour être surpris toi aussi.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Coupe-circuit quota Spotify (verrou PARTAGÉ via Supabase, voir
                spotifyQuotaLock.ts) : un bandeau visible plutôt que de
                laisser l'hôte cliquer sur les boutons Spotify ci-dessous
                pour découvrir l'erreur à chaque fois. Les deux catégories
                sont indépendantes (voir le commentaire sur quotaLocks plus
                haut), donc affichées séparément : un quota dépassé sur
                l'une n'implique pas que l'autre le soit aussi. */}
            {(searchQuotaCooldownSeconds > 0 || playlistsQuotaCooldownSeconds > 0) && (
              <div className="flex flex-col gap-2 text-sm text-danger bg-danger/10 border border-danger/40 rounded-xl px-4 py-3">
                {searchQuotaCooldownSeconds > 0 && (
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Spotify a atteint son quota de recherche — recherche manuelle et génération
                      par genre en pause. Nouvelle tentative possible dans environ{" "}
                      {formatCooldownDuration(searchQuotaCooldownSeconds)}.
                    </span>
                  </p>
                )}
                {playlistsQuotaCooldownSeconds > 0 && (
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Spotify a atteint son quota pour les playlists — chargement et import en
                      pause. Nouvelle tentative possible dans environ{" "}
                      {formatCooldownDuration(playlistsQuotaCooldownSeconds)}.
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Les 3 méthodes d'ajout partagent un même panneau à onglets
                (plutôt que d'être empilées verticalement) : ça libère la
                place pour garder la file d'attente toujours visible à
                côté, voir la colonne de droite ci-dessous. Chaque onglet a
                sa propre couleur d'identité (sauge / bleu "info" / ambre),
                reprise du mockup validé. */}
            <div className="flex gap-1.5 sm:gap-2 pt-1 border-t border-inkBorder/60">
              <button
                type="button"
                onClick={() => setAddMethodTab("search")}
                className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border transition ${
                  addMethodTab === "search"
                    ? "border-sage text-sage bg-sage/10"
                    : "border-inkBorder text-inkMuted hover:border-inkBorderStrong"
                }`}
              >
                <Search className="w-4 h-4 shrink-0" /> Recherche
              </button>
              <button
                type="button"
                onClick={() => setAddMethodTab("import")}
                className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border transition ${
                  addMethodTab === "import"
                    ? "border-info text-info bg-info/10"
                    : "border-inkBorder text-inkMuted hover:border-inkBorderStrong"
                }`}
              >
                <ListMusic className="w-4 h-4 shrink-0" /> Import<span className="hidden sm:inline">&nbsp;Spotify</span>
              </button>
              <button
                type="button"
                onClick={() => setAddMethodTab("genre")}
                className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-bold px-2 sm:px-3 py-2 sm:py-2.5 rounded-xl border transition ${
                  addMethodTab === "genre"
                    ? "border-amber text-amber bg-amber/10"
                    : "border-inkBorder text-inkMuted hover:border-inkBorderStrong"
                }`}
              >
                <Dice5 className="w-4 h-4 shrink-0" /> Par genre
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-stretch">
              {/* Panneau de la méthode active */}
              <div className="flex flex-col gap-3 bg-inkSurface3 border border-inkBorder rounded-2xl p-4 min-h-[220px]">
                {addMethodTab === "search" && (
                  <>
                    <p className="text-sm text-inkMuted">Ajoute un morceau précis à la file, un par un.</p>
                    <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        placeholder="Titre, artiste…"
                        disabled={searchQuotaCooldownSeconds > 0}
                        className="flex-1 min-w-0 bg-inkSurface2 border-2 border-inkBorder focus:border-sage outline-none transition rounded-xl px-4 py-3 disabled:opacity-60"
                      />
                      <button
                        onClick={handleSearch}
                        disabled={searchQuotaCooldownSeconds > 0}
                        className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-60 transition px-6 py-3 rounded-xl font-bold whitespace-nowrap"
                      >
                        Chercher
                      </button>
                    </div>
                    {results.length > 0 && (
                      <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                        {results.map((track) => (
                          <li
                            key={track.sourceTrackId}
                            className="flex justify-between items-center bg-inkSurface border border-inkBorder rounded-xl px-4 py-3"
                          >
                            <span className="truncate min-w-0 flex-1">
                              {track.title} — {track.artist}
                            </span>
                            <button
                              onClick={() => handleAddToQueue(track)}
                              className="bg-sage text-ink hover:bg-sage/90 transition px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap"
                            >
                              + Ajouter
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {addMethodTab === "import" && (
                  <>
                    <p className="text-sm text-inkMuted">
                      Ajoute tous les morceaux d’une de tes playlists Spotify d’un coup.
                    </p>
                    <button
                      onClick={handleLoadMyPlaylists}
                      disabled={loadingPlaylists || myPlaylists !== null || playlistsQuotaCooldownSeconds > 0}
                      className="bg-inkSurface2 border border-inkBorderStrong hover:border-info disabled:opacity-60 transition px-6 py-3 rounded-xl font-bold self-start"
                    >
                      {myPlaylists !== null
                        ? (
                          <span className="inline-flex items-center gap-2">
                            <Check className="w-4 h-4" /> Playlists chargées
                          </span>
                        )
                        : loadingPlaylists
                          ? "Chargement…"
                          : "Charger mes playlists Spotify"}
                    </button>
                    {myPlaylists !== null && myPlaylists.length === 0 && (
                      <p className="text-sm text-inkMuted">Aucune playlist trouvée sur ton compte Spotify.</p>
                    )}
                    {myPlaylists !== null && myPlaylists.length > 0 && (
                      <div className="max-h-72 overflow-y-auto pr-1">
                        <ul className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                          {myPlaylists.map((playlist) => (
                            <li key={playlist.id} className="contents">
                              <span className="bg-inkSurface rounded-xl px-4 py-3 truncate min-w-0">
                                {playlist.name}{" "}
                                <span className="text-inkMuted">({playlist.trackCount} morceaux)</span>
                              </span>
                              <button
                                onClick={() => handleImportPlaylist(playlist.id)}
                                disabled={importingPlaylistId === playlist.id || playlistsQuotaCooldownSeconds > 0}
                                className="bg-inkSurface border border-inkBorderStrong hover:border-info disabled:opacity-40 transition px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap"
                              >
                                {importingPlaylistId === playlist.id ? "Import…" : "+Importer"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {addMethodTab === "genre" && (
                  <>
                    <p className="text-sm text-inkMuted">
                      Choisis un genre, une époque et un nombre de morceaux : la playlist se
                      construit toute seule, tu ne sais pas d’avance ce qui va tomber.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={genreChoice}
                        onChange={(e) => setGenreChoice(e.target.value)}
                        className="bg-inkSurface2 border-2 border-inkBorder focus:border-amber outline-none transition rounded-xl px-3 py-3"
                      >
                        <option value={ALL_GENRES_KEY}>{ALL_GENRES_KEY}</option>
                        {Object.keys(GENRE_PRESETS).map((genre) => (
                          <option key={genre} value={genre}>
                            {genre}
                          </option>
                        ))}
                      </select>
                      <select
                        value={eraChoice}
                        onChange={(e) => setEraChoice(Number(e.target.value))}
                        className="bg-inkSurface2 border-2 border-inkBorder focus:border-amber outline-none transition rounded-xl px-3 py-3"
                      >
                        {ERA_OPTIONS.map((era, i) => (
                          <option key={era.label} value={i}>
                            {era.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={genreCount}
                        onChange={(e) => setGenreCount(Number(e.target.value))}
                        className="bg-inkSurface2 border-2 border-inkBorder focus:border-amber outline-none transition rounded-xl px-3 py-3 appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
                      />
                    </div>
                    <button
                      onClick={handleGenerateGenrePlaylist}
                      disabled={generatingGenrePlaylist || searchQuotaCooldownSeconds > 0}
                      className="bg-amber text-amberOn hover:bg-amber/90 disabled:opacity-60 transition px-6 py-3 rounded-xl font-bold self-start"
                    >
                      {generatingGenrePlaylist ? (
                        `Recherche… (${genrePlaylistTried} artiste(s) exploré(s))`
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <Dice5 className="w-4 h-4" /> Générer la playlist
                        </span>
                      )}
                    </button>
                    {genrePlaylistResult !== null && (
                      <p className={`text-sm ${genrePlaylistResult.error ? "text-danger" : "text-inkMuted"}`}>
                        {genrePlaylistResult.error
                          ? genrePlaylistResult.error
                          : genrePlaylistResult.foundCount >= genrePlaylistResult.requestedCount
                            ? `${genrePlaylistResult.foundCount} morceau(x) ajouté(s).`
                            : `${genrePlaylistResult.foundCount} morceau(x) trouvé(s) sur ${genrePlaylistResult.requestedCount} demandé(s) — essaie une époque plus large ou "${ALL_GENRES_KEY}" si tu en veux plus.`}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* File d'attente : toujours visible avec le bouton de
                  lancement juste dessous, pour ne jamais avoir à scroller
                  pour démarrer la partie (voir la proposition d'agencement
                  validée). Même style neutre que le panneau de gauche
                  (bg-inkSurface2/border-inkBorder) plutôt qu'un contour
                  sauge sur tout le pourtour : un contour de couleur sur les
                  4 côtés d'un panneau interne se confondait visuellement
                  avec la bordure de la carte englobante et donnait
                  l'impression que la file d'attente "sortait" de la carte
                  au lieu d'en faire partie. Un simple liseré sauge à
                  gauche suffit à la signaler comme le panneau important. */}
              <div className="relative flex flex-col gap-3 bg-inkSurface3 border border-inkBorder rounded-2xl p-4">
                <span className="absolute top-0 left-4 right-4 h-1 rounded-b-md bg-gold" />
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-white">
                    File d’attente {upcomingQueue.length > 0 && `(${upcomingQueue.length})`}
                  </h3>
                  {upcomingQueue.length > 0 && (
                    <button
                      onClick={handleClearQueue}
                      className="text-danger text-sm hover:brightness-110 transition"
                    >
                      Tout retirer
                    </button>
                  )}
                </div>
                {upcomingQueue.length === 0 ? (
                  <p className="text-sm text-inkMuted">
                    Aucun morceau pour l’instant — utilise un des onglets à gauche pour en ajouter.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {upcomingQueue.map((track, i) => (
                      <li
                        key={`${track.sourceTrackId}-${i}`}
                        draggable
                        onDragStart={handleDragStart(i)}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop(i)}
                        className="flex justify-between items-center gap-3 bg-ink rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing"
                      >
                        <span className="flex items-center gap-2 min-w-0 flex-1">
                          <GripVertical className="w-4 h-4 text-inkMuted flex-shrink-0" />
                          <span className="truncate min-w-0 flex-1">
                            {blindMode
                              ? `Morceau ${queueIndex + i + 1}`
                              : `${track.title} — ${track.artist}`}
                          </span>
                        </span>
                        <button
                          onClick={() => handleRemoveFromQueue(i)}
                          className="text-danger text-sm px-3 py-1 hover:brightness-110 transition whitespace-nowrap"
                        >
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {players.length === 0 && (
                  <p className="text-sm text-inkMuted">
                    En attente d’au moins un joueur avant de pouvoir lancer la manche.
                  </p>
                )}
                <button
                  onClick={handlePlayNextInQueue}
                  disabled={upcomingQueue.length === 0 || players.length === 0 || launchingRound}
                  className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-40 transition px-6 py-3 rounded-xl text-lg font-bold mt-1"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {!launchingRound && <Play className="w-5 h-5" />}
                    {launchingRound
                      ? "Lancement…"
                      : queueIndex === 0
                        ? `Démarrer la partie (${upcomingQueue.length} morceau(x))`
                        : `Reprendre la partie (${upcomingQueue.length} restant(s))`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {(spotifyOAuthError || spotifyPlayer.errorMessage) && (
          <p className="text-danger mt-4 break-words">
            {spotifyOAuthError ?? spotifyPlayer.errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}
