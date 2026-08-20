"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export type NewUnlock = { badgeKey: string; tier: "bronze" | "argent" | "or" };

/**
 * Détecte les paliers de badges tout juste débloqués pendant CETTE visite de
 * l'écran de fin de partie (/play), pour afficher une notification "Badge
 * débloqué !". Voir award_game_rewards (migration 0021), appelé
 * fire-and-forget côté hôte dès que la room passe "finished" (voir
 * app/host/page.tsx) — ce calcul tourne côté serveur Supabase de façon
 * asynchrone par rapport à l'affichage de cet écran côté joueur, d'où le
 * court polling ci-dessous plutôt qu'une simple lecture unique.
 *
 * Comme le joueur peut arriver sur cet écran de fin de partie AVANT que ce
 * calcul n'ait fini de tourner côté hôte (ou même avant qu'il ne démarre),
 * on ne peut pas se contenter d'un seul select pour savoir "quoi de neuf" :
 * on mémorise l'ensemble des paliers déjà connus au premier appel (la
 * référence), puis on réinterroge à intervalles courts pendant une fenêtre
 * limitée, et on ne notifie que les paliers absents de cette référence —
 * jamais une notification "fantôme" pour un badge débloqué lors d'une
 * partie précédente.
 */
export function useNewlyUnlockedBadges(accountId: string | null | undefined, active: boolean) {
  const [newUnlocks, setNewUnlocks] = useState<NewUnlock[]>([]);
  const baselineRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!accountId || !active) return undefined;

    let cancelled = false;
    baselineRef.current = null;

    const fetchUnlocks = () => {
      supabase
        .from("player_badge_unlocks")
        .select("badge_key, tier")
        .eq("account_id", accountId)
        .then(({ data, error }) => {
          if (cancelled || error) return;
          const rows = data ?? [];
          const keys = new Set(rows.map((r) => `${r.badge_key}:${r.tier}`));

          if (baselineRef.current === null) {
            baselineRef.current = keys;
            return;
          }

          const fresh = rows
            .filter((r) => !baselineRef.current!.has(`${r.badge_key}:${r.tier}`))
            .map((r) => ({ badgeKey: r.badge_key as string, tier: r.tier as NewUnlock["tier"] }));

          if (fresh.length > 0) {
            setNewUnlocks((prev) => {
              const known = new Set(prev.map((u) => `${u.badgeKey}:${u.tier}`));
              const additions = fresh.filter((u) => !known.has(`${u.badgeKey}:${u.tier}`));
              return additions.length > 0 ? [...prev, ...additions] : prev;
            });
            baselineRef.current = keys;
          }
        });
    };

    fetchUnlocks();
    const interval = setInterval(fetchUnlocks, 3000);
    // Fenêtre de 20s : largement suffisante pour laisser à award_game_rewards
    // le temps de tourner côté serveur après la fin de partie, sans
    // continuer à interroger la base indéfiniment une fois l'écran affiché.
    const stopTimeout = setTimeout(() => clearInterval(interval), 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stopTimeout);
    };
  }, [accountId, active]);

  return newUnlocks;
}
