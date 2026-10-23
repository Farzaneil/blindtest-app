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

// Player Web Playback partagé au niveau du module (un seul par onglet) :
// il survit aux navigations côté client (/host -> / -> /host sans
// rechargement). Bug remonté : recréer un player au retour sur /host
// pendant que l'ancien se déconnectait faisait disparaître le device côté
// Spotify ("device introuvable" au morceau suivant), le SDK réutilisant le
// même device_id pour l'onglet. On garde donc la même instance et on se
// contente de rebrancher les écouteurs du composant qui la (ré)utilise.
type SharedPlayer = { player: any; deviceId: string | null; tokenRef: { current: string | null } | null };
// Rangé sur window (et non dans une simple variable de module) pour
// survivre aussi au rechargement à chaud du code en développement, qui
// sinon "oubliait" le player encore connecté et en recréait un second qui
// ne devenait jamais prêt.
const shared: SharedPlayer = (() => {
  if (typeof window === "undefined") return { player: null, deviceId: null, tokenRef: null };
  const w = window as unknown as { __blindtestSpotifyPlayer?: SharedPlayer };
  w.__blindtestSpotifyPlayer ??= {
    player: null,
    deviceId: null,
    // Ref d'access token du montage courant : getOAuthToken (closure du
    // montage qui a créé le player) écrit toujours dans celle-ci.
    tokenRef: null,
  };
  return w.__blindtestSpotifyPlayer;
})();

// Délai entre la déconnexion de l'ancien player et la création du nouveau
// lors d'un "Réessayer" : laisse à Spotify le temps de retirer l'ancien
// device avant d'enregistrer le nouveau (même device_id pour l'onglet).
const RECONNECT_DELAY_MS = 1500;

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
  const playerRef = useRef<any>(shared.player);
  // Écouteurs posés par CE montage sur le player partagé (retirés au démontage).
  const listenersRef = useRef<[string, (arg: any) => void][]>([]);
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

  // Branche les écouteurs de CE montage sur le player (partagé).
  const attachListeners = useCallback(
    (player: any) => {
      const listeners: [string, (arg: any) => void][] = [
        [
          "ready",
          ({ device_id }: { device_id: string }) => {
            shared.deviceId = device_id;
            clearStuckTimer();
            setStuckTooLong(false);
            setDeviceId(device_id);
            setState("ready");
          },
        ],
        [
          // "not_ready" : le device Web Playback est tombé (mise en veille de
          // l'ordinateur, coupure réseau passagère, changement de wifi...). Le
          // SDK ne relance pas forcément la connexion tout seul — sans ce
          // retry explicite, l'écran restait bloqué en "connecting_player"
          // jusqu'au rechargement (bug remonté). connect() peut être rappelé
          // sans risque sur une instance déjà créée (voir doc Web Playback SDK).
          "not_ready",
          () => {
            shared.deviceId = null;
            setConnectingState();
            if (notReadyRetryTimeoutRef.current) clearTimeout(notReadyRetryTimeoutRef.current);
            notReadyRetryTimeoutRef.current = setTimeout(() => {
              if (!unmountedRef.current) playerRef.current?.connect?.();
            }, 2000);
          },
        ],
        ["initialization_error", ({ message }: { message: string }) => setErrorMessage(`Erreur d'initialisation du player : ${message}`)],
        ["authentication_error", ({ message }: { message: string }) => setErrorMessage(`Erreur d'authentification : ${message}`)],
        ["account_error", ({ message }: { message: string }) => setErrorMessage(`Erreur de compte (Premium requis) : ${message}`)],
      ];
      for (const [event, cb] of listeners) player.addListener(event, cb);
      listenersRef.current = listeners;
    },
    [clearStuckTimer, setConnectingState]
  );

  const loadWebPlaybackSdk = useCallback(() => {
    shared.tokenRef = accessTokenRef;
    // Player déjà créé par un montage précédent dans cet onglet : on le
    // réutilise tel quel.
    if (shared.player) {
      playerRef.current = shared.player;
      attachListeners(shared.player);
      if (shared.deviceId) {
        clearStuckTimer();
        setDeviceId(shared.deviceId);
        setState("ready");
      } else {
        shared.player.connect();
      }
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (shared.player) return;
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
                (shared.tokenRef ?? accessTokenRef).current = d.accessToken;
                cb(d.accessToken);
              })
              .catch((e) => {
                console.error("[useSpotifyPlayer] échec de récupération du token Spotify", e);
                if (!isRetry) {
                  attempt(true);
                  return;
                }
                cb((shared.tokenRef ?? accessTokenRef).current ?? "");
              });
          };
          attempt(false);
        },
        volume: 0.8,
      });

      shared.player = player;
      playerRef.current = player;
      attachListeners(player);
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
  }, [attachListeners, clearStuckTimer]); // accessTokenRef : ref stable

  useEffect(() => {
    let cancelled = false;
    // Remis à false à chaque montage (le double montage du mode strict de
    // React en dev réutilise la même ref après un premier démontage).
    unmountedRef.current = false;

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
      // On quitte la page : le player partagé reste connecté (voir
      // `shared`), on retire seulement nos écouteurs et on coupe le son
      // pour que la musique ne continue pas sur l'accueil.
      const player = playerRef.current;
      if (player) {
        for (const [event, cb] of listenersRef.current) {
          try {
            player.removeListener?.(event, cb);
          } catch {
            // ignore
          }
        }
        listenersRef.current = [];
        player.pause?.().catch?.(() => {});
      }
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
    shared.player = null;
    shared.deviceId = null;
    listenersRef.current = [];
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
  // Bug remonté : rappeler connect() sur un player déjà "connecté" côté SDK
  // ne redéclenche jamais "ready", donc le bouton ne débloquait rien. On
  // repart désormais de zéro : déconnexion propre de l'ancien player, petit
  // délai, puis création d'un nouveau. Après un échec, l'hôte se voit aussi
  // proposer de recharger la page (reconnectAttempts).
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnect = () => {
    setStuckTooLong(false);
    setReconnectAttempts((n) => n + 1);
    setErrorMessage(null);
    setConnectingState();
    const old = shared.player;
    if (old) {
      for (const [event, cb] of listenersRef.current) {
        try {
          old.removeListener?.(event, cb);
        } catch {
          // ignore
        }
      }
      listenersRef.current = [];
      try {
        old.disconnect?.();
      } catch {
        // ignore
      }
    }
    shared.player = null;
    shared.deviceId = null;
    playerRef.current = null;
    setDeviceId(null);
    setTimeout(() => {
      if (!unmountedRef.current) loadWebPlaybackSdk();
    }, old ? RECONNECT_DELAY_MS : 0);
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

  return { state, deviceId, errorMessage, stuckTooLong, reconnectAttempts, accessTokenRef, connect, disconnect, reconnect, activateElement };
}
