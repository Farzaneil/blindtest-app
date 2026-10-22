"use client";

import { useState, type ReactNode } from "react";
import { Shuffle, Users } from "lucide-react";
import type { Player, Team } from "../../lib/rooms";
import { teamColor } from "../../lib/teams";
import { TeamDot } from "./Teams";

/**
 * Préparation du mode équipes côté hôte (maquette "Hôte · Préparation des
 * équipes") : choix Solo / Équipes, nombre d'équipes, cartes d'équipe avec
 * nom modifiable et joueurs déplaçables, joueurs sans équipe, mélange.
 * Affiché uniquement avant la première manche : la composition est figée
 * une fois la partie lancée (les retardataires choisissent leur équipe
 * eux-mêmes en rejoignant).
 */
export function TeamSetupPanel({
  teamMode,
  teams,
  players,
  busy,
  onSetTeamCount,
  onRenameTeam,
  onMovePlayer,
  onShuffle,
}: {
  teamMode: boolean;
  teams: Team[];
  players: Player[];
  busy: boolean;
  onSetTeamCount: (count: 0 | 2 | 3 | 4) => void;
  onRenameTeam: (teamId: string, name: string) => void;
  onMovePlayer: (playerId: string, teamId: string | null) => void;
  onShuffle: () => void;
}) {
  const unassigned = players.filter((p) => !p.team_id || !teams.some((t) => t.id === p.team_id));

  return (
    <section className="w-full max-w-4xl flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold font-display flex items-center gap-2">
          <Users className="w-5 h-5 text-sage" /> Format de la partie
        </h2>
        <div className="flex flex-wrap gap-3">
          <div role="group" aria-label="Format" className="flex bg-inkSurface border border-inkBorder rounded-xl p-1 gap-1">
            <SegmentButton active={!teamMode} disabled={busy} onClick={() => onSetTeamCount(0)}>
              Solo
            </SegmentButton>
            <SegmentButton active={teamMode} disabled={busy} onClick={() => !teamMode && onSetTeamCount(2)}>
              Équipes
            </SegmentButton>
          </div>
          {teamMode && (
            <div role="group" aria-label="Nombre d'équipes" className="flex items-center bg-inkSurface border border-inkBorder rounded-xl p-1 gap-1">
              <span className="text-xs text-inkMuted px-2">Équipes</span>
              {([2, 3, 4] as const).map((n) => (
                <SegmentButton key={n} active={teams.length === n} disabled={busy} onClick={() => onSetTeamCount(n)} square>
                  {n}
                </SegmentButton>
              ))}
            </div>
          )}
        </div>
      </div>

      {teamMode && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                teams={teams}
                members={players.filter((p) => p.team_id === team.id)}
                busy={busy}
                onRename={onRenameTeam}
                onMovePlayer={onMovePlayer}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-inkSurface border border-dashed border-inkBorderStrong rounded-xl px-4 py-3">
            <div className="text-sm text-inkMuted flex flex-wrap items-center gap-2 min-w-0">
              {unassigned.length === 0 ? (
                "Tout le monde a une équipe."
              ) : (
                <>
                  <span>Sans équipe :</span>
                  {unassigned.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 bg-inkSurface2 border border-inkBorder rounded-lg pl-2.5 pr-1 py-0.5 text-white">
                      <span className="truncate max-w-[120px]">{p.display_name}</span>
                      <MoveSelect player={p} teams={teams} busy={busy} onMovePlayer={onMovePlayer} />
                    </span>
                  ))}
                  <span className="text-xs">— placés automatiquement au lancement s’ils n’ont pas choisi.</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onShuffle}
              disabled={busy || players.length === 0}
              className="bg-inkSurface2 border border-inkBorderStrong hover:border-sage disabled:opacity-40 transition rounded-xl px-4 py-2.5 text-sm font-bold inline-flex items-center gap-2"
            >
              <Shuffle className="w-4 h-4" /> Mélanger les équipes
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SegmentButton({
  active,
  disabled,
  onClick,
  children,
  square = false,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  square?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[40px] rounded-lg text-sm font-bold transition disabled:opacity-60 ${
        square ? "w-10" : "px-4"
      } ${active ? "bg-sage text-sageOn" : "text-inkMuted hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function TeamCard({
  team,
  teams,
  members,
  busy,
  onRename,
  onMovePlayer,
}: {
  team: Team;
  teams: Team[];
  members: Player[];
  busy: boolean;
  onRename: (teamId: string, name: string) => void;
  onMovePlayer: (playerId: string, teamId: string | null) => void;
}) {
  const color = teamColor(team);
  // Brouillon local : le nom n'est envoyé qu'à la sortie du champ (ou
  // Entrée), pas à chaque frappe. Re-synchronisé si le nom change ailleurs.
  const [draft, setDraft] = useState(team.name);
  const [lastServerName, setLastServerName] = useState(team.name);
  if (team.name !== lastServerName) {
    setLastServerName(team.name);
    setDraft(team.name);
  }
  const commit = () => {
    const name = draft.trim();
    if (name && name !== team.name) onRename(team.id, name);
    else setDraft(team.name);
  };

  return (
    <article className="bg-inkSurface border border-inkBorder rounded-2xl overflow-hidden">
      <div className="h-1.5" style={{ background: color }} />
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <TeamDot color={color} className="w-3.5 h-3.5" />
          <label className="flex-1 min-w-0">
            <span className="sr-only">Nom de l’équipe</span>
            <input
              value={draft}
              maxLength={30}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full bg-transparent border-0 border-b border-dashed border-inkBorderStrong focus:border-sage outline-none font-display font-bold text-lg py-1"
            />
          </label>
          <span className="text-xs text-inkMuted whitespace-nowrap">
            {members.length} joueur{members.length > 1 ? "s" : ""}
          </span>
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-inkMuted">Personne pour l’instant.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {members.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 bg-inkSurface2 border border-inkBorder rounded-lg pl-3 pr-1 py-1">
                <span className="truncate">{p.display_name}</span>
                <MoveSelect player={p} teams={teams} busy={busy} onMovePlayer={onMovePlayer} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Liste déroulante "changer d'équipe" (fonctionne avec 2 à 4 équipes). */
function MoveSelect({
  player,
  teams,
  busy,
  onMovePlayer,
}: {
  player: Player;
  teams: Team[];
  busy: boolean;
  onMovePlayer: (playerId: string, teamId: string | null) => void;
}) {
  return (
    <label className="shrink-0">
      <span className="sr-only">Équipe de {player.display_name}</span>
      <select
        value={player.team_id ?? ""}
        disabled={busy}
        onChange={(e) => onMovePlayer(player.id, e.target.value || null)}
        className="bg-inkSurface3 border border-inkBorder rounded-md text-xs text-inkMuted px-1.5 py-1.5 max-w-[130px]"
      >
        <option value="">Sans équipe</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
