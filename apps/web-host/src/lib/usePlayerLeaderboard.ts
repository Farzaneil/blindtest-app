"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type LeaderboardEntry = {
  accountId: string;
  pseudo: string;
  avatarUrl: string | null;
  xp: number;
};

type State = {
  loading: boolean;
  error: string | null;
  entries: LeaderboardEntry[];
};

/**
 * Classement "joueurs déjà rencontrés" (voir get_player_leaderboard,
 * migration 0023, et la maquette validée — panel "Classement" — pour le
 * choix de ce périmètre plutôt qu'un classement 100% global : pas de
 * système d'amis pour l'instant, donc ce sont tous les comptes avec qui le
 * compte demandeur a déjà partagé au moins une partie, plus lui-même).
 * Fonction SQL en lecture seule (SECURITY INVOKER), appelée via rpc() avec
 * la clé anon — voir le commentaire de la migration pour le détail des
 * grants déjà en place sur player_accounts/players.
 *
 * Même contrainte/solution que usePlayerBadges.ts/usePlayerCosmetics.ts :
 * le corps appelé depuis l'effet ne fait aucun setState directement,
 * seulement via des callbacks .then()/.catch().
 */
async function loadLeaderboard(accountId: string): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc("get_player_leaderboard", { p_account_id: accountId });
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    accountId: row.account_id as string,
    pseudo: row.pseudo as string,
    avatarUrl: (row.avatar_url as string | null) ?? null,
    xp: row.xp as number,
  }));
}

export function usePlayerLeaderboard(accountId: string) {
  const [state, setState] = useState<State>({ loading: true, error: null, entries: [] });

  const refresh = useCallback(() => {
    loadLeaderboard(accountId)
      .then((entries) => setState({ loading: false, error: null, entries }))
      .catch((e: any) => setState({ loading: false, error: e?.message ?? "Erreur inconnue", entries: [] }));
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
