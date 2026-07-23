"use client";

// Page volontairement non pré-générée statiquement : elle crée une
// nouvelle partie à chaque chargement, ça n'a pas de sens de la figer
// au moment du build.
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { spotify } from "@blindtest/api-clients";
import {
  createRoom,
  subscribeToPlayers,
  subscribeToRounds,
  startRoundWithTrack,
  resolveRound,
  type Player,
  type Round,
} from "../lib/rooms";
import { useForceLoopbackHost } from "../lib/useForceLoopbackHost";
import { useSpotifyPlayer } from "../lib/useSpotifyPlayer";

type HostMode = "gamemaster" | "player";

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
 * La file d'attente (queue) est volontairement gardée en mémoire côté
 * client (pas persistée dans la table `playlists`, qui existe dans le
 * schéma mais reste verrouillée par RLS pour l'instant) : ça reste
 * cohérent avec le fait que la page recrée une room à chaque chargement,
 * et évite d'ouvrir une nouvelle policy RLS pour ce premier incrément.
 * À revoir si on veut un jour pouvoir réutiliser une playlist entre
 * plusieurs parties.
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
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<spotify.SpotifyTrack[]>([]);
  const [hostMode, setHostMode] = useState<HostMode | null>(null);
  const [spotifyOAuthError, setSpotifyOAuthError] = useState<string | null>(null);

  // File d'attente : les morceaux d'indice < queueIndex ont déjà été joués,
  // ceux à partir de queueIndex restent à venir.
  const [queue, setQueue] = useState<spotify.SpotifyTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [buildingPlaylist, setBuildingPlaylist] = useState(true);
  const [myPlaylists, setMyPlaylists] = useState<spotify.SpotifyPlaylistSummary[] | null>(null);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [importingPlaylistId, setImportingPlaylistId] = useState<string | null>(null);

  const spotifyPlayer = useSpotifyPlayer();
  const pausedForRoundId = useRef<string | null>(null);

  useEffect(() => {
    createRoom()
      .then((r) => setRoom({ id: r.id, code: r.code }))
      .catch((e) => setError(e?.message ?? "Erreur de connexion à Supabase"));
  }, []);

  useEffect(() => {
    if (!room) return;
    const unsubPlayers = subscribeToPlayers(room.id, setPlayers);
    const unsubRounds = subscribeToRounds(room.id, setRound);
    return () => {
      unsubPlayers();
      unsubRounds();
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

  // Coupe le son dès qu'un joueur buzze — une seule fois par manche (le ref
  // évite de rappeler pausePlayback à chaque re-render tant que la manche
  // reste au statut "buzzed").
  useEffect(() => {
    if (
      round?.status === "buzzed" &&
      round.id !== pausedForRoundId.current &&
      spotifyPlayer.deviceId &&
      spotifyPlayer.accessTokenRef.current
    ) {
      pausedForRoundId.current = round.id;
      spotify.pausePlayback(spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef.current).catch(() => {
        // Pas grave si la pause échoue (ex: token expiré entre-temps) : le
        // morceau continue mais le buzz est déjà résolu côté base.
      });
    }
  }, [round, spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef]);

  const handleSearch = async () => {
    if (!spotifyPlayer.accessTokenRef.current) return;
    try {
      const tracks = await spotify.searchTracks(query, spotifyPlayer.accessTokenRef.current);
      setResults(tracks);
    } catch (e: any) {
      setError(e?.message ?? "Recherche Spotify échouée.");
    }
  };

  const handleAddToQueue = (track: spotify.SpotifyTrack) => {
    setQueue((q) => [...q, track]);
  };

  const handleRemoveFromQueue = (upcomingIndex: number) => {
    const realIndex = queueIndex + upcomingIndex;
    setQueue((q) => q.filter((_, i) => i !== realIndex));
  };

  const handleLoadMyPlaylists = async () => {
    if (!spotifyPlayer.accessTokenRef.current) return;
    setLoadingPlaylists(true);
    try {
      const playlists = await spotify.listUserPlaylists(spotifyPlayer.accessTokenRef.current);
      setMyPlaylists(playlists);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de charger tes playlists Spotify.");
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleImportPlaylist = async (playlistId: string) => {
    if (!spotifyPlayer.accessTokenRef.current) return;
    setImportingPlaylistId(playlistId);
    try {
      const tracks = await spotify.getPlaylistTracks(playlistId, spotifyPlayer.accessTokenRef.current);
      // Mélangé pour qu'un hôte qui joue aussi (mode "player") ne puisse pas
      // déduire l'ordre des prochaines manches à partir de sa propre
      // playlist.
      setQueue((q) => [...q, ...shuffle(tracks)]);
    } catch (e: any) {
      setError(e?.message ?? "Impossible d’importer cette playlist.");
    } finally {
      setImportingPlaylistId(null);
    }
  };

  const launchRound = async (track: spotify.SpotifyTrack) => {
    if (!room || !spotifyPlayer.deviceId || !spotifyPlayer.accessTokenRef.current) return;
    try {
      await spotify.playTrackOnHostDevice(
        track.sourceTrackId,
        spotifyPlayer.deviceId,
        spotifyPlayer.accessTokenRef.current
      );
      await startRoundWithTrack(room.id, {
        sourceTrackId: track.sourceTrackId,
        title: track.title,
        artist: track.artist,
      });
    } catch (e: any) {
      setError(e?.message ?? "Impossible de lancer la manche.");
    }
  };

  // Un seul bouton pour "démarrer la partie" ET "manche suivante" : les deux
  // font exactement la même chose (jouer le prochain morceau de la file),
  // seul le libellé affiché change selon qu'on a déjà commencé ou non.
  //
  // Le mélange de la portion "à venir" ne doit se faire qu'UNE SEULE FOIS,
  // au moment précis où on quitte la phase de construction (buildingPlaylist
  // true -> false) : c'est ce qui garantit un ordre vraiment aléatoire même
  // en combinant plusieurs imports/ajouts manuels. Le remélanger à chaque
  // clic (comme avant) cassait la cohérence avec l'aperçu "manche à venir"
  // déjà affiché à l'écran en mode "Maître du jeu" : le morceau annoncé et
  // celui réellement joué pouvaient différer. Une fois la partie lancée
  // (buildingPlaylist déjà false), on se contente d'avancer dans l'ordre
  // déjà déterminé et déjà prévisualisé.
  const handlePlayNextInQueue = async () => {
    if (queueIndex >= queue.length) return;
    if (players.length === 0) return; // pas de joueur = personne ne peut buzzer, le jeu resterait bloqué

    // Doit être appelé de façon synchrone, tout en haut du handler de clic
    // (avant le moindre await), pour rester dans la fenêtre de "user
    // gesture" qu'iOS Safari exige avant d'autoriser l'audio — voir le
    // commentaire dans useSpotifyPlayer.ts.
    spotifyPlayer.activateElement();

    let effectiveQueue = queue;
    if (buildingPlaylist) {
      const played = queue.slice(0, queueIndex);
      const remaining = shuffle(queue.slice(queueIndex));
      effectiveQueue = [...played, ...remaining];
      setQueue(effectiveQueue);
    }

    await launchRound(effectiveQueue[queueIndex]);
    setQueueIndex((i) => i + 1);
    setBuildingPlaylist(false);
  };

  const handleResolve = async (correct: boolean) => {
    if (!round) return;
    try {
      await resolveRound(round.id, correct);
    } catch (e: any) {
      setError(e?.message ?? "Impossible de valider la manche.");
    }
  };

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen p-10 text-center">
        <p className="text-xl text-red-400">
          {error}
          <br />
          Vérifie que apps/web-host/.env.local contient bien NEXT_PUBLIC_SUPABASE_URL et
          NEXT_PUBLIC_SUPABASE_ANON_KEY, puis relance `npm run web-host`.
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-xl text-gray-400">Création de la partie…</p>
      </main>
    );
  }

  const winner = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;

  const canStartRound = !round || round.status === "revealed" || round.status === "scored";
  const upcomingQueue = queue.slice(queueIndex);
  const queueExhausted = canStartRound && queueIndex > 0 && upcomingQueue.length === 0;
  const rankedPlayers = [...players].sort((a, b) => b.score - a.score);
  const modeChosen = hostMode !== null;
  const blindMode = hostMode === "player";

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-10 p-10">
      <div className="text-center">
        <p className="text-lg text-gray-400">Rejoignez la partie avec le code</p>
        <p className="text-6xl font-black tracking-widest text-accent">{room.code}</p>
      </div>

      <div className="w-full max-w-xl">
        <h2 className="text-2xl font-bold mb-4">Joueurs connectés ({players.length})</h2>
        <ul className="space-y-2">
          {players.length === 0 && <li className="text-gray-500">En attente de joueurs…</li>}
          {rankedPlayers.map((p) => (
            <li
              key={p.id}
              className="flex justify-between bg-white/5 rounded-lg px-4 py-3 text-xl"
            >
              <span>{p.display_name}</span>
              <span className="font-bold">{p.score} pts</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full max-w-xl text-center">
        {!canStartRound && round?.status === "playing" && (
          <p className="text-2xl">🎵 Manche en cours — en attente d’un buzz…</p>
        )}
        {!canStartRound && round?.status === "buzzed" && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-3xl font-bold text-accent2">
              🔔 {winner?.display_name ?? "Un joueur"} a buzzé en premier !
            </p>
            <p className="text-lg text-gray-400">
              {round.title} — {round.artist}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleResolve(true)}
                className="bg-green-600 px-6 py-3 rounded-full text-lg font-bold"
              >
                ✅ Bonne réponse
              </button>
              <button
                onClick={() => handleResolve(false)}
                className="bg-red-600 px-6 py-3 rounded-full text-lg font-bold"
              >
                ❌ Mauvaise réponse
              </button>
            </div>
          </div>
        )}

        {canStartRound && !modeChosen && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-2xl font-bold">Comment veux-tu jouer cette partie ?</p>
            <div className="flex flex-col md:flex-row gap-4 w-full">
              <button
                onClick={() => setHostMode("gamemaster")}
                className="flex-1 bg-white/5 border-2 border-accent rounded-xl px-6 py-5 text-left"
              >
                <p className="text-lg font-bold mb-1">🎙️ Maître du jeu</p>
                <p className="text-sm text-gray-400">
                  Tu gères la playlist et les manches mais tu ne joues pas toi-même : tu vois tous
                  les titres à l’avance.
                </p>
              </button>
              <button
                onClick={() => setHostMode("player")}
                className="flex-1 bg-white/5 border-2 border-accent2 rounded-xl px-6 py-5 text-left"
              >
                <p className="text-lg font-bold mb-1">🎧 Tout le monde participe</p>
                <p className="text-sm text-gray-400">
                  Tu joues aussi ! Les titres et artistes de la file d’attente restent masqués,
                  révélés seulement pour valider une réponse.
                </p>
              </button>
            </div>
          </div>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "checking" && (
          <p className="text-gray-400">Vérification de la connexion Spotify…</p>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "disconnected" && (
          <button
            onClick={spotifyPlayer.connect}
            className="bg-accent px-8 py-4 rounded-full text-xl font-bold"
          >
            Se connecter à Spotify pour préparer une playlist
          </button>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "connecting_player" && (
          <p className="text-gray-400">Connexion au lecteur Spotify…</p>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "ready" && queueExhausted && !buildingPlaylist && (
          <div className="flex flex-col items-center gap-6">
            <p className="text-3xl font-bold text-accent2">🏁 Playlist terminée !</p>
            <ul className="w-full space-y-2 text-left">
              {rankedPlayers.map((p, i) => (
                <li key={p.id} className="flex justify-between bg-white/5 rounded-lg px-4 py-3">
                  <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {p.display_name}</span>
                  <span className="font-bold">{p.score} pts</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setBuildingPlaylist(true)}
              className="bg-accent px-6 py-3 rounded-full font-bold"
            >
              + Ajouter d’autres morceaux
            </button>
          </div>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "ready" && !queueExhausted && !buildingPlaylist && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-400">
              Manche {queueIndex + 1} / {queue.length} à venir :
            </p>
            <p className="text-xl font-bold">
              {blindMode
                ? `Morceau ${queueIndex + 1}`
                : `${upcomingQueue[0]?.title} — ${upcomingQueue[0]?.artist}`}
            </p>
            <button
              onClick={handlePlayNextInQueue}
              disabled={players.length === 0}
              className="bg-accent2 disabled:opacity-40 px-8 py-4 rounded-full text-xl font-bold"
            >
              ▶ Manche suivante
            </button>
            {players.length === 0 && (
              <p className="text-sm text-gray-500">
                En attente d’au moins un joueur avant de pouvoir lancer la manche.
              </p>
            )}
            <button
              onClick={() => setBuildingPlaylist(true)}
              className="text-sm text-gray-400 underline"
            >
              + Ajouter d’autres morceaux à la file
            </button>
          </div>
        )}

        {canStartRound && modeChosen && spotifyPlayer.state === "ready" && buildingPlaylist && (
          <div className="flex flex-col gap-4 text-left">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">
                Mode : {hostMode === "gamemaster" ? "🎙️ Maître du jeu" : "🎧 Tout le monde participe"}
              </span>
              <button
                onClick={() => setHostMode(null)}
                className="text-sm text-gray-400 underline"
              >
                Changer de mode
              </button>
            </div>

            {blindMode && (
              <p className="text-sm text-gray-400 bg-white/5 rounded-lg px-4 py-3">
                🙈 Les morceaux ajoutés à la file restent masqués. Pour être surpris toi aussi,
                préfère importer une playlist entière plutôt que la recherche manuelle (chercher
                un titre te le révèle forcément).
              </p>
            )}

            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Chercher un morceau à ajouter à la playlist…"
                className="flex-1 bg-white/5 border-2 border-accent rounded-xl px-4 py-3"
              />
              <button onClick={handleSearch} className="bg-accent px-6 py-3 rounded-xl font-bold">
                Chercher
              </button>
            </div>

            <div className="border-t border-white/10 pt-4">
              {myPlaylists === null && (
                <button
                  onClick={handleLoadMyPlaylists}
                  disabled={loadingPlaylists}
                  className="text-sm underline text-gray-300 disabled:opacity-40"
                >
                  {loadingPlaylists ? "Chargement…" : "Ou importer une de tes playlists Spotify"}
                </button>
              )}

              {myPlaylists !== null && myPlaylists.length === 0 && (
                <p className="text-sm text-gray-500">Aucune playlist trouvée sur ton compte Spotify.</p>
              )}

              {myPlaylists !== null && myPlaylists.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {myPlaylists.map((playlist) => (
                    <li
                      key={playlist.id}
                      className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-3"
                    >
                      <span>
                        {playlist.name}{" "}
                        <span className="text-gray-500">({playlist.trackCount} morceaux)</span>
                      </span>
                      <button
                        onClick={() => handleImportPlaylist(playlist.id)}
                        disabled={importingPlaylistId === playlist.id}
                        className="bg-accent2 disabled:opacity-40 px-4 py-2 rounded-full text-sm font-bold"
                      >
                        {importingPlaylistId === playlist.id ? "Import…" : "+ Importer toute la playlist"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ul className="flex flex-col gap-2">
              {results.map((track) => (
                <li
                  key={track.sourceTrackId}
                  className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-3"
                >
                  <span>
                    {track.title} — {track.artist}
                  </span>
                  <button
                    onClick={() => handleAddToQueue(track)}
                    className="bg-accent2 px-4 py-2 rounded-full text-sm font-bold"
                  >
                    + Ajouter à la playlist
                  </button>
                </li>
              ))}
            </ul>

            {upcomingQueue.length > 0 && (
              <div className="mt-4">
                <h3 className="font-bold mb-2">Playlist ({upcomingQueue.length} morceau(x) à venir)</h3>
                <ul className="flex flex-col gap-2">
                  {upcomingQueue.map((track, i) => (
                    <li
                      key={`${track.sourceTrackId}-${i}`}
                      className="flex justify-between items-center bg-white/5 rounded-lg px-4 py-3"
                    >
                      <span>
                        {blindMode
                          ? `Morceau ${queueIndex + i + 1}`
                          : `${track.title} — ${track.artist}`}
                      </span>
                      <button
                        onClick={() => handleRemoveFromQueue(i)}
                        className="text-red-400 text-sm px-3 py-1"
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {players.length === 0 && (
              <p className="text-sm text-gray-500">
                En attente d’au moins un joueur avant de pouvoir lancer la manche.
              </p>
            )}
            <button
              onClick={handlePlayNextInQueue}
              disabled={upcomingQueue.length === 0 || players.length === 0}
              className="bg-accent disabled:opacity-40 px-8 py-4 rounded-full text-xl font-bold mt-2"
            >
              {queueIndex === 0
                ? `▶ Démarrer la partie (${upcomingQueue.length} morceau(x))`
                : `▶ Reprendre la partie (${upcomingQueue.length} restant(s))`}
            </button>
          </div>
        )}

        {(spotifyOAuthError || spotifyPlayer.errorMessage) && (
          <p className="text-red-400 mt-4 break-words">
            {spotifyOAuthError ?? spotifyPlayer.errorMessage}
          </p>
        )}
      </div>
    </main>
  );
}
