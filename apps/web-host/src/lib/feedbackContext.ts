"use client";

/**
 * Contexte joint automatiquement aux retours de la bêta (bouton « ! », voir
 * app/_components/FeedbackWidget.tsx) : ce que le testeur n'a pas à
 * raconter lui-même.
 * - Les pages de jeu déclarent la partie en cours avec useFeedbackContext
 *   (code, rôle, manche) ;
 * - les erreurs JavaScript de l'onglet sont gardées (20 dernières) par
 *   installErrorCapture, appelé une fois par le widget.
 * Tout reste en mémoire dans l'onglet ; rien n'est envoyé tant que le
 * testeur n'a pas validé le formulaire.
 */

import { useEffect } from "react";

export type FeedbackGameContext = {
  roomCode?: string | null;
  role?: "hôte" | "joueur" | "joueur invité" | null;
  round?: number | null;
  mode?: string | null;
};

let gameContext: FeedbackGameContext = {};
const errors: string[] = [];
let installed = false;

export function getFeedbackGameContext(): FeedbackGameContext {
  return gameContext;
}

export function getRecentErrors(): string[] {
  return [...errors];
}

/** Déclare le contexte de partie de la page affichée (effacé en la quittant). */
export function useFeedbackContext(ctx: FeedbackGameContext) {
  const { roomCode, role, round, mode } = ctx;
  useEffect(() => {
    gameContext = { roomCode, role, round, mode };
    return () => {
      gameContext = {};
    };
  }, [roomCode, role, round, mode]);
}

function remember(message: string) {
  const line = message.slice(0, 300);
  errors.push(`${new Date().toISOString().slice(11, 19)} ${line}`);
  if (errors.length > 20) errors.shift();
}

export function installErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => remember(e.message || "Erreur inconnue"));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    remember(reason instanceof Error ? reason.message : String(reason ?? "Promesse rejetée"));
  });
}
