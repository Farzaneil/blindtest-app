"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { CountUp, TIMING } from "./ScoreAnimations";
import type { Player } from "../../lib/rooms";
import {
  formatSeconds,
  teamColor,
  textOnTeamColor,
  type Award,
  type PlayerStats,
  type TeamStanding,
} from "../../lib/teams";

/**
 * Composants d'affichage du mode équipes (voir lib/teams.ts pour les
 * calculs), d'après les maquettes validées : cartes de score en partie,
 * récap de fin de partie "à la Call of Duty" (bandeau victoire, tableau par
 * équipe avec MVP, distinctions).
 */

export function TeamDot({ color, className = "w-3 h-3" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block rounded-full shrink-0 border-2 border-fg ${className}`} style={{ background: color }} />;
}

/** Cartes de score des équipes, pendant la partie (écran hôte). */
export function TeamScoreCards({ standings }: { standings: TeamStanding[] }) {
  const leaderScore = standings[0]?.score;
  const soleLeader = standings.filter((s) => s.score === leaderScore).length === 1;
  const leader = soleLeader ? standings[0] : null;

  // Changement d'équipe en tête : bandeau "Les Bleus passent devant !",
  // affiché une fois les scores défilés (voir TIMING).
  const leaderId = leader?.team.id ?? null;
  const prevLeaderRef = useRef<string | null | undefined>(undefined);
  const [banner, setBanner] = useState<{ key: number; name: string; color: string; textColor: string } | null>(null);
  useEffect(() => {
    const prev = prevLeaderRef.current;
    prevLeaderRef.current = leaderId;
    if (prev === undefined || !leader || leaderId === prev) return;
    const t1 = setTimeout(
      () =>
        setBanner({ key: Date.now(), name: leader.team.name, color: teamColor(leader.team), textColor: textOnTeamColor(leader.team) }),
      TIMING.reorderAtMs
    );
    const t2 = setTimeout(() => setBanner(null), TIMING.reorderAtMs + 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // Déclenché seulement par un changement d'équipe en tête.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderId]);

  return (
    <div className="relative w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4">
      {banner && (
        <div
          key={banner.key}
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-y-1/2 z-30 whitespace-nowrap font-display text-3xl sm:text-5xl border-[3px] border-fg rounded-2xl shadow-sticker-lg px-6 py-3 animate-[leaderBanner_3.2s_ease-out_both]"
          style={{ background: banner.color, color: banner.textColor }}
        >
          {banner.name} {/^les\s/i.test(banner.name) ? "passent" : "passe"} devant !
        </div>
      )}
      {standings.map((s) => {
        const color = teamColor(s.team);
        const leading = soleLeader && s.rank === 1;
        return (
          <article
            key={s.team.id}
            className="bg-inkSurface border-[3px] rounded-2xl overflow-hidden shadow-sticker"
            style={{ borderColor: leading ? color : "#111111" }}
          >
            <div
              className="flex items-center justify-between gap-3 px-5 py-3"
              style={{ background: color, color: textOnTeamColor(s.team) }}
            >
              <span className="font-display font-bold text-xl truncate">{s.team.name}</span>
              {leading && (
                <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-black/20 whitespace-nowrap">EN TÊTE</span>
              )}
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="flex items-baseline gap-2">
                <span className="font-display font-bold text-5xl tabular-nums">
                  <CountUp value={s.score} />
                </span>
                <span className="text-inkMuted">pts</span>
              </p>
              {s.players.length === 0 ? (
                <p className="text-sm text-inkMuted">Aucun joueur</p>
              ) : (
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {s.players.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 text-sm py-1 border-b border-inkSurface2">
                      <span className="truncate">{p.display_name}</span>
                      <span className="text-inkMuted tabular-nums whitespace-nowrap">{p.score} pts</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Bandeau "VICTOIRE — Les Bleus" (ou égalité) avec les scores. */
export function TeamResultBanner({
  standings,
  perspectiveTeamId,
}: {
  standings: TeamStanding[];
  // Côté joueur : affiche VICTOIRE/DÉFAITE du point de vue de son équipe.
  perspectiveTeamId?: string | null;
}) {
  const winners = standings.filter((s) => s.rank === 1);
  const tie = winners.length > 1;
  const top = winners[0];
  if (!top) return null;
  const mine = perspectiveTeamId ? standings.find((s) => s.team.id === perspectiveTeamId) : undefined;
  const bannerTeam = mine ?? top;
  const label = tie
    ? mine && mine.rank === 1
      ? "ÉGALITÉ EN TÊTE"
      : mine
        ? "DÉFAITE"
        : "ÉGALITÉ"
    : mine
      ? mine.rank === 1
        ? "VICTOIRE"
        : "DÉFAITE"
      : "VICTOIRE";
  const title = tie && !mine ? winners.map((w) => w.team.name).join(" & ") : bannerTeam.team.name;
  const color = mine && mine.rank !== 1 ? "#FFFFFF" : teamColor(bannerTeam.team);
  const textColor = mine && mine.rank !== 1 ? "#111111" : textOnTeamColor(bannerTeam.team);
  return (
    <section
      className="w-full rounded-2xl border-[3px] border-fg shadow-sticker px-6 py-5 flex flex-wrap items-center justify-between gap-4"
      style={{ background: color, color: textColor }}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-bold tracking-[0.3em]">{label}</span>
        <span className="font-display font-bold text-3xl sm:text-5xl leading-none truncate">{title}</span>
      </div>
      <p className="font-display font-bold tabular-nums flex items-center gap-3">
        {standings.map((s, i) => (
          <span key={s.team.id} className="flex items-center gap-3">
            {i > 0 && <span className="opacity-60 text-2xl">–</span>}
            <span className={i === 0 ? "text-5xl" : "text-3xl opacity-70"}>{s.score}</span>
          </span>
        ))}
      </p>
    </section>
  );
}

/** Tableau d'une équipe : joueurs, points, bonnes réponses, buzz record, MVP. */
export function TeamRecapTable({
  standing,
  stats,
  highlightPlayerId,
  showResult = true,
}: {
  standing: TeamStanding;
  stats: Map<string, PlayerStats>;
  highlightPlayerId?: string | null;
  showResult?: boolean;
}) {
  const color = teamColor(standing.team);
  return (
    <article className="bg-inkSurface border-[3px] border-inkBorder rounded-2xl overflow-hidden text-left shadow-sticker">
      <header
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ borderBottom: `3px solid ${color}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <TeamDot color={color} />
          <h3 className="font-display font-bold text-lg truncate">{standing.team.name}</h3>
          {showResult && (
            <span className="text-xs font-bold whitespace-nowrap" style={{ color }}>
              {standing.rank === 1 ? "1er" : `${standing.rank}e`}
            </span>
          )}
        </div>
        <span className="font-display font-bold text-2xl tabular-nums">{standing.score}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-inkMuted text-right">
              <th scope="col" className="text-left font-medium px-4 py-2">Joueur</th>
              <th scope="col" className="font-medium px-2 py-2">Pts</th>
              <th scope="col" className="font-medium px-2 py-2">Bonnes</th>
              <th scope="col" className="font-medium px-4 py-2 whitespace-nowrap">Buzz record</th>
            </tr>
          </thead>
          <tbody>
            {standing.players.map((p) => {
              const s = stats.get(p.id);
              const isMvp = standing.mvpPlayerId === p.id;
              const isMe = highlightPlayerId === p.id;
              return (
                <tr
                  key={p.id}
                  className="border-t border-inkSurface2 text-right"
                  style={{
                    background: isMe ? `${color}24` : isMvp ? "rgba(245,165,36,0.08)" : undefined,
                  }}
                >
                  <th scope="row" className="text-left font-semibold px-4 py-2.5">
                    <span className="inline-flex items-center gap-2 max-w-[180px]">
                      <span className="truncate">
                        {p.display_name}
                        {isMe && " (toi)"}
                      </span>
                      {isMvp && <MvpBadge />}
                    </span>
                  </th>
                  <td className="px-2 py-2.5 font-bold">{p.score}</td>
                  <td className="px-2 py-2.5 text-inkMuted">{s?.goodAnswers ?? 0}</td>
                  <td className="px-4 py-2.5 text-inkMuted">
                    {s?.fastestSeconds != null ? formatSeconds(s.fastestSeconds) : "—"}
                  </td>
                </tr>
              );
            })}
            {standing.players.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-inkMuted">Aucun joueur</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function MvpBadge({ label = "MVP" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gold text-goldOn rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap">
      <Star className="w-3 h-3 fill-current" /> {label}
    </span>
  );
}

export function AwardCards({
  awards,
  teamOf,
}: {
  awards: Award[];
  teamOf: (player: Player) => { color: string } | null;
}) {
  if (awards.length === 0) return null;
  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
      {awards.map((a) => (
        <div key={a.key} className="bg-inkSurface border border-inkBorder rounded-xl px-4 py-3 text-left flex flex-col gap-1">
          <span className="text-xs tracking-[0.15em] text-inkMuted uppercase">{a.label}</span>
          <span className="font-display font-bold text-lg flex items-center gap-2 min-w-0">
            <TeamDot color={teamColor(teamOf(a.player))} className="w-2.5 h-2.5" />
            <span className="truncate">{a.player.display_name}</span>
          </span>
          <span className="text-sm text-inkMuted">{a.detail}</span>
        </div>
      ))}
    </div>
  );
}
