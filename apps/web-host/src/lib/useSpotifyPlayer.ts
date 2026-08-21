"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: any;
  }
}

export type SpotifyPlayerState = "checking" | "disconnected" | "connecting_player" | "ready";

// Au-delà de ce délai passé en "connecting_player" sans devenir "ready", on
// considère que ça ne se débloquera pas tout seul (voir stuckTooLong plus
// bas) — juste pour proposer un bouton "Réessayer" à l'hôte, jamais pour
// couper quoi que ce soit automatiquement.
const STUCK_THRESHOLD_MS = 12_000;

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
  // true si "connecting_player" dure depuis plus de STUCK_THRESHOLD_MS —
  // voir le bug remonté : l'écran restait parfois bloqué sur "Connexion au
  // lecteur Spotify…" sans jamais devenir "ready", et seul un rechargement
  // complet de la page en sortait. Sert uniquement à afficher un bouton
  // "Réessayer" côté host/page.tsx (voir reconnect ci-dessous) — n'annule
  // jamais rien tout seul.
  const [stuckTooLong, setStuckTooLong] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  // Référence directe à l'instance Spotify.Player, nécessaire pour pouvoir
  // appeler activateElement() (voir activateElement ci-dessous).
  const playerRef = useRef<any>(null);
  const unmountedRef = useRef(false);
  const notReadyRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enveloppées dans useCallback (et listées dans les deps de l'effet plus
  // bas) pour satisfaire react-hooks/exhaustive-deps : ce ne sont pas de
  // simples setState (stables par nature), mais des fonctions qui en
  // composent plusieurs.
  const clearStuckTimer = useCallback(() => {
    if (stuckTimeoutRef.current) {
      clearTimeout(stuckTimeoutRef.current);
      stuckTimeoutRef.current = null;
    }
  }, []);

  // Armé à chaque passage en "connecting_player" (connexion initiale, ou
  // tentative de reconnexion après un "not_ready" — voir plus bas), désarmé
  // dès que l'état change pour autre chose. setStuckTooLong(false) n'est
  // jamais rappelé automatiquement une fois passé à true : reconnect()
  // s'en charge explicitement au moment où l'hôte clique "Réessayer".
  const armStuckTimer = useCallback(() => {
    clearStuckTimer();
    stuckTimeoutRef.current = setTimeout(() => {
      if (!unmountedRef.current) setStuckTooLong(true);
    }, STUCK_THRESHOLD_MS);
  }, [clearStuckTimer]);

  const setConnectingState = useCallback(() => {
    setState("connecting_player");
    armStuckTimer();
  }, [armStuckTimer]);

  const loadWebPlaybackSdk = useCallback(() => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Blindtest — écran hôte",
        getOAuthToken: (cb: (token: string) => void) => {
          // Sans .catch() ici, un aléa réseau ponctuel sur cette requête
          // laissait le SDK attendre indéfiniment un token qui n'arrivait
          // jamais (cb() jamais appelé) — l'écran restait alors bloqué en
          // "connecting_player" pour toujours, sans le moindre message
          // d'erreur (voir le bug remonté : seul un rechargement complet de
          // la page en sortait). On retente une fois avant d'abandonner, et
          // dans tous les cas cb() finit toujours par être appelé — avec le
          // dernier token connu en dernier recours, pour laisser le SDK
          // déclencher lui-même son propre "authentication_error" (déjà
          // géré ci-dessous) plutôt que de rester muet.
          const attempt = (isRetry: boolean): void => {
            fetch("/api/spotify/token")
              .then((r) => r.json())
              .then((d) => {
                accessTokenRef.current = d.accessToken;
                cb(d.accessToken);
              })
              .catch((e) => {
                console.error("[useSpotifyPlayer] échec de récupération du token Spotify", e);
                if (!isRetry) {
                  attempt(true);
                  return;
                }
                cb(accessTokenRef.current ?? "");
              });
          };
          attempt(false);
        },
        volume: 0.8,
      });

      playerRef.current = player;

      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        clearStuckTimer();
        setStuckTooLong(false);
        setDeviceId(device_id);
        setState("ready");
      });

      // "not_ready" : le device Web Playback est tombé (mise en veille de
      // l'ordinateur, coupure réseau passagère, changement de wifi...). Le
      // SDK ne relance pas forcément la connexion tout seul — sans ce
      // retry explicite, l'écran restait bloqué en "connecting_player"
      // jusqu'au rechargement (bug remonté). connect() peut être rappelé
      // sans risque sur une instance déjà créée (voir doc Web Playback SDK).
      player.addListener("not_ready", () => {
        setConnectingState();
        if (notReadyRetryTimeoutRef.current) clearTimeout(notReadyRetryTimeoutRef.current);
        notReadyRetryTimeoutRef.current = setTimeout(() => {
          if (!unmountedRef.current) playerRef.current?.connect?.();
        }, 2000);
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
  }, [clearStuckTimer, setConnectingState]);

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
        setConnectingState();
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
      unmountedRef.current = true;
      clearStuckTimer();
      if (notReadyRetryTimeoutRef.current) clearTimeout(notReadyRetryTimeoutRef.current);
    };
  }, [clearStuckTimer, loadWebPlaybackSdk, setConnectingState]);

  // `next` (page courante, typiquement /host en pleine partie) transmis à
  // login/route.ts pour que le callback OAuth y ramène directement l'hôte
  // au lieu de le renvoyer systématiquement sur "/" (bug remonté lors de
  // l'audit navigation — voir COOKIE_NEXT dans spotifyAuth.ts).
  const connect = () => {
    window.location.href = `/api/spotify/login?next=${encodeURIComponent(window.location.pathname)}`;
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
    clearStuckTimer();
    if (notReadyRetryTimeoutRef.current) clearTimeout(notReadyRetryTimeoutRef.current);
    setStuckTooLong(false);
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

  // Échappatoire manuelle pour l'hôte (bouton "Réessayer", affiché après
  // STUCK_THRESHOLD_MS — voir stuckTooLong) : évite d'avoir à recharger
  // toute la page comme c'était le seul recours jusqu'ici. Rappelle
  // connect() sur l'instance existante si elle existe déjà (cas "not_ready"
  // qui n'a pas suffi à se rétablir tout seul), sinon relance tout le flow
  // d'initialisation depuis zéro (cas où le SDK n'a jamais réussi à créer de
  // player, ex. script bloqué/échoué au premier chargement).
  const reconnect = () => {
    setStuckTooLong(false);
    if (playerRef.current) {
      setConnectingState();
      playerRef.current.connect();
    } else {
      setConnectingState();
      loadWebPlaybackSdk();
    }
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

  return { state, deviceId, errorMessage, stuckTooLong, accessTokenRef, connect, disconnect, reconnect, activateElement };
}
