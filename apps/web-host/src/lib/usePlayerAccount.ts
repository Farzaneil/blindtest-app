"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type PlayerAccount = {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
  xp: number;
};

type Snapshot = { account: PlayerAccount | null; loading: boolean };

/**
 * État de connexion joueur côté client, lu depuis /api/player-auth/me (qui
 * lit lui-même le cookie de session — voir playerAuth.ts).
 *
 * Store module-level partagé entre TOUTES les instances de ce hook dans
 * l'appli (via useSyncExternalStore), plutôt qu'un simple useState local à
 * chaque composant. Corrige un bug remonté : sur /play et /host, deux
 * composants appellent chacun usePlayerAccount() sur la même page
 * (PlayerAccountCorner + JoinView/HostScreen) — avec un useState local,
 * appeler refresh() depuis PlayerAccountCorner (bouton Déconnexion) ne
 * mettait à jour QUE son propre état, laissant JoinView croire que le
 * compte était toujours connecté (pseudo resté affiché/cache après
 * déconnexion). Un store partagé garantit qu'un refresh() déclenché
 * n'importe où se répercute instantanément sur tous les composants montés.
 *
 * inFlightFetch dédoublonne aussi les appels réseau : deux composants
 * montés en même temps ne déclenchent qu'une seule requête /me au lieu de
 * deux.
 */
let snapshot: Snapshot = { account: null, loading: true };
let hasLoadedOnce = false;
let inFlightFetch: Promise<void> | null = null;
const listeners = new Set<() => void>();

const SERVER_SNAPSHOT: Snapshot = { account: null, loading: true };

function setSnapshot(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function fetchAccount(): Promise<void> {
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = fetch("/api/player-auth/me")
    .then((r) => r.json())
    .then((data) => setSnapshot({ account: data.connected ? data.account : null, loading: false }))
    .catch(() => setSnapshot({ account: null, loading: false }))
    .finally(() => {
      hasLoadedOnce = true;
      inFlightFetch = null;
    });
  return inFlightFetch;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function usePlayerAccount() {
  const { account, loading } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (!hasLoadedOnce && !inFlightFetch) {
      fetchAccount();
    }
  }, []);

  // Forcé (ConnexionPage après retour de callback OAuth, PlayerAccountCorner
  // après déconnexion) : relance toujours une requête fraîche, même si une
  // précédente a déjà abouti — voir le commentaire au-dessus du store.
  const refresh = useCallback(() => {
    fetchAccount();
  }, []);

  return { account, loading, refresh };
}
