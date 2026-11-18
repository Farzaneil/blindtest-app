"use client";

import { useCallback, useEffect, useRef } from "react";

// Son muet minuscule, joué pendant le clic de l'hôte pour "débloquer" la
// lecture audio sur les navigateurs qui exigent un geste (Safari iOS) avant
// l'appel réseau qui récupère l'extrait.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/**
 * Lecteur des extraits de 30 s (source Deezer) : un seul élément <audio>
 * pour toute la partie, piloté comme le lecteur Spotify (lecture, pause au
 * buzz, reprise là où c'était arrêté). Coupé automatiquement en quittant
 * la page.
 */
export function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Surveillance « pas de son » de l'extrait en cours (voir play).
  const watchTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearWatch = useCallback(() => {
    watchTimers.current.forEach(clearTimeout);
    watchTimers.current = [];
  }, []);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
      audioRef.current.volume = 0.9;
    }
    return audioRef.current;
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    []
  );

  /** À appeler au tout début d'un clic, avant tout await. */
  const prime = useCallback(() => {
    const a = audio();
    if (a.src && !a.paused) return;
    try {
      a.src = SILENT_WAV;
      a.play().catch(() => {});
    } catch {
      // ignore
    }
  }, [audio]);

  /**
   * Joue un extrait. `onStuck` est appelé si le son ne démarre pas vraiment
   * (retours bêta « pas de son » sur certains morceaux, iPhone) : lecture
   * censée en cours mais position bloquée à 0 au bout de 3 s → on recharge
   * une fois ; toujours bloquée à 7 s → onStuck. Rien n'est signalé si la
   * lecture a été mise en pause entre-temps (buzz).
   */
  const play = useCallback(
    async (url: string, onStuck?: () => void) => {
      const a = audio();
      clearWatch();
      a.pause();
      a.src = url;
      a.currentTime = 0;
      await a.play();
      if (!onStuck) return;
      const stuck = () => a.src === url && !a.paused && a.currentTime < 0.3;
      watchTimers.current.push(
        setTimeout(() => {
          if (!stuck()) return;
          a.load();
          a.play().catch(() => {});
        }, 3000),
        setTimeout(() => {
          if (stuck()) onStuck();
        }, 7000)
      );
    },
    [audio, clearWatch]
  );

  const pause = useCallback(() => {
    clearWatch();
    audioRef.current?.pause();
  }, [clearWatch]);

  const resume = useCallback(async () => {
    const a = audioRef.current;
    if (!a || !a.src || a.src === SILENT_WAV || a.ended) return;
    await a.play();
  }, []);

  const isLoaded = useCallback(() => {
    const a = audioRef.current;
    return !!a && !!a.src && a.src !== SILENT_WAV;
  }, []);

  return { prime, play, pause, resume, isLoaded };
}
