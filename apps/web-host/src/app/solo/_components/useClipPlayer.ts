"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Clip } from "../../../lib/solo/worlds";

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// Un seul élément <audio> pour tout le mode solo, partagé entre la carte et
// les niveaux : « débloqué » par le clic sur « Jouer » de la carte, il peut
// ensuite jouer sans nouveau geste (Safari iOS) quand le niveau démarre seul.
let shared: HTMLAudioElement | null = null;
function sharedAudio(): HTMLAudioElement {
  if (!shared) {
    shared = new Audio();
    shared.preload = "auto";
    shared.volume = 0.9;
  }
  return shared;
}

/** À appeler dans un clic (bouton « Jouer » de la carte) : débloque le son. */
export function primeAudio() {
  const a = sharedAudio();
  if (a.src && !a.paused) return;
  try {
    a.src = SILENT_WAV;
    a.play().catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Lecteur des extraits du mode solo : joue un morceau du début (intro de
 * N s) ou pris au milieu, puis coupe tout seul. Un seul élément <audio>,
 * « débloqué » au premier clic (Safari iOS exige un geste avant de jouer).
 */
export function useClipPlayer() {
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);

  const audio = useCallback(() => sharedAudio(), []);

  const clearStop = () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
  };

  const stop = useCallback(() => {
    clearStop();
    shared?.pause();
    setPlaying(false);
  }, []);

  useEffect(
    () => () => {
      clearStop();
      shared?.pause();
    },
    []
  );

  /** À appeler au début d'un clic, avant tout await. */
  const prime = useCallback(() => primeAudio(), []);

  /** Joue l'extrait ; la promesse se résout quand le son a démarré. */
  const playClip = useCallback(
    async (url: string, clip: Clip) => {
      const a = audio();
      clearStop();
      a.pause();
      a.src = url;
      if (clip.start === "middle") {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          a.addEventListener("loadedmetadata", done, { once: true });
          a.load();
          setTimeout(done, 2500);
        });
        const d = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 30;
        a.currentTime = Math.max(0, d / 2 - clip.seconds / 2);
      } else {
        a.currentTime = 0;
      }
      await a.play();
      setPlaying(true);
      stopTimer.current = setTimeout(() => {
        a.pause();
        setPlaying(false);
      }, clip.seconds * 1000);
    },
    [audio]
  );

  return { prime, playClip, stop, playing };
}
