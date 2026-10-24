"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Crown, Drum } from "lucide-react";
import type { Player, Round, RoundAttempt } from "../../lib/rooms";
import { podiumRowClasses, withRanks, type RankedPlayer } from "../../lib/ranking";
import { Avatar, PlayerAvatar } from "../../lib/avatars";

/**
 * Animations "spectacle" des scores (direction Arcade) :
 * - AnimatedScoreboard : classement entre deux manches (étiquettes de
 *   points, compteurs qui défilent, lignes qui changent de place, couronne
 *   du nouveau leader). Hôte et téléphones.
 * - EndCeremony : cérémonie de fin de partie (roulement, podium 3-2-1,
 *   confettis, puis le détail en cascade).
 *
 * Toutes les durées sont regroupées dans TIMING pour pouvoir raccourcir
 * facilement. Si l'appareil demande de réduire les animations
 * (prefers-reduced-motion), tout s'affiche directement dans l'état final.
 */

export const TIMING = {
  // Classement entre manches
  pointsPopMs: 250, // délai avant l'apparition des étiquettes +2/+1/-1
  countUpMs: 1300, // défilement des scores
  reorderAtMs: 1900, // les lignes changent de place
  reorderMs: 950,
  settleAtMs: 2900, // couronne + flèches de progression
  clearAtMs: 6500, // fin : étiquettes retirées
  // Cérémonie de fin
  drumrollMs: 2600,
  podiumStepMs: 1000, // 3e, puis 2e, puis 1er
  detailsAfterMs: 1800, // après le 1er
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Bonus obtenus par joueur sur une manche (étiquettes affichées avec les points). */
export function roundBonuses(attempts: RoundAttempt[], round: Pick<Round, "id" | "is_joker"> | null) {
  const out: Record<string, string[]> = {};
  if (!round) return out;
  for (const a of attempts) {
    if (a.round_id !== round.id) continue;
    const list: string[] = [];
    if (a.speed_bonus_awarded) list.push("Vitesse");
    if (a.remontada_bonus_awarded) list.push("Remontada");
    if (round.is_joker && a.points_awarded > 0) list.push("Joker ×2");
    if (list.length) out[a.player_id] = [...(out[a.player_id] ?? []), ...list];
  }
  return out;
}

type Phase = "idle" | "points" | "reorder" | "settle";
type Scores = Record<string, number>;

const scoresOf = (ps: Player[]): Scores => Object.fromEntries(ps.map((p) => [p.id, p.score]));

/**
 * Classement animé. Détecte tout seul un changement de scores (comparaison
 * avec les derniers scores affichés) et joue la séquence :
 *   1. étiquettes +2 / -1 (+ bonus) qui sautent, scores qui défilent ;
 *   2. les lignes glissent vers leur nouvelle place (la ligne qui monte se
 *      soulève) ;
 *   3. couronne qui tombe sur le nouveau leader, flèches ▲/▼.
 * `baseline` : scores "avant" à utiliser au montage (téléphone : le
 * classement n'est monté qu'à la révélation, une fois les points déjà
 * appliqués — voir previousScores dans play/page.tsx).
 */
export function AnimatedScoreboard({
  players,
  baseline,
  meId = null,
  variant,
  bonuses,
  renderExtra,
  className = "",
}: {
  players: Player[];
  baseline?: Scores | null;
  meId?: string | null;
  variant: "host" | "phone";
  bonuses?: Record<string, string[]>;
  renderExtra?: (p: RankedPlayer) => ReactNode;
  className?: string;
}) {
  const [phaseState, setPhase] = useState<Phase>("idle");
  const [animState, setAnim] = useState<{ from: Scores; to: Scores } | null>(null);
  const [progressState, setProgress] = useState(1);
  // Derniers scores "affichés" : un state (et non une ref) pour pouvoir le
  // comparer aux scores reçus PENDANT le rendu. Bug remonté : au rendu qui
  // suit l'arrivée des nouveaux scores (avant que l'effet ne lance
  // l'animation), le classement passait une frame dans le nouvel ordre,
  // puis revenait à l'ancien pour les points, puis repassait au nouveau :
  // les noms s'inversaient deux fois.
  const [committed, setCommitted] = useState<Scores>(() => baseline ?? scoresOf(players));

  const scoresKey = players
    .map((p) => `${p.id}:${p.score}`)
    .sort()
    .join("|");

  useEffect(() => {
    const to = scoresOf(players);
    const from = committed;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommitted(to);
    const changed = Object.keys(to).some((id) => from[id] !== undefined && from[id] !== to[id]);
    if (!changed) {
      setPhase("idle");
      setAnim(null);
      setProgress(1);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    setAnim({ from, to });
    if (prefersReducedMotion()) {
      setProgress(1);
      setPhase("settle");
      timers.push(setTimeout(() => setPhase("idle"), TIMING.clearAtMs));
      return () => timers.forEach(clearTimeout);
    }
    setProgress(0);
    setPhase("points");
    // Défilement des scores (rAF), après l'apparition des étiquettes.
    let raf = 0;
    const start = performance.now() + TIMING.pointsPopMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / TIMING.countUpMs));
      setProgress(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timers.push(setTimeout(() => setPhase("reorder"), TIMING.reorderAtMs));
    timers.push(setTimeout(() => setPhase("settle"), TIMING.settleAtMs));
    timers.push(
      setTimeout(() => {
        setPhase("idle");
        setAnim(null);
      }, TIMING.clearAtMs)
    );
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
    // players est lu via scoresKey (seuls les scores déclenchent l'animation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresKey]);

  // Nouveaux scores reçus mais animation pas encore lancée (le temps d'un
  // rendu) : on reste sur l'ancien classement et les anciens scores.
  const pending = players.some((p) => committed[p.id] !== undefined && committed[p.id] !== p.score);
  const anim = pending ? { from: committed, to: scoresOf(players) } : animState;
  const phase: Phase = pending ? "points" : phaseState;
  const progress = pending ? 0 : progressState;
  const animating = anim !== null && phase !== "idle";
  const scoreFor = (p: Player) => {
    if (!animating || !anim) return p.score;
    const from = anim.from[p.id] ?? p.score;
    if (phase !== "points") return p.score;
    return Math.round(from + (p.score - from) * easeOutCubic(progress));
  };

  // Ordre affiché : ancien classement pendant les points, nouveau ensuite.
  const shown: RankedPlayer[] =
    animating && anim && phase === "points"
      ? withRanks(players.map((p) => ({ ...p, score: anim.from[p.id] ?? p.score })))
      : withRanks(players);
  const oldOrder = anim ? withRanks(players.map((p) => ({ ...p, score: anim.from[p.id] ?? p.score }))) : shown;
  const newOrder = withRanks(players);
  const oldIndex = new Map(oldOrder.map((p, i) => [p.id, i]));
  const newIndex = new Map(newOrder.map((p, i) => [p.id, i]));
  const oldLeader = oldOrder[0]?.id ?? null;
  const newLeaderSolo = newOrder.length > 0 && newOrder.filter((p) => p.rank === 1).length === 1 ? newOrder[0].id : null;
  const leaderChanged = anim !== null && newLeaderSolo !== null && newLeaderSolo !== oldLeader;

  // FLIP : chaque ligne repart de son ancienne position puis glisse.
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const topsRef = useRef(new Map<string, number>());
  const orderKey = shown.map((p) => p.id).join("|");
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    rowRefs.current.forEach((el, id) => {
      const newTop = el.offsetTop;
      const prevTop = topsRef.current.get(id);
      if (!reduce && prevTop !== undefined && prevTop !== newTop) {
        el.style.transition = "none";
        el.style.transform = `translateY(${prevTop - newTop}px)`;
        void el.getBoundingClientRect();
        requestAnimationFrame(() => {
          el.style.transition = `transform ${TIMING.reorderMs}ms cubic-bezier(0.2, 0.9, 0.25, 1.12)`;
          el.style.transform = "";
        });
      }
      topsRef.current.set(id, newTop);
    });
  }, [orderKey]);

  const host = variant === "host";

  return (
    <ul className={`w-full flex flex-col ${host ? "gap-2.5" : "gap-2"} pl-4 pr-2 pt-5 pb-2 ${className}`}>
      {shown.map((p, i) => {
        const plate = podiumRowClasses(p.rank);
        const isMe = p.id === meId;
        const realDelta = anim ? (anim.to[p.id] ?? p.score) - (anim.from[p.id] ?? p.score) : 0;
        const moved = (oldIndex.get(p.id) ?? 0) - (newIndex.get(p.id) ?? 0); // > 0 : monte
        const lifting = animating && phase === "reorder" && moved > 0;
        const sinking = animating && phase === "reorder" && moved < 0;
        const showCrown = newLeaderSolo === p.id && phase !== "points";
        const crownDrops = showCrown && leaderChanged && phase === "settle";
        const rowBg = p.rank <= 3 ? plate.row : "bg-inkSurface";
        const text = p.rank <= 3 ? plate.text : "text-fg";
        return (
          <li
            key={p.id}
            ref={(el) => {
              if (el) rowRefs.current.set(p.id, el);
              else rowRefs.current.delete(p.id);
            }}
            className={`relative ${lifting ? "z-20" : "z-0"}`}
          >
            <div
              className={`relative flex items-center justify-between gap-2 rounded-xl border-2 border-fg transition-[transform,box-shadow] duration-300 ${rowBg} ${
                host ? "px-4 py-3 text-xl" : "h-11 px-3"
              } ${lifting ? "scale-[1.04] -rotate-1 shadow-sticker-lg" : sinking ? "scale-[0.98] shadow-none opacity-90" : "shadow-sticker-sm"} ${
                isMe ? "ring-4 ring-offset-2 ring-offset-transparent ring-[rgb(var(--c2))]" : ""
              }`}
            >
              {showCrown && (
                <span
                  aria-hidden
                  className={`absolute -top-3.5 -left-2.5 w-8 h-8 rounded-full bg-gold border-2 border-fg shadow-sticker-sm flex items-center justify-center -rotate-12 ${
                    crownDrops ? "animate-[crownDrop_0.7s_cubic-bezier(0.3,1.6,0.5,1)_both]" : ""
                  }`}
                >
                  <Crown className="w-4 h-4" strokeWidth={2.5} />
                </span>
              )}
              <span className={`flex items-center gap-2 min-w-0 ${text}`}>
                <span className={`font-display shrink-0 text-center ${host ? "w-7" : "w-5 text-sm"}`}>{p.rank}</span>
                <PlayerAvatar player={p} size={host ? 40 : 28} />
                <span className="truncate font-bold">{p.display_name}</span>
                {renderExtra?.(p)}
                {animating && realDelta !== 0 && (
                  <span
                    className={`shrink-0 font-display rounded-lg border-2 border-fg shadow-sticker-sm px-1.5 leading-tight rotate-3 animate-[stickerPop_0.45s_cubic-bezier(0.3,1.6,0.5,1)_both] ${
                      realDelta > 0 ? "bg-good text-fg" : "bg-danger text-white"
                    } ${host ? "text-base py-0.5" : "text-xs py-0.5"}`}
                    style={{ animationDelay: `${TIMING.pointsPopMs + i * 110}ms` }}
                  >
                    {realDelta > 0 ? `+${realDelta}` : realDelta}
                  </span>
                )}
                {animating &&
                  (bonuses?.[p.id] ?? []).map((b, j) => (
                    <span
                      key={b}
                      className={`shrink-0 hidden sm:inline-block font-bold rounded-full bg-amber text-amberOn border-2 border-fg px-2 leading-tight -rotate-2 animate-[stickerPop_0.45s_cubic-bezier(0.3,1.6,0.5,1)_both] ${
                        host ? "text-xs py-0.5" : "text-[10px] py-0"
                      }`}
                      style={{ animationDelay: `${TIMING.pointsPopMs + 250 + i * 110 + j * 120}ms` }}
                    >
                      {b}
                    </span>
                  ))}
                {animating && phase === "settle" && moved !== 0 && (
                  <span
                    className={`shrink-0 inline-flex items-center gap-0.5 font-bold rounded-full border-2 border-fg px-1.5 leading-tight animate-[stickerPop_0.4s_ease-out_both] ${
                      moved > 0 ? "bg-inkSurface text-fg" : "bg-inkSurface text-inkMuted"
                    } ${host ? "text-sm" : "text-[10px]"}`}
                  >
                    {moved > 0 ? <ArrowUp className="w-3 h-3" strokeWidth={3} /> : <ArrowDown className="w-3 h-3" strokeWidth={3} />}
                    {Math.abs(moved)}
                  </span>
                )}
              </span>
              <span className={`font-display shrink-0 tabular-nums ${text}`}>
                {scoreFor(p)} pts
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Nombre qui défile jusqu'à sa nouvelle valeur quand elle change. */
export function CountUp({ value, durationMs = TIMING.countUpMs, delayMs = TIMING.pointsPopMs }: { value: number; durationMs?: number; delayMs?: number }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      setShown(Math.round(from + (value - from) * easeOutCubic(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, delayMs]);
  return <>{shown}</>;
}

// ---------------------------------------------------------------------------
// Confettis (CSS pur, positions pseudo-aléatoires mais déterministes : pas de
// Math.random pendant le rendu).
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CONFETTI_COLORS = ["rgb(var(--c1))", "rgb(var(--c2))", "#FF6FB5", "#F5A524", "#39D98A", "#FFFFFF", "#4D7CFF"];

export function Confetti({ count = 90, seed = 7 }: { count?: number; seed?: number }) {
  const rand = mulberry32(seed);
  const pieces = Array.from({ length: count }, (_, i) => ({
    left: rand() * 100,
    delay: rand() * 0.9,
    duration: 2.4 + rand() * 1.8,
    size: 7 + rand() * 9,
    drift: (rand() - 0.5) * 220,
    spin: 360 + rand() * 720,
    round: rand() > 0.6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {pieces.map((c, i) => (
        <span
          key={i}
          className="absolute -top-6 border-2 border-fg animate-[confettiFall_var(--dur)_cubic-bezier(0.25,0.6,0.4,1)_var(--delay)_both]"
          style={
            {
              left: `${c.left}%`,
              width: c.size,
              height: c.round ? c.size : c.size * 0.55,
              borderRadius: c.round ? "999px" : "2px",
              background: c.color,
              "--dur": `${c.duration}s`,
              "--delay": `${c.delay}s`,
              "--drift": `${c.drift}px`,
              "--spin": `${c.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cérémonie de fin de partie
// ---------------------------------------------------------------------------

export type PodiumEntry = {
  id: string;
  name: string;
  score: number;
  rank: 1 | 2 | 3;
  /** Pastille de couleur (équipe). */
  color?: string;
  /** Avatar du joueur (podium individuel). */
  avatar?: { key: string; color: string; extra?: string | null };
};

type CeremonyStep = "drumroll" | "third" | "second" | "first" | "details";

/**
 * Séquence : roulement ("Et le gagnant est…") → podium 3e, 2e, puis 1er
 * (confettis) → détail (children) en cascade. Un bouton "Passer" saute
 * directement au résultat. `headline` (téléphone) : "Tu finis 2e !" affiché
 * sous le podium.
 */
export function EndCeremony({
  title,
  podium,
  headline,
  confetti = true,
  compact = false,
  children,
}: {
  title: ReactNode;
  podium: PodiumEntry[];
  headline?: ReactNode;
  confetti?: boolean;
  compact?: boolean;
  children: ReactNode;
}) {
  const [step, setStep] = useState<CeremonyStep>("drumroll");

  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep("details");
      return;
    }
    const has = (r: number) => podium.some((p) => p.rank === r);
    const seq: CeremonyStep[] = [];
    if (has(3)) seq.push("third");
    if (has(2)) seq.push("second");
    seq.push("first");
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = TIMING.drumrollMs;
    for (const s of seq) {
      timers.push(setTimeout(() => setStep(s), at));
      at += TIMING.podiumStepMs;
    }
    timers.push(setTimeout(() => setStep("details"), at - TIMING.podiumStepMs + TIMING.detailsAfterMs));
    return () => timers.forEach(clearTimeout);
    // Joué une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order: CeremonyStep[] = ["drumroll", "third", "second", "first", "details"];
  const reached = (s: CeremonyStep) => order.indexOf(step) >= order.indexOf(s);
  const visibleRank = (r: number) => (r === 3 ? reached("third") : r === 2 ? reached("second") : reached("first"));

  return (
    <div className="w-full flex flex-col items-center gap-6">
      {confetti && reached("first") && <Confetti count={compact ? 60 : 110} />}

      <div className="flex flex-col items-center gap-2 text-center">{title}</div>

      {step === "drumroll" ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex gap-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-12 h-12 rounded-full bg-info border-[3px] border-fg shadow-sticker-sm flex items-center justify-center animate-[drumHit_0.32s_ease-in-out_infinite_alternate]"
                style={{ animationDelay: `${i * 0.11}s` }}
              >
                <Drum className="w-6 h-6" strokeWidth={2.5} />
              </span>
            ))}
          </div>
          <p className={`font-display animate-[drumPulse_0.6s_ease-in-out_infinite] ${compact ? "text-2xl" : "text-4xl"}`}>
            Et le gagnant est…
          </p>
        </div>
      ) : (
        <Podium entries={podium} visibleRank={visibleRank} compact={compact} />
      )}

      {headline && reached("first") && (
        <div className="animate-[stampIn_0.5s_cubic-bezier(0.3,1.6,0.5,1)_both]">{headline}</div>
      )}

      {step !== "details" ? (
        <button
          type="button"
          onClick={() => setStep("details")}
          className="text-xs text-inkMuted hover:text-fg underline transition"
        >
          Passer l’animation
        </button>
      ) : (
        <div className="w-full flex flex-col items-center gap-6 [&>*]:animate-[fadeUp_0.5s_ease-out_both] [&>*:nth-child(2)]:[animation-delay:0.12s] [&>*:nth-child(3)]:[animation-delay:0.24s] [&>*:nth-child(4)]:[animation-delay:0.36s] [&>*:nth-child(n+5)]:[animation-delay:0.48s]">
          {children}
        </div>
      )}
    </div>
  );
}

function Podium({
  entries,
  visibleRank,
  compact,
}: {
  entries: PodiumEntry[];
  visibleRank: (r: number) => boolean;
  compact: boolean;
}) {
  // Colonnes dans l'ordre visuel 2 - 1 - 3 ; égalités regroupées sur une marche.
  const byRank = (r: 1 | 2 | 3) => entries.filter((e) => e.rank === r);
  const columns = ([2, 1, 3] as const).filter((r) => byRank(r).length > 0);
  const height = (r: number) =>
    compact ? (r === 1 ? "h-28" : r === 2 ? "h-20" : "h-14") : r === 1 ? "h-44" : r === 2 ? "h-32" : "h-24";
  const fill = (r: number) => (r === 1 ? "bg-gold text-goldOn" : r === 2 ? "bg-silver text-silverOn" : "bg-bronze text-bronzeOn");

  return (
    <div className={`flex items-end justify-center ${compact ? "gap-2 min-h-[11rem]" : "gap-4 min-h-[17rem]"}`}>
      {columns.map((r) => {
        const group = byRank(r);
        const shown = visibleRank(r);
        return (
          <div key={r} className={`flex flex-col items-center gap-2 ${compact ? "w-24" : "w-40"}`}>
            <div className={`flex flex-col items-center gap-1 ${shown ? "animate-[stampIn_0.55s_cubic-bezier(0.3,1.6,0.5,1)_0.35s_both]" : "opacity-0"}`}>
              {r === 1 && shown && (
                <span className="w-10 h-10 rounded-full bg-gold border-[3px] border-fg shadow-sticker-sm flex items-center justify-center -rotate-12 animate-[crownDrop_0.7s_cubic-bezier(0.3,1.6,0.5,1)_0.6s_both]">
                  <Crown className="w-5 h-5" strokeWidth={2.5} />
                </span>
              )}
              {group.some((e) => e.avatar) && (
                <span className="flex -space-x-3">
                  {group.map((e) =>
                    e.avatar ? (
                      <span key={e.id} className="block drop-shadow-[3px_3px_0_#111111]">
                        <Avatar avatarKey={e.avatar.key} color={e.avatar.color} extra={e.avatar.extra} animate size={compact ? (r === 1 ? 52 : 42) : r === 1 ? 84 : 66} />
                      </span>
                    ) : null
                  )}
                </span>
              )}
              {group.map((e) => (
                <span
                  key={e.id}
                  className={`max-w-full truncate bg-inkSurface border-2 border-fg rounded-lg shadow-sticker-sm px-2 py-0.5 font-display inline-flex items-center gap-1.5 ${
                    r === 1 ? "-rotate-2" : r === 2 ? "rotate-2" : "-rotate-1"
                  } ${compact ? "text-sm" : r === 1 ? "text-2xl" : "text-lg"}`}
                >
                  {e.color && <span className="w-3 h-3 rounded-full border-2 border-fg shrink-0" style={{ background: e.color }} />}
                  <span className="truncate">{e.name}</span>
                </span>
              ))}
              <span className={`font-display tabular-nums ${compact ? "text-xs" : "text-base"}`}>{group[0].score} pts</span>
            </div>
            <div
              className={`w-full ${height(r)} ${fill(r)} border-[3px] border-fg rounded-t-xl shadow-sticker flex items-start justify-center pt-2 origin-bottom ${
                shown ? "animate-[podiumRise_0.6s_cubic-bezier(0.2,1.3,0.4,1)_both]" : "scale-y-0"
              }`}
            >
              <span className={`font-display ${compact ? "text-2xl" : "text-5xl"}`}>{r}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Regroupe un classement (joueurs ou équipes) en marches de podium. */
export function podiumFrom<T extends { rank: number }>(
  items: T[],
  toEntry: (item: T) => Omit<PodiumEntry, "rank">
): PodiumEntry[] {
  return items
    .filter((i) => i.rank <= 3)
    .map((i) => ({ ...toEntry(i), rank: i.rank as 1 | 2 | 3 }));
}
