"use client";

// Page de test isolée pour valider le mécanisme Spotify (connexion OAuth +
// recherche + lecture complète via le Web Playback SDK) avant de le brancher
// dans la vraie boucle de jeu (remplacement de startTestRound). Suit le même
// principe que /play pour le buzzer : on valide un bout à la fois.
//
// IMPORTANT : à ouvrir via http://127.0.0.1:3000/spotify-test, PAS
// localhost — l'URI de redirection Spotify doit correspondre exactement à
// ce qui est enregistré dans le Dashboard développeur (127.0.0.1 obligatoire
// depuis la nouvelle politique Spotify), et les cookies de session posés
// pendant l'auth ne sont pas partagés entre localhost et 127.0.0.1.
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { spotify } from "@blindtest/api-clients";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

type ConnectionState = "checking" | "disconnected" | "connecting_player" | "ready" | "error";

export default function SpotifyTestPage() {
  const [state, setState] = useState<ConnectionState>("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<spotify.SpotifyTrack[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const loadWebPlaybackSdk = () => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Blindtest — écran hôte",
        getOAuthToken: (cb: (token: string) => void) => {
          fetch("/api/spotify/token")
            .then((r) => r.json())
            .then((d) => {
              accessTokenRef.current = d.accessToken;
              cb(d.accessToken);
            });
        },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
        setState("ready");
      });

      player.addListener("not_ready", () => {
        setState("connecting_player");
      });

      player.addListener("initialization_error", ({ message }: { message: string }) =>
        setErrorMessage(`Erreur d'initialisation du player : ${message}`)
      );
      player.addListener("authentication_error", ({ message }: { message: string }) =>
        setErrorMessage(`Erreur d'authentification : ${message}`)
      );
      player.addListener("account_error", ({ message }: { message: string }) =>
        setErrorMessage(`Erreur de compte (Premium requis) : ${message}`)
      );

      player.connect();
    };

    if (document.getElementById("spotify-player-sdk")) {
      if (window.Spotify) window.onSpotifyWebPlaybackSDKReady();
      return;
    }

    const script = document.createElement("script");
    script.id = "spotify-player-sdk";
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  };

  // Garde-fou : les cookies posés sur "localhost" sont invisibles depuis
  // "127.0.0.1" (et inversement), or l'URI de redirection Spotify est figée
  // sur 127.0.0.1 — si jamais on arrive ici via localhost, on se
  // redirige tout de suite pour éviter un "state mismatch" difficile à
  // comprendre.
  useEffect(() => {
    if (window.location.hostname === "localhost") {
      window.location.href = window.location.href.replace("localhost", "127.0.0.1");
    }
  }, []);

  // Récupère les erreurs/succès renvoyés par /api/spotify/callback dans l'URL
  // (lecture ponctuelle au montage, pas une synchronisation continue avec un
  // état externe qui changerait dans le temps — d'où le disable ciblé).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (err) setErrorMessage(`Erreur Spotify : ${err}`);
    if (err || params.get("connected")) {
      window.history.replaceState({}, "", "/spotify-test");
    }
  }, []);

  // Vérifie la connexion, puis charge le Web Playback SDK si un token existe.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const res = await fetch("/api/spotify/token");
        console.log("[debug] /api/spotify/token ->", res.status);
        const data = await res.json();
        console.log("[debug] payload:", data);

        if (cancelled) return;

        if (!data.connected) {
          setState("disconnected");
          return;
        }

        accessTokenRef.current = data.accessToken;
        setState("connecting_player");
        loadWebPlaybackSdk();
      } catch (e) {
        console.error("[debug] init() a échoué :", e);
        if (!cancelled) setErrorMessage(e instanceof Error ? e.message : "Erreur inconnue au chargement.");
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async () => {
    if (!accessTokenRef.current) return;
    try {
      const tracks = await spotify.searchTracks(query, accessTokenRef.current);
      setResults(tracks);
    } catch (e: any) {
      setErrorMessage(e?.message ?? "Recherche échouée.");
    }
  };

  const handlePlay = async (track: spotify.SpotifyTrack) => {
    if (!accessTokenRef.current || !deviceId) return;
    try {
      await spotify.playTrackOnHostDevice(track.sourceTrackId, deviceId, accessTokenRef.current);
      setNowPlaying(`${track.title} — ${track.artist}`);
    } catch (e: any) {
      setErrorMessage(e?.message ?? "Lecture échouée.");
    }
  };

  return (
    <main className="flex flex-col items-center gap-8 min-h-screen p-10">
      <h1 className="text-3xl font-black">Test intégration Spotify</h1>

      {errorMessage && (
        <p className="text-red-400 max-w-xl text-center break-words">{errorMessage}</p>
      )}

      {state === "checking" && <p className="text-gray-400">Vérification de la connexion…</p>}

      {state === "disconnected" && (
        <button
          onClick={() => { window.location.href = "/api/spotify/login"; }}
          className="bg-accent px-8 py-4 rounded-full text-xl font-bold"
        >
          Se connecter à Spotify
        </button>
      )}

      {state === "connecting_player" && (
        <p className="text-gray-400">Connexion au Web Playback SDK…</p>
      )}

      {state === "ready" && (
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
