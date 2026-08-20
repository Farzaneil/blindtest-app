"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { DEFAULT_COSMETIC_KEY } from "./cosmetics";

type State = {
  loading: boolean;
  error: string | null;
  unlockedKeys: Set<string>;
  equippedKey: string;
};

/**
 * Cosmétiques débloqués + équipé pour un compte (voir player_cosmetics,
 * migration 0022, alimentée par award_cosmetic_unlocks en fin de partie).
 * Lecture publique via la clé anon, comme player_badge_progress. Un compte
 * qui n'a jamais explicitement équipé de skin n'a aucune ligne "equipped" en
 * base : on retombe alors sur DEFAULT_COSMETIC_KEY (Sage), qui est de toute
 * façon le rendu déjà utilisé partout ailleurs dans l'appli avant cette
 * phase — aucun changement visuel pour les comptes existants tant qu'ils ne
 * choisissent pas explicitement un autre skin.
 *
 * Même contrainte/solution que usePlayerProfileData.ts et usePlayerBadges.ts
 * : le corps appelé depuis l'effet ne fait aucun setState directement,
 * seulement via des callbacks .then()/.catch().
 */
async function loadPlayerCosmetics(accountId: string): Promise<{ unlockedKeys: Set<string>; equippedKey: string }> {
  const { data, error } = await supabase
    .from("player_cosmetics")
    .select("cosmetic_key, equipped")
    .eq("account_id", accountId);
  if (error) throw error;

  const rows = data ?? [];
  const unlockedKeys = new Set(rows.map((r) => r.cosmetic_key as string));
  const equippedRow = rows.find((r) => r.equipped);
  return { unlockedKeys, equippedKey: (equippedRow?.cosmetic_key as string) ?? DEFAULT_COSMETIC_KEY };
}

export function usePlayerCosmetics(accountId: string) {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    unlockedKeys: new Set(),
    equippedKey: DEFAULT_COSMETIC_KEY,
  });

  const refresh = useCallback(() => {
    // accountId vide (invité, voir /play) : pas de compte à interroger, on
    // reste sur l'état par défaut sans faire de requête inutile. Le setState
    // reste dans un .then() (jamais synchrone dans le corps de l'effet), ici
    // via Promise.resolve(), pour la même raison que le cas réel ci-dessous
    // (voir la règle eslint react-hooks/set-state-in-effect commentée dans
    // usePlayerAccount.ts).
    if (!accountId) {
      Promise.resolve().then(() =>
        setState({ loading: false, error: null, unlockedKeys: new Set(), equippedKey: DEFAULT_COSMETIC_KEY })
      );
      return;
    }
    loadPlayerCosmetics(accountId)
      .then(({ unlockedKeys, equippedKey }) => setState({ loading: false, error: null, unlockedKeys, equippedKey }))
      .catch((e: any) =>
        setState({ loading: false, error: e?.message ?? "Erreur inconnue", unlockedKeys: new Set(), equippedKey: DEFAULT_COSMETIC_KEY })
      );
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
