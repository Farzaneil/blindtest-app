"use client";

import { useCallback, useEffect, useState } from "react";

export type PlayerAccount = {
  id: string;
  pseudo: string;
  avatarUrl: string | null;
  xp: number;
};

/**
 * État de connexion joueur côté client, lu depuis /api/player-auth/me (qui
 * lit lui-même le cookie de session — voir playerAuth.ts). `refresh` est
 * exposé pour que ConnexionPage/PlayerAccountCorner puissent forcer une
 * relecture juste après un retour de callback OAuth (?player_connected=1),
 * sans attendre un remount du composant.
 */
export function usePlayerAccount() {
  const [account, setAccount] = useState<PlayerAccount | null>(null);
  const [loading, setLoading] = useState(true);

  // Ne remet volontairement PAS loading à true en tête de fonction (même
  // pour un refresh() manuel après déconnexion) : la règle eslint react-
  // hooks interdit un setState synchrone en tête d'effet (voir l'appel
  // refresh() ci-dessous), et loading démarre de toute façon à true —
  // seul un bref flash "pas encore chargé" serait perdu sur un refresh()
  // manuel, sans conséquence réelle ici.
  const refresh = useCallback(() => {
    fetch("/api/player-auth/me")
      .then((r) => r.json())
      .then((data) => setAccount(data.connected ? data.account : null))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { account, loading, refresh };
}
