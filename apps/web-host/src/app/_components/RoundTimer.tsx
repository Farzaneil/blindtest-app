import { Timer } from "lucide-react";

/** Durée d'une manche (30 s de musique), identique partout. */
export const ROUND_DURATION_SECONDS = 30;

/**
 * Temps restant de la manche, même calcul que le timer de la vue admin :
 * temps déjà joué avant la reprise en cours (elapsed_seconds, migration
 * 0009) + temps écoulé depuis started_at. null hors "playing" (figé dès
 * qu'un joueur a buzzé). Borné : l'horloge de l'appareil peut être un peu
 * décalée de celle de l'hôte, qui pose started_at.
 */
export function roundTimeLeft(
  round: { status: string; started_at: string | null; elapsed_seconds?: number | null } | null | undefined,
  now: number | null
): number | null {
  if (now === null || !round || round.status !== "playing" || !round.started_at) return null;
  const elapsed = (round.elapsed_seconds ?? 0) + (now - new Date(round.started_at).getTime()) / 1000;
  return Math.min(ROUND_DURATION_SECONDS, Math.max(0, Math.ceil(ROUND_DURATION_SECONDS - elapsed)));
}

/** Compte à rebours affiché au-dessus du buzzer (joueurs et hôte joueur). */
export function RoundTimer({ timeLeft }: { timeLeft: number | null }) {
  if (timeLeft === null) return null;
  const urgent = timeLeft <= 5;
  return (
    <div className="w-56 flex flex-col items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 font-display text-2xl tabular-nums bg-inkSurface border-[3px] border-fg rounded-full px-4 py-0.5 shadow-sticker-sm ${
          urgent ? "text-danger" : "text-fg"
        }`}
      >
        <Timer className="w-5 h-5" strokeWidth={2.75} />
        {timeLeft}s
      </span>
      <span className="block w-full h-3 bg-inkSurface border-[3px] border-fg rounded-full overflow-hidden">
        <span
          className={`block h-full transition-[width] duration-300 ease-linear ${urgent ? "bg-danger" : "bg-good"}`}
          style={{ width: `${(timeLeft / ROUND_DURATION_SECONDS) * 100}%` }}
        />
      </span>
    </div>
  );
}
