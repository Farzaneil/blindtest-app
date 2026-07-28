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
  type Player,
  type Round,
  type RoundAttempt,
} from "../../lib/rooms";
import { withRanks } from "../../lib/ranking";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";
import {
  getSpotifyQuotaLocks,
  setSpotifyQuotaLock,
  subscribeToSpotifyQuotaLocks,
  type SpotifyQuotaLocks,
} from "../../lib/spotifyQuotaLock";
import { useSpotifyPlayer } from "../../lib/useSpotifyPlayer";

type HostMode = "gamemaster" | "player";

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

const SHARED_QUOTA_LOCK_DURATION_MS = 60 * 60 * 1000; // 1h, même valeur prudente que le coupe-circuit local

/**
 * Pose le verrou PARTAGÉ (voir spotifyQuotaLock.ts) uniquement si l'erreur
 * capturée est un 429 QUOTA_EXCEEDED confirmé (pas n'importe quelle erreur
 * réseau) — appelé depuis les catch de handleSearch / handleLoadMyPlaylists
 * / handleImportPlaylist / handleGenerateGenrePlaylist. Le "await" est
 * volontairement absent côté appelant (fire-and-forget) : un échec de
 * l'écriture Supabase ne doit pas empêcher d'afficher l'erreur Spotify
 * elle-même à l'hôte.
 */
