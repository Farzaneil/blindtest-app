"use client";

import { Dice5, Flame, Lock } from "lucide-react";
import type { Player } from "../../lib/rooms";
import { correctStreakLockoutSeconds, isFullyBlockedThisRound } from "../../lib/buzzLockout";

/** Durée de l'annonce avant une manche (l'hôte peut la passer). */
export const ROUND_INTRO_MS = 4000;

export type RoundAnnouncement = { key: string; kind: "joker" | "block" | "delay"; text: string };

/**
 * Bonus/malus qui s'appliqueront à la PROCHAINE manche, annoncés sur l'écran
 * hôte juste avant son lancement (voir handlePlayNextInQueue) :
 * - manche joker (tirée par l'hôte avant le lancement, voir drawJokerRound) ;
 * - joueurs bloqués toute la manche (3 erreurs d'affilée, malus 2) ;
 * - joueurs au buzzer retardé (série de bonnes réponses, malus 1).
 * Même logique que lib/buzzLockout.ts, qui reflète ce que le serveur applique.
 * Liste vide = rien de spécial, pas d'annonce.
 */
export function roundAnnouncements(opts: {
  isJoker: boolean;
  nextOrderIndex: number;
  players: Player[];
  lockoutEnabled: boolean;
  blockEnabled: boolean;
}): RoundAnnouncement[] {
  const items: RoundAnnouncement[] = [];
  if (opts.isJoker) {
    items.push({ key: "joker", kind: "joker", text: "Manche joker : tous les points sont doublés, dans les deux sens !" });
  }
  for (const p of opts.players) {
    if (opts.blockEnabled && isFullyBlockedThisRound(p, { order_index: opts.nextOrderIndex })) {
      items.push({ key: `block-${p.id}`, kind: "block", text: `${p.display_name} est bloqué·e cette manche (3 erreurs d’affilée)` });
    } else if (opts.lockoutEnabled) {
      const delay = correctStreakLockoutSeconds(p.correct_streak_count);
      if (delay > 0) {
        items.push({
          key: `delay-${p.id}`,
          kind: "delay",
          text: `${p.display_name} buzze avec ${delay} s de retard (${p.correct_streak_count} bonnes réponses d’affilée)`,
        });
      }
    }
  }
  return items;
}

const ICONS = { joker: Dice5, block: Lock, delay: Flame } as const;
const TONES = { joker: "bg-amber", block: "bg-danger text-white", delay: "bg-gold" } as const;

/** Annonce plein écran sur l'écran hôte (la télé que tout le monde regarde). */
export function RoundIntroOverlay({
  roundNumber,
  items,
  onSkip,
}: {
  roundNumber: number;
  items: RoundAnnouncement[];
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-page/95 p-6" role="dialog" aria-live="assertive">
      <div className="w-full max-w-2xl flex flex-col items-center gap-6 text-center">
        <p className="font-display text-4xl md:text-6xl text-fg">Manche {roundNumber}</p>
        <ul className="w-full flex flex-col gap-3">
          {items.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <li
                key={item.key}
                className={`flex items-center gap-3 text-left text-lg md:text-2xl font-bold rounded-2xl border-[3px] border-fg shadow-sticker px-5 py-4 ${TONES[item.kind]}`}
              >
                <Icon className="w-7 h-7 shrink-0" aria-hidden />
                {item.text}
              </li>
            );
          })}
        </ul>
        <button
          onClick={onSkip}
          className="bg-sage text-fg px-8 py-3 rounded-xl text-lg font-display border-[3px] border-fg shadow-sticker-sm hover:-translate-y-0.5 transition-transform"
        >
          C’est parti !
        </button>
      </div>
    </div>
  );
}
