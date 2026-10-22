"use client";

import { useState } from "react";
import { UserCheck } from "lucide-react";
import type { Player, RejoinRequest, Team } from "../../lib/rooms";
import { teamColor } from "../../lib/teams";
import { TeamDot } from "./Teams";

/**
 * Demandes de reprise de place en attente (voir migration 0026), affichées
 * en haut de l'écran hôte — vue admin comme vue buzzer, pour qu'un hôte
 * qui joue aussi ne les rate pas. Un joueur invité qui retape un pseudo
 * déjà pris peut demander à reprendre ce joueur (score, équipe) : seul
 * l'hôte peut confirmer que c'est bien lui.
 */
export function RejoinRequestsBanner({
  requests,
  players,
  teams,
  onResolve,
}: {
  requests: RejoinRequest[];
  players: Player[];
  teams: Team[];
  onResolve: (requestId: string, accept: boolean) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (requests.length === 0) return null;

  const resolve = async (id: string, accept: boolean) => {
    setBusyId(id);
    try {
      await onResolve(id, accept);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="w-full max-w-xl flex flex-col gap-2" role="status" aria-live="polite">
      {requests.map((r) => {
        const player = players.find((p) => p.id === r.player_id);
        const team = player?.team_id ? teams.find((t) => t.id === player.team_id) : undefined;
        return (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 bg-inkSurface border-2 border-fg rounded-2xl px-4 py-3 shadow-sticker"
          >
            <p className="text-sm flex items-center gap-2 min-w-0">
              <UserCheck className="w-5 h-5 text-fg shrink-0" />
              <span className="min-w-0">
                <span className="font-bold text-fg">{player?.display_name ?? "Un joueur"}</span>{" "}
                veut reprendre sa place
                <span className="text-inkMuted">
                  {" "}
                  ({player?.score ?? 0} pts
                  {team && (
                    <>
                      {" · "}
                      <TeamDot color={teamColor(team)} className="w-2 h-2" /> {team.name}
                    </>
                  )}
                  )
                </span>
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => resolve(r.id, true)}
                className="bg-sage text-ink hover:bg-sage/90 disabled:opacity-50 transition rounded-xl px-4 py-2 text-sm font-bold border-2 border-fg shadow-sticker-sm"
              >
                Accepter
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => resolve(r.id, false)}
                className="bg-inkSurface border-2 border-fg text-danger hover:bg-danger/10 disabled:opacity-50 transition rounded-xl px-4 py-2 text-sm font-bold shadow-sticker-sm"
              >
                Refuser
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