function recordSharedQuotaLockIfNeeded(category: "search" | "playlists", error: unknown): void {
  if (!(error instanceof spotify.SpotifySearchError) || error.reason !== "QUOTA_EXCEEDED") return;
  setSpotifyQuotaLock(category, new Date(Date.now() + SHARED_QUOTA_LOCK_DURATION_MS).toISOString()).catch(
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

  const [room, setRoom] = useState<{ id: string; code: string } | null>(null);
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
  const [hostMode, setHostMode] = useState<HostMode | null>(null);
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
  const searchQuotaCooldownSeconds = secondsUntil(quotaLocks.search, quotaNowTick);
  const playlistsQuotaCooldownSeconds = secondsUntil(quotaLocks.playlists, quotaNowTick);

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
        setRoom({ id: r.id, code: r.code });
        setHostMode(null);
        setQueue([]);
        setQueueIndex(0);
        setBuildingPlaylist(true);
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
      setRoom({ id: existing.id, code: existing.code });
      setHostMode(readStoredJSON(MODE_STORAGE_KEY, null));
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
    writeStoredJSON(QUEUE_STORAGE_KEY, queue);
    writeStoredJSON(QUEUE_INDEX_STORAGE_KEY, queueIndex);
    writeStoredJSON(BUILDING_STORAGE_KEY, buildingPlaylist);
  }, [hydrated, hostMode, queue, queueIndex, buildingPlaylist]);

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
  // (canStartRound + au moins une manche déjà jouée + plus rien à venir) :
  // c'est le seul signal dont dispose /play pour savoir que la partie est
  // terminée, puisque `rounds` ne change plus une fois la dernière manche
  // jouée. Le ref évite de renvoyer la même mise à jour à chaque render tant
  // que l'écran de fin de partie reste affiché, et se réinitialise dès que
  // la partie n'est plus dans cet état (nouvelle partie, ou reprise).
  useEffect(() => {
    if (!room) return;
    const canStart = !round || round.status === "scored";
    const exhausted = canStart && queueIndex > 0 && queue.slice(queueIndex).length === 0;
    if (exhausted && !finishedRoomRef.current) {
      finishedRoomRef.current = true;
      finishRoom(room.id).catch(() => {});
    } else if (!exhausted && finishedRoomRef.current) {
      finishedRoomRef.current = false;
    }
  }, [room, round, queueIndex, queue]);

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
        timeoutRound(roundId).catch((e: any) => {
          setError(e?.message ?? "Impossible de clôturer la manche.");
        });
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
      const tracks = await spotify.searchTracks(query, spotifyPlayer.accessTokenRef.current);
      setResults(tracks);
    } catch (e: any) {
      setError(e?.message ?? "Recherche Spotify échouée.");
      recordSharedQuotaLockIfNeeded("search", e);
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
      const playlists = await spotify.listUserPlaylists(spotifyPlayer.accessTokenRef.current);
      // Tri alphabétique (insensible à la casse/accents) pour retrouver une
      // playlist facilement, plutôt que de dépendre de l'ordre renvoyé par
      // l'API Spotify (généralement : la plus récemment modifiée en premier).
      const sorted = [...playlists].sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
      );
      setMyPlaylists(sorted);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger tes playlists Spotify.");
      recordSharedQuotaLockIfNeeded("playlists", e);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleImportPlaylist = async (playlistId: string) => {
    if (!spotifyPlayer.accessTokenRef.current || playlistsQuotaCooldownSeconds > 0) return;
    setImportingPlaylistId(playlistId);
    try {
      const tracks = await spotify.getPlaylistTracks(playlistId, spotifyPlayer.accessTokenRef.current);
      // Mélangé pour qu'un hôte qui joue aussi (mode "player") ne puisse pas
      // déduire l'ordre des prochaines manches à partir de sa propre
      // playlist.
      setQueue((q) => [...q, ...shuffle(tracks)]);
    } catch (e: any) {
      setError(e?.message ?? "Impossible d’importer cette playlist.");
      recordSharedQuotaLockIfNeeded("playlists", e);
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
      setSpotifyQuotaLock("search", new Date(Date.now() + SHARED_QUOTA_LOCK_DURATION_MS).toISOString()).catch(
        () => {
          // Pas grave : le coupe-circuit local continue de protéger cette session.
        }
      );
    }
    setGeneratingGenrePlaylist(false);
  };

  const launchRound = async (track: spotify.SpotifyTrack) => {
    if (!room || !spotifyPlayer.deviceId || !spotifyPlayer.accessTokenRef.current) return;
    try {
      await spotify.playTrackOnHostDevice(
        track.sourceTrackId,
        spotifyPlayer.deviceId,
        spotifyPlayer.accessTokenRef.current
      );
      const newRound = await startRoundWithTrack(room.id, {
        sourceTrackId: track.sourceTrackId,
        title: track.title,
        artist: track.artist,
      });
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
  };

  const handleReveal = async () => {
    if (!round) return;
    try {
      await revealRound(round.id);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de révéler la réponse.");
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
    try {
      const r = await createRoom();
      writeStoredJSON(ROOM_STORAGE_KEY, { id: r.id, code: r.code });
      setRoom({ id: r.id, code: r.code });
      setHydrated(true);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de créer une nouvelle partie.");
    }
  };

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen p-10 text-center">
        <div className="max-w-md bg-surface border border-danger/40 shadow-glowDanger rounded-3xl p-8">
          <p className="text-xl text-danger font-bold mb-2">Oups</p>
          <p className="text-white/90">
            {error}
            <br />
            <span className="text-muted text-sm">
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
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-xl text-muted animate-pulse">Création de la partie…</p>
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
  const rankedPlayers = withRanks(players);
  const gameStarted = queueIndex > 0;
  const modeChosen = hostMode !== null;
  const blindMode = hostMode === "player";
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
    .filter((a) => a.points_awarded === 2 && a.reaction_seconds !== null)
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

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 md:p-10">
      <div className="text-center bg-surface border border-surfaceBorder rounded-3xl px-10 py-6 shadow-glowAccent">
        <p className="text-sm uppercase tracking-[0.3em] text-muted mb-1">
          Rejoignez la partie avec le code
        </p>
        <p className="text-6xl font-black tracking-widest text-accentSoft">{room.code}</p>
        <div className="flex justify-center gap-4 mt-3">
          <Link href="/" className="text-xs text-muted hover:text-accentSoft underline transition">
            ← Accueil
          </Link>
          <button
            onClick={handleStartNewGame}
            className="text-xs text-muted hover:text-danger underline transition"
          >
            ↻ Nouvelle partie
          </button>
        </div>
      </div>

      <div className="w-full max-w-xl bg-surface border border-surfaceBorder rounded-3xl p-6">
        <h2 className="text-2xl font-bold mb-4">Joueurs connectés ({players.length})</h2>
        <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {players.length === 0 && <li className="text-muted">En attente de joueurs…</li>}
          {gameStarted
            ? rankedPlayers.map((p) => (
                <li
                  key={p.id}
                  className="flex justify-between items-center rounded-xl px-4 py-3 text-xl bg-white/5"
                >
                  <span>
                    {p.rank}. {p.display_name}
                  </span>
                  <span className="font-bold">{p.score} pts</span>
                </li>
              ))
            : players.map((p) => (
                <li
                  key={p.id}
                  className="flex justify-between items-center rounded-xl px-4 py-3 text-xl bg-white/5"
                >
                  <span>{p.display_name}</span>
                </li>
              ))}
        </ul>
      </div>

      <div className="w-full max-w-xl">
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-sm text-muted hover:text-accentSoft underline transition"
        >
          {showHistory
            ? "▲ Masquer l’historique des manches"
            : `▼ Voir l’historique des manches (${roundHistory.length})`}
        </button>
        {showHistory && (
          <div className="mt-2 bg-surface border border-surfaceBorder rounded-3xl p-4 max-h-72 overflow-y-auto">
            {roundHistory.length === 0 ? (
              <p className="text-muted text-sm">Aucune manche jouée pour l’instant.</p>
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
                    <li key={r.id} className="bg-white/5 rounded-xl px-4 py-2 text-sm">
                      <p className="truncate font-medium">
                        {i + 1}. {r.title} — {r.artist}
                      </p>
                      {attemptsForRound.length === 0 ? (
                        <p className="text-muted">Personne n’a trouvé</p>
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
                              a.points_awarded > 0 ? "text-accentSoft" : "text-danger";
                            return (
                              <li key={a.id} className={`flex justify-between gap-3 ${colorClass}`}>
                                <span className="truncate">
                                  {attemptPlayer?.display_name ?? "Joueur"} — {label}
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

      <div className="w-full max-w-6xl text-center">
        {!canStartRound && round?.status === "playing" && (
          <div className="bg-surface border border-surfaceBorder rounded-3xl px-8 py-10 animate-pulseGlow">
            <p className="text-2xl font-bold">🎵 Manche en cours — en attente d’un buzz…</p>
            {!blindMode && (
              <p className="text-lg text-muted mt-1">
                {round.title} — {round.artist}
              </p>
            )}
            {(round.title_found || round.artist_found) && (
              <p className="text-lg text-muted mt-2">
                {round.title_found ? `✅ Titre trouvé : ${round.title}` : "🎵 Titre encore à trouver"}
                {" · "}
                {round.artist_found ? `✅ Artiste trouvé : ${round.artist}` : "🎤 Artiste encore à trouver"}
              </p>
            )}
            {timeLeft !== null && (
              <p className="text-5xl font-black mt-4 text-accentSoft tabular-nums">⏱ {timeLeft}s</p>
            )}
          </div>
        )}
        {!canStartRound && round?.status === "buzzed" && (
          <div className="flex flex-col items-center gap-4 bg-surface border border-surfaceBorder rounded-3xl px-8 py-8">
            <p className="text-3xl font-bold text-accent2Soft">
              🔔 {winner?.display_name ?? "Un joueur"} a buzzé en premier !
            </p>
            {!blindMode && (
              <p className="text-lg text-muted">
                {round.title} — {round.artist}
              </p>
            )}
            {(round.title_found || round.artist_found) && (
              <p className="text-sm text-muted">
                Déjà trouvé : {[round.title_found && "titre", round.artist_found && "artiste"]
                  .filter(Boolean)
                  .join(" et ")}
              </p>
            )}
            {blindMode ? (
              <>
                <p className="text-sm text-muted">
                  Laisse-le/la donner sa réponse à voix haute, puis révèle le titre.
                </p>
                <button
                  onClick={handleReveal}
                  className="bg-accent shadow-glowAccent hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
                >
                  👁️ Révéler la réponse
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">
                Laisse-le/la donner sa réponse à voix haute…
              </p>
            )}
          </div>
        )}
        {!canStartRound && round?.status === "revealed" && (
          <div className="flex flex-col items-center gap-4 bg-surface border border-surfaceBorder rounded-3xl px-8 py-8">
            <p className="text-3xl font-bold text-accent2Soft">
              🔔 {winner?.display_name ?? "Un joueur"} a buzzé en premier !
            </p>
            <p className="text-lg text-muted">
              {round.title} — {round.artist}
            </p>
            {round.title_found && !round.artist_found ? (
              <div className="flex gap-4">
                <button
                  onClick={() => handleJudge(false, true)}
                  className="bg-accent2 shadow-glowAccent2 hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
                >
                  ✅ Artiste trouvé
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="bg-danger shadow-glowDanger hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
                >
                  ❌ Toujours pas
                </button>
              </div>
            ) : !round.title_found && round.artist_found ? (
              <div className="flex gap-4">
                <button
                  onClick={() => handleJudge(true, false)}
                  className="bg-accent2 shadow-glowAccent2 hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
                >
                  ✅ Titre trouvé
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="bg-danger shadow-glowDanger hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
                >
                  ❌ Toujours pas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                <button
                  onClick={() => handleJudge(true, false)}
                  className="bg-accent2 shadow-glowAccent2 hover:brightness-110 transition px-4 py-3 rounded-full font-bold"
                >
                  🎵 Titre seul (+1)
                </button>
                <button
                  onClick={() => handleJudge(false, true)}
                  className="bg-accent2 shadow-glowAccent2 hover:brightness-110 transition px-4 py-3 rounded-full font-bold"
                >
                  🎤 Artiste seul (+1)
                </button>
                <button
                  onClick={() => handleJudge(true, true)}
                  className="bg-accent shadow-glowAccent hover:brightness-110 transition px-4 py-3 rounded-full font-bold"
                >
                  ✅ Les deux (+2)
                </button>
                <button
                  onClick={() => handleJudge(false, false)}
                  className="bg-danger shadow-glowDanger hover:brightness-110 transition px-4 py-3 rounded-full font-bold"
                >
                  ❌ Aucun (-1)
                </button>
              </div>
            )}
          </div>
        )}

        {isUnresolvedTimeout && round && (
          <div className="flex flex-col items-center gap-4 bg-surface border border-surfaceBorder rounded-3xl px-8 py-8">
            <p className="text-3xl font-bold text-danger">⏱ Personne n’a buzzé à temps</p>
            <p className="text-lg text-muted">
              La réponse était :{" "}
              <span className="font-bold text-accentSoft">
                {round.title} — {round.artist}
              </span>
            </p>
            <button
              onClick={() => setAcknowledgedTimeoutRoundId(round.id)}
              className="bg-accent shadow-glowAccent hover:brightness-110 transition px-6 py-3 rounded-full text-lg font-bold"
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
                className="flex-1 bg-surface hover:bg-surface/70 transition border-2 border-accent hover:shadow-glowAccent rounded-3xl px-6 py-5 text-left"
              >
                <p className="text-lg font-bold mb-1 text-accentSoft">🎙️ Maître du jeu</p>
                <p className="text-sm text-muted">
                  Tu gères la playlist et les manches mais tu ne joues pas toi-même : tu vois tous
                  les titres à l’avance.
                </p>
              </button>
              <button
                onClick={() => setHostMode("player")}
                className="flex-1 bg-surface hover:bg-surface/70 transition border-2 border-accent2 hover:shadow-glowAccent2 rounded-3xl px-6 py-5 text-left"
              >
                <p className="text-lg font-bold mb-1 text-accent2Soft">🎧 Tout le monde participe</p>
                <p className="text-sm text-muted">
                  Tu joues aussi ! Les titres et artistes de la file d’attente restent masqués,
                  révélés seulement pour valider une réponse.
                </p>
              </button>
            </div>
          </div>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "checking" && (
          <p className="text-muted">Vérification de la connexion Spotify…</p>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "disconnected" && (
          <button
            onClick={spotifyPlayer.connect}
            className="bg-accent shadow-glowAccent hover:brightness-110 transition px-8 py-4 rounded-full text-xl font-bold"
          >
            Se connecter à Spotify pour préparer une playlist
          </button>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "connecting_player" && (
          <p className="text-muted">Connexion au lecteur Spotify…</p>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && queueExhausted && !buildingPlaylist && (
          <div className="flex flex-col items-center gap-6 bg-surface border border-surfaceBorder rounded-3xl px-8 py-8">
            <p className="text-3xl font-bold text-gold">🏁 Playlist terminée !</p>

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
                    const podiumColor =
                      p.rank === 1
                        ? "border-accent bg-accent/10 text-accentSoft"
                        : p.rank === 2
                          ? "border-accent2 bg-accent2/10 text-accent2Soft"
                          : "border-danger bg-danger/10 text-danger";
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
                  <div className="bg-white/5 rounded-xl px-4 py-3 text-left">
                    <p className="text-xs text-muted">⚡ Buzzeur le plus rapide</p>
                    <p className="text-sm font-bold text-accentSoft">
                      {fastestPlayer?.display_name ?? "Joueur"} —{" "}
                      {(fastestAttempt.reaction_seconds as number).toFixed(1)}s
                    </p>
                  </div>
                )}
                {mostContestedRound && mostContestedCount > 1 && (
                  <div className="bg-white/5 rounded-xl px-4 py-3 text-left">
                    <p className="text-xs text-muted">🔥 Manche la plus disputée</p>
                    <p className="text-sm font-bold text-accentSoft">
                      {mostContestedRound.title} ({mostContestedCount} tentatives)
                    </p>
                  </div>
                )}
              </div>
            )}

            <ul className="w-full space-y-2 text-left max-h-64 overflow-y-auto pr-1">
              {rankedPlayers.map((p) => (
                <li key={p.id} className="flex justify-between rounded-xl px-4 py-3 bg-white/5">
                  <span>
                    {p.rank}. {p.display_name}
                  </span>
                  <span className="font-bold">{p.score} pts</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                resumeRoom(room.id).catch(() => {});
                setBuildingPlaylist(true);
              }}
              className="bg-accent shadow-glowAccent hover:brightness-110 transition px-6 py-3 rounded-full font-bold"
            >
              + Ajouter d’autres morceaux
            </button>
          </div>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && !queueExhausted && !buildingPlaylist && (
          <div className="flex flex-col items-center gap-4 bg-surface border border-surfaceBorder rounded-3xl px-8 py-8">
            {launchingRound ? (
              <p className="text-xl font-bold text-muted animate-pulse">Lancement de la manche…</p>
            ) : (
              <>
                <p className="text-muted">
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
              className="bg-accent2 shadow-glowAccent2 hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition px-8 py-4 rounded-full text-xl font-bold"
            >
              ▶ Manche suivante
            </button>
            {players.length === 0 && (
              <p className="text-sm text-muted">
                En attente d’au moins un joueur avant de pouvoir lancer la manche.
              </p>
            )}
            <button
              onClick={() => setBuildingPlaylist(true)}
              className="text-sm text-muted hover:text-accentSoft underline transition"
            >
              + Ajouter d’autres morceaux à la file
            </button>
          </div>
        )}

        {canStartRound && modeChosen && !isUnresolvedTimeout && spotifyPlayer.state === "ready" && buildingPlaylist && (
          <div className="flex flex-col gap-4 text-left bg-surface border border-surfaceBorder rounded-3xl p-6">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted">
                Mode : {hostMode === "gamemaster" ? "🎙️ Maître du jeu" : "🎧 Tout le monde participe"}
              </span>
              <button
                onClick={() => setHostMode(null)}
                className="text-sm text-muted hover:text-accentSoft underline transition"
              >
                Changer de mode
              </button>
            </div>

            {blindMode && (
              <p className="text-sm text-muted bg-white/5 border border-surfaceBorder rounded-xl px-4 py-3">
                Les morceaux ajoutés à la file restent masqués. Pour être surpris toi aussi,
                préfère importer une playlist entière plutôt que la recherche manuelle (chercher
                un titre te le révèle forcément).
              </p>
            )}

            {/* Coupe-circuit quota Spotify (verrou PARTAGÉ via Supabase, voir
                spotifyQuotaLock.ts) : un bandeau visible plutôt que de
                laisser l'hôte cliquer sur les boutons Spotify ci-dessous
                pour découvrir l'erreur à chaque fois. Les deux catégories
                sont indépendantes (voir le commentaire sur quotaLocks plus
                haut), donc affichées séparément : un quota dépassé sur
                l'une n'implique pas que l'autre le soit aussi. */}
            {(searchQuotaCooldownSeconds > 0 || playlistsQuotaCooldownSeconds > 0) && (
              <div className="flex flex-col gap-1 text-sm text-danger bg-danger/10 border border-danger/40 rounded-xl px-4 py-3">
                {searchQuotaCooldownSeconds > 0 && (
                  <p>
                    ⚠️ Spotify a atteint son quota de recherche — recherche manuelle et génération
                    par genre en pause. Nouvelle tentative possible dans environ{" "}
                    {formatCooldownDuration(searchQuotaCooldownSeconds)}.
                  </p>
                )}
                {playlistsQuotaCooldownSeconds > 0 && (
                  <p>
                    ⚠️ Spotify a atteint son quota pour les playlists — chargement et import en
                    pause. Nouvelle tentative possible dans environ{" "}
                    {formatCooldownDuration(playlistsQuotaCooldownSeconds)}.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-3 bg-white/5 border border-surfaceBorder rounded-2xl p-4">
                <h3 className="font-bold text-accentSoft">🔍 Recherche manuelle</h3>
                <p className="text-sm text-muted">Ajoute un morceau précis à la file, un par un.</p>
                <div className="flex gap-2 mt-auto">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Titre, artiste…"
                    disabled={searchQuotaCooldownSeconds > 0}
                    className="flex-1 min-w-0 bg-white/5 border-2 border-accent focus:shadow-glowAccent outline-none transition rounded-xl px-4 py-3 disabled:opacity-60"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searchQuotaCooldownSeconds > 0}
                    className="bg-accent shadow-glowAccent hover:brightness-110 disabled:opacity-60 disabled:shadow-none transition px-6 py-3 rounded-xl font-bold whitespace-nowrap"
                  >
                    Chercher
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-white/5 border border-surfaceBorder rounded-2xl p-4">
                <h3 className="font-bold text-accent2Soft">📻 Importer une playlist</h3>
                <p className="text-sm text-muted">
                  Ajoute tous les morceaux d’une de tes playlists Spotify d’un coup.
                </p>
                <button
                  onClick={handleLoadMyPlaylists}
                  disabled={loadingPlaylists || myPlaylists !== null || playlistsQuotaCooldownSeconds > 0}
                  className="mt-auto bg-accent2 shadow-glowAccent2 hover:brightness-110 disabled:opacity-60 disabled:shadow-none transition px-6 py-3 rounded-xl font-bold"
                >
                  {myPlaylists !== null
                    ? "Playlists chargées ✓"
                    : loadingPlaylists
                      ? "Chargement…"
                      : "Charger mes playlists Spotify"}
                </button>
              </div>
            </div>

            {/* Génération de playlist "à l'aveugle" : contrairement aux 2
                options ci-dessus (recherche, import direct), l'hôte ne voit
                jamais les morceaux se choisir un par un — il pose 3
                paramètres et la playlist apparaît déjà faite, ce qui garde
                la surprise même pour lui s'il joue aussi (voir
                handleGenerateGenrePlaylist). */}
            <div className="flex flex-col gap-3 bg-white/5 border border-surfaceBorder rounded-2xl p-4">
              <h3 className="font-bold text-gold">🎲 Générer une playlist par genre</h3>
              <p className="text-sm text-muted">
                Choisis un genre, une époque et un nombre de morceaux : la playlist se construit
                toute seule, tu ne sais pas d’avance ce qui va tomber.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={genreChoice}
                  onChange={(e) => setGenreChoice(e.target.value)}
                  className="bg-white/5 border-2 border-gold/60 focus:shadow-glowGold outline-none transition rounded-xl px-3 py-3"
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
                  className="bg-white/5 border-2 border-gold/60 focus:shadow-glowGold outline-none transition rounded-xl px-3 py-3"
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
                  className="bg-white/5 border-2 border-gold/60 focus:shadow-glowGold outline-none transition rounded-xl px-3 py-3"
                />
              </div>
              <button
                onClick={handleGenerateGenrePlaylist}
                disabled={generatingGenrePlaylist || searchQuotaCooldownSeconds > 0}
                className="mt-auto bg-gold text-background shadow-glowGold hover:brightness-110 disabled:opacity-60 disabled:shadow-none transition px-6 py-3 rounded-xl font-bold"
              >
                {generatingGenrePlaylist
                  ? `Recherche… (${genrePlaylistTried} artiste(s) exploré(s))`
                  : "🎲 Générer la playlist"}
              </button>
              {genrePlaylistResult !== null && (
                <p className={`text-sm ${genrePlaylistResult.error ? "text-danger" : "text-muted"}`}>
                  {genrePlaylistResult.error
                    ? `⚠️ ${genrePlaylistResult.error}`
                    : genrePlaylistResult.foundCount >= genrePlaylistResult.requestedCount
                      ? `✅ ${genrePlaylistResult.foundCount} morceau(x) ajouté(s).`
                      : `${genrePlaylistResult.foundCount} morceau(x) trouvé(s) sur ${genrePlaylistResult.requestedCount} demandé(s) — essaie une époque plus large ou "${ALL_GENRES_KEY}" si tu en veux plus.`}
                </p>
              )}
            </div>

            {results.length > 0 && (
              <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {results.map((track) => (
                  <li
                    key={track.sourceTrackId}
                    className="flex justify-between items-center bg-white/5 rounded-xl px-4 py-3"
                  >
                    <span>
                      {track.title} — {track.artist}
                    </span>
                    <button
                      onClick={() => handleAddToQueue(track)}
                      className="bg-accent shadow-glowAccent hover:brightness-110 transition px-4 py-2 rounded-full text-sm font-bold"
                    >
                      + Ajouter à la playlist
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {myPlaylists !== null && myPlaylists.length === 0 && (
              <p className="text-sm text-muted">Aucune playlist trouvée sur ton compte Spotify.</p>
            )}

            {/* Playlists Spotify à importer et file d'attente du jeu côte à
                côte (plutôt qu'empilées verticalement) : les deux restent
                visibles en même temps sans avoir à faire défiler l'une pour
                voir l'autre, ce qui aide surtout quand on veut piocher dans
                une playlist tout en gardant un œil sur ce qui est déjà dans
                la file. Grille à une seule colonne sur mobile (pas assez de
                largeur pour deux colonnes lisibles). */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myPlaylists !== null && myPlaylists.length > 0 && (
                <div>
                  <h3 className="font-bold mb-2 text-accent2Soft">
                    Tes playlists Spotify
                  </h3>
                  <div className="max-h-64 overflow-y-auto pr-1">
                    <ul className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 items-center">
                      {myPlaylists.map((playlist) => (
                        <li key={playlist.id} className="contents">
                          <span className="bg-white/5 rounded-xl px-4 py-3 truncate">
                            {playlist.name}{" "}
                            <span className="text-muted">({playlist.trackCount} morceaux)</span>
                          </span>
                          <button
                            onClick={() => handleImportPlaylist(playlist.id)}
                            disabled={importingPlaylistId === playlist.id || playlistsQuotaCooldownSeconds > 0}
                            className="bg-accent2 shadow-glowAccent2 hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
                          >
                            {importingPlaylistId === playlist.id ? "Import…" : "+Importer"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {upcomingQueue.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-accentSoft">
                      Playlist ({upcomingQueue.length} morceau(x) à venir)
                    </h3>
                    <button
                      onClick={handleClearQueue}
                      className="text-danger text-sm hover:brightness-110 transition"
                    >
                      Tout retirer
                    </button>
                  </div>
                  <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {upcomingQueue.map((track, i) => (
                      <li
                        key={`${track.sourceTrackId}-${i}`}
                        draggable
                        onDragStart={handleDragStart(i)}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop(i)}
                        className="flex justify-between items-center gap-3 bg-white/5 rounded-xl px-4 py-3 cursor-grab active:cursor-grabbing"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-muted select-none">⠿</span>
                          <span className="truncate">
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
                </div>
              )}
            </div>

            {players.length === 0 && (
              <p className="text-sm text-muted">
                En attente d’au moins un joueur avant de pouvoir lancer la manche.
              </p>
            )}
            <button
              onClick={handlePlayNextInQueue}
              disabled={upcomingQueue.length === 0 || players.length === 0 || launchingRound}
              className="bg-accent shadow-glowAccent hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition px-8 py-4 rounded-full text-xl font-bold mt-2"
            >
              {launchingRound
                ? "Lancement…"
                : queueIndex === 0
                  ? `▶ Démarrer la partie (${upcomingQueue.length} morceau(x))`
                  : `▶ Reprendre la partie (${upcomingQueue.length} restant(s))`}
            </button>
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
