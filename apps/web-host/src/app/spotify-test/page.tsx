"use client";

// Page de test isolée pour valider le mécanisme Spotify (connexion OAuth +
// recherche + lecture complète via le Web Playback SDK). Maintenant que /
// utilise la même logique (voir lib/useSpotifyPlayer.ts), cette page reste
// utile pour tester la connexion Spotify isolément, sans dépendre d'une room.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { spotify } from "@blindtest/api-clients";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";
import { useSpotifyPlayer } from "../../lib/useSpotifyPlayer";

export default function SpotifyTestPage() {
  useForceLoopbackHost();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<spotify.SpotifyTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const player = useSpotifyPlayer();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (err) setUrlError(`Erreur Spotify : ${err}`);
    if (err || params.get("connected")) {
      window.history.replaceState({}, "", "/spotify-test");
    }
  }, []);

  const handleSearch = async () => {
    if (!player.accessTokenRef.current) return;
    try {
      const tracks = await spotify.searchTracks(query, player.accessTokenRef.current);
      setResults(tracks);
    } catch (e: any) {
      setUrlError(e?.message ?? "Recherche échouée.");
    }
  };

  const handlePlay = async (track: spotify.SpotifyTrack) => {
    if (!player.accessTokenRef.current || !player.deviceId) return;
    try {
      await spotify.playTrackOnHostDevice(track.sourceTrackId, player.deviceId, player.accessTokenRef.current);
      setNowPlaying(`${track.title} — ${track.artist}`);
    } catch (e: any) {
      setUrlError(e?.message ?? "Lecture échouée.");
    }
  };

  const errorMessage = urlError ?? player.errorMessage;

  return (
    <main className="flex flex-col items-center gap-8 min-h-screen p-10">
      <h1 className="text-3xl font-black">Test intégration Spotify</h1>

      {errorMessage && (
        <p className="text-red-400 max-w-xl text-center break-words">{errorMessage}</p>
      )}

      {player.state === "checking" && <p className="text-gray-400">Vérification de la connexion…</p>}

      {player.state === "disconnected" && (
        <button onClick={player.connect} className="bg-accent px-8 py-4 rounded-full text-xl font-bold">
          Se connecter à Spotify
        </button>
      )}

      {player.state === "connecting_player" && (
        <p className="text-gray-400">Connexion au Web Playback SDK…</p>
      )}

      {player.state === "ready" && (
        <div className="w-full max-w-xl flex flex-col gap-4">
          <p className="text-green-400 text-center">✅ Player prêt (device connecté)</p>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Chercher un morceau…"
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
                  onClick={() => handlePlay(track)}
                  className="bg-accent2 px-4 py-2 rounded-full text-sm font-bold"
                >
                  ▶ Jouer
                </button>
              </li>
            ))}
          </ul>

          {nowPlaying && <p className="text-center text-lg">🎵 En cours : {nowPlaying}</p>}
        </div>
      )}
    </main>
  );
}
