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
  type Player,
  type Round,
} from "../lib/rooms";
import { useForceLoopbackHost } from "../lib/useForceLoopbackHost";
import { useSpotifyPlayer } from "../lib/useSpotifyPlayer";

/**
 * Écran hôte / "TV". Nécessite maintenant un compte Spotify Premium
 * connecté sur cet onglet (voir lib/useSpotifyPlayer.ts) pour choisir et
 * lancer un vrai morceau à chaque manche — d'où le garde-fou 127.0.0.1.
 */
export default function HostScreen() {
  useForceLoopbackHost();

  const [room, setRoom] = useState<{ id: string; code: string } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<spotify.SpotifyTrack[]>([]);

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

  // Coupe le son dès qu'un joueur buzze — une seule fois par manche.
  useEffect(() => {
    if (
      round?.status === "buzzed" &&
      round.id !== pausedForRoundId.current &&
      spotifyPlayer.deviceId &&
      spotifyPlayer.accessTokenRef.current
    ) {
      pausedForRoundId.current = round.id;
      spotify.pausePlayback(spotifyPlayer.deviceId, spotifyPlayer.accessTokenRef.current).catch(() => {
        // Pas grave si la pause échoue (ex: token expiré) : le morceau
        // continue mais le buzz est déjà résolu côté base.
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

  const handleStartRound = async (track: spotify.SpotifyTrack) => {
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
      setResults([]);
      setQuery("");
    } catch (e: any) {
      setError(e?.message ?? "Impossible de lancer la manche.");
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
          {players.map((p) => (
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
        {!canStartRound && round?.status !== "playing" && (
          <p className="text-3xl font-bold text-accent2">
            🔔 {winner?.display_name ?? "Un joueur"} a buzzé en premier !
          </p>
        )}

        {canStartRound && spotifyPlayer.state === "checking" && (
          <p className="text-gray-400">Vérification de la connexion Spotify…</p>
        )}

        {canStartRound && spotifyPlayer.state === "disconnected" && (
          <button
            onClick={spotifyPlayer.connect}
            className="bg-accent px-8 py-4 rounded-full text-xl font-bold"
          >
            Se connecter à Spotify pour lancer une manche
          </button>
        )}

        {canStartRound && spotifyPlayer.state === "connecting_player" && (
          <p className="text-gray-400">Connexion au lecteur Spotify…</p>
        )}

        {canStartRound && spotifyPlayer.state === "ready" && (
          <div className="flex flex-col gap-4 text-left">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Chercher un morceau à faire deviner…"
                className="flex-1 bg-white/5 border-2 border-accent rounded-xl px-4 py-3"
              />
              <button onClick={handleSearch} className="bg-accent px-6 py-3 rounded-xl font-bold">
                Chercher
              </button>
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
                    onClick={() => handleStartRound(track)}
                    className="bg-accent2 px-4 py-2 rounded-full text-sm font-bold"
                  >
                    ▶ Lancer cette manche
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {spotifyPlayer.errorMessage && (
          <p className="text-red-400 mt-4 break-words">{spotifyPlayer.errorMessage}</p>
        )}
      </div>
    </main>
  );
}
