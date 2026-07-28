"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

export type SpotifyPlayerState = "checking" | "disconnected" | "connecting_player" | "ready";

/**
 * Encapsule la connexion au Web Playback SDK (device hôte du navigateur) :
 * vérifie si un compte Spotify est déjà connecté (cookies gérés par
 * apps/web-host/src/lib/spotifyAuth.ts + les routes /api/spotify/*), charge
 * le SDK si oui, et expose l'accessToken courant + le deviceId une fois prêt.
 *
 * Utilisé à la fois par la page hôte (/) pour lancer de vraies manches et
 * par /spotify-test (validation isolée).
 */
export function useSpotifyPlayer() {
  const [state, setState] = useState<SpotifyPlayerState>("checking");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  // Référence directe à l'instance Spotify.Player, nécessaire pour pouvoir
  // appeler activateElement() (voir activateElement ci-dessous).
  const playerRef = useRef<any>(null);

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

      playerRef.current = player;

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

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const res = await fetch("/api/spotify/token");
        const data = await res.json();

        if (cancelled) return;

        if (!data.connected) {
          setState("disconnected");
          return;
        }

        accessTokenRef.current = data.accessToken;
        setState("connecting_player");
        loadWebPlaybackSdk();
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : "Erreur inconnue au chargement.");
        }
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = () => {
    window.location.href = "/api/spotify/login";
  };

  // Déconnexion explicite : coupe le device Web Playback SDK côté navigateur,
  // efface les cookies de session Spotify côté serveur (route /api/spotify/logout,
  // qui existait déjà) et repasse l'état local à "disconnected" pour réafficher
  // le bouton "Se connecter". Permet de brancher un autre compte Spotify sans
  // fermer complètement l'appli : Spotify affiche alors son propre écran
  // d'autorisation avec un lien "pas vous ?" pour changer de compte (voir
  // https://developer.spotify.com/documentation/web-api/tutorials/code-flow —
  // Spotify ne propose pas de sélecteur de compte natif dans le flow PKCE,
  // c'est ce lien qui permet de switcher).
  const disconnect = async () => {
    try {
      playerRef.current?.disconnect?.();
    } catch {
      // ignore
    }
    playerRef.current = null;
    accessTokenRef.current = null;
    setDeviceId(null);
    setErrorMessage(null);

    try {
      await fetch("/api/spotify/logout", { method: "POST" });
    } catch {
      // Même si l'appel réseau échoue, on repasse quand même l'UI en
      // "disconnected" : au pire les cookies (httpOnly, expiration courte
      // pour l'access token) redeviendront invalides tout seuls.
    }

    setState("disconnected");
  };

  // Sur Safari iOS (et d'autres navigateurs mobiles), transférer la lecture
  // via l'API Spotify passe par les serveurs Spotify plutôt que par une
  // action directe du navigateur : iOS bloque alors l'audio comme s'il
  // s'agissait d'un autoplay non sollicité. Spotify fournit activateElement()
  // pour "débloquer" l'élément audio du player en le liant explicitement au
  // geste de clic en cours. À appeler en tout début du handler de clic qui
  // déclenche une lecture, avant tout await, pour rester dans la fenêtre de
  // "user gesture" que le navigateur autorise. Sans effet (et sans risque)
  // sur desktop, où cette restriction n'existe pas.
  const activateElement = () => {
    playerRef.current?.activateElement?.();
  };

  return { state, deviceId, errorMessage, accessTokenRef, connect, disconnect, activateElement };
}
