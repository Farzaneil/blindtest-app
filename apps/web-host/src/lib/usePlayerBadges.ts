"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type BadgeProgressRow = {
  badgeKey: string;
  progress: number;
  tier: "none" | "bronze" | "argent" | "or";
};

type State = {
  loading: boolean;
  error: string | null;
  progressByKey: Record<string, BadgeProgressRow>;
};

/**
 * Progression des badges d'un compte (voir player_badge_progress, migration
 * 0021, alimentée par award_game_rewards en fin de partie — voir
 * lib/rooms.ts:awardGameRewards). Lecture publique via la clé anon (voir la
 * policy "lecture publique player_badge_progress" de la migration), comme
 * pour player_accounts.
 *
 * Même contrainte/solution que usePlayerProfileData.ts : le corps appelé
 * depuis l'effet ne fait AUCUN setState directement, seulement via des
 * callbacks .then()/.catch() (règle eslint react-hooks/set-state-in-effect).
 */
async function loadPlayerBadges(accountId: string): Promise<Record<string, BadgeProgressRow>> {
  const { data, error } = await supabase
    .from("player_badge_progress")
    .select("badge_key, progress, tier")
    .eq("account_id", accountId);
  if (error) throw error;

  const byKey: Record<string, BadgeProgressRow> = {};
  for (const row of data ?? []) {
    byKey[row.badge_key] = { badgeKey: row.badge_key, progress: row.progress, tier: row.tier };
  }
  return byKey;
}

export function usePlayerBadges(accountId: string) {
  const [state, setState] = useState<State>({ loading: true, error: null, progressByKey: {} });

  const refresh = useCallback(() => {
    loadPlayerBadges(accountId)
      .then((progressByKey) => setState({ loading: false, error: null, progressByKey }))
      .catch((e: any) => setState({ loading: false, error: e?.message ?? "Erreur inconnue", progressByKey: {} }));
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
