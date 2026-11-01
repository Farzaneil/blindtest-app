"use client";

/**
 * Source d'arrivée (sticker, QR code, lien partagé) : https://kazouband.fr/?src=paris-kaz.
 * Le code est gardé 30 jours dans ce navigateur, puis joint aux moments clés
 * (visite, partie créée, partie rejointe) envoyés à app/api/acquisition
 * (table acquisition_events, migration 0037). Aucune donnée personnelle.
 * Tout est tolérant aux erreurs : le suivi ne doit jamais gêner le jeu.
 */

const STORAGE_KEY = "kb_source";
const VISIT_SENT_KEY = "kb_source_visit_sent";
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const SOURCE_PATTERN = /^[a-z0-9-]{1,40}$/;

export type AcquisitionKind = "visit" | "room_created" | "player_joined";

function send(kind: AcquisitionKind, source: string, roomId?: string) {
  fetch("/api/acquisition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, source, roomId: roomId ?? null }),
    keepalive: true,
  }).catch(() => {});
}

/** Source mémorisée, si elle a moins de 30 jours. */
export function currentSource(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { src, at } = JSON.parse(raw) as { src: string; at: number };
    if (!SOURCE_PATTERN.test(src) || Date.now() - at > MAX_AGE_MS) return null;
    return src;
  } catch {
    return null;
  }
}

/**
 * À l'arrivée sur n'importe quelle page : lit ?src=, le mémorise, compte une
 * visite (une fois par onglet et par source), puis retire le paramètre de
 * l'adresse affichée.
 */
export function captureSource() {
  try {
    const url = new URL(window.location.href);
    const src = url.searchParams.get("src")?.trim().toLowerCase();
    if (!src) return;
    url.searchParams.delete("src");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (!SOURCE_PATTERN.test(src)) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ src, at: Date.now() }));
    if (sessionStorage.getItem(VISIT_SENT_KEY) === src) return;
    sessionStorage.setItem(VISIT_SENT_KEY, src);
    send("visit", src);
  } catch {
    // Navigation privée, stockage bloqué : on ignore.
  }
}

/** Partie créée ou rejointe depuis ce navigateur, rattachée à sa source. */
export function trackAcquisition(kind: Exclude<AcquisitionKind, "visit">, roomId: string) {
  const src = currentSource();
  if (src) send(kind, src, roomId);
}
