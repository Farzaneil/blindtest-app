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

  const play = useCallback(
    async (url: string) => {
      const a = audio();
      a.pause();
      a.src = url;
      a.currentTime = 0;
      await a.play();
    },
    [audio]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

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
