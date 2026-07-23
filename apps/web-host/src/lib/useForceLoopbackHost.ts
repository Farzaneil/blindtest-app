"use client";

import { useEffect } from "react";

/**
 * Garde-fou partagé : les cookies posés sur "localhost" sont invisibles
 * depuis "127.0.0.1" (et inversement), or l'URI de redirection Spotify est
 * figée sur 127.0.0.1 (exigé par la politique Spotify depuis fin 2025). Si
 * une page qui a besoin de Spotify est ouverte via localhost, on redirige
 * tout de suite pour éviter un "state mismatch" difficile à comprendre.
 */
export function useForceLoopbackHost() {
  useEffect(() => {
    if (window.location.hostname === "localhost") {
      window.location.href = window.location.href.replace("localhost", "127.0.0.1");
    }
  }, []);
}
