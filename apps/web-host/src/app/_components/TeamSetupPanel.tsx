"use client";

import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { GripVertical, Shuffle, Users } from "lucide-react";
import type { Player, Team } from "../../lib/rooms";
import { teamColor } from "../../lib/teams";
import { TeamDot } from "./Teams";

/**
 * Préparation du mode équipes côté hôte (maquette "Hôte · Préparation des
 * équipes") : choix Solo / Équipes, nombre d'équipes, cartes d'équipe avec
 * nom modifiable, joueurs sans équipe, mélange.
 *
 * Répartition des joueurs par glisser-déposer : chaque joueur est une
 * pastille qu'on attrape et qu'on lâche sur une équipe (ou sur la zone
 * "Sans équipe"). Fait main avec les Pointer Events plutôt qu'avec le
 * drag & drop HTML5, qui ne marche pas au doigt sur mobile/tablette.
 * Alternative sans glisser (tactile imprécis, clavier) : toucher une
 * pastille la sélectionne, toucher ensuite une équipe l'y place.
 *
 * Affiché uniquement avant la première manche : la composition est figée
 * une fois la partie lancée (les retardataires choisissent leur équipe
 * eux-mêmes en rejoignant).
 */

// Valeur de data-drop-zone pour la zone "Sans équipe".
const NO_TEAM_ZONE = "none";
// Distance (px) au-delà de laquelle un appui devient un glisser plutôt
// qu'un simple toucher.
const DRAG_THRESHOLD = 6;

type DragState = {
  player: Player;
  x: number;
  y: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  moved: boolean;
};

function zoneAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)?.closest("[data-drop-zone]");
  return el?.getAttribute("data-drop-zone") ?? null;
}

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
  const [drag, setDrag] = useState<DragState | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const pickedPlayer = players.find((p) => p.id === picked) ?? null;

  const zoneOf = (p: Player) => (p.team_id && teams.some((t) => t.id === p.team_id) ? p.team_id : NO_TEAM_ZONE);

  const moveTo = (player: Player, zone: string) => {
    if (zone === zoneOf(player)) return;
    onMovePlayer(player.id, zone === NO_TEAM_ZONE ? null : zone);
  };

  const chipHandlers = (player: Player) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      setDrag({
        player,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        width: rect.width,
        moved: false,
      });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.player.id !== player.id) return;
      const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD;
      setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
      if (moved) setOverZone(zoneAt(e.clientX, e.clientY));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.player.id !== player.id) return;
      if (drag.moved) {
        const zone = zoneAt(e.clientX, e.clientY);
        if (zone) moveTo(player, zone);
        setPicked(null);
      } else {
        // Simple toucher : sélection, puis toucher une équipe pour l'y placer.
        setPicked((cur) => (cur === player.id ? null : player.id));
      }
      setDrag(null);
      setOverZone(null);
    },
    onPointerCancel: () => {
      setDrag(null);
      setOverZone(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPicked((cur) => (cur === player.id ? null : player.id));
      } else if (e.key === "Escape") {
        setPicked(null);
      }
    },
  });

  // Une zone de dépôt est aussi cliquable quand un joueur est sélectionné.
  const zoneProps = (zone: string) => ({
    "data-drop-zone": zone,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (!pickedPlayer || (e.target as HTMLElement).closest("input,button")) return;
      moveTo(pickedPlayer, zone);
      setPicked(null);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!pickedPlayer || e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      moveTo(pickedPlayer, zone);
      setPicked(null);
    },
    tabIndex: pickedPlayer ? 0 : -1,
    role: pickedPlayer ? "button" : undefined,
  });

  const renderChip = (p: Player, color: string | null) => (
    <PlayerChip
      key={p.id}
      player={p}
      color={color}
      busy={busy}
      dragging={drag?.moved === true && drag.player.id === p.id}
      picked={picked === p.id}
      handlers={chipHandlers(p)}
    />
  );

  const ghostTeam = drag ? teams.find((t) => t.id === drag.player.team_id) : undefined;

  return (
    <section className="w-full max-w-4xl flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold font-display flex items-center gap-2">
          <Users className="w-5 h-5 text-fg" /> Format de la partie
        </h2>
        <div className="flex flex-wrap gap-3">
          <div role="group" aria-label="Format" className="flex bg-inkSurface border-2 border-fg rounded-xl p-1 gap-1">
            <SegmentButton active={!teamMode} disabled={busy} onClick={() => onSetTeamCount(0)}>
              Solo
            </SegmentButton>
            <SegmentButton active={teamMode} disabled={busy} onClick={() => !teamMode && onSetTeamCount(2)}>
              Équipes
            </SegmentButton>
          </div>
          {teamMode && (
            <div role="group" aria-label="Nombre d'équipes" className="flex items-center bg-inkSurface border-2 border-fg rounded-xl p-1 gap-1">
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
          <p className="text-sm text-inkMuted -mt-1">
            {pickedPlayer
              ? `Touche une équipe pour y placer ${pickedPlayer.display_name}.`
              : "Glisse un joueur dans une équipe (ou touche-le, puis touche l’équipe)."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                memberCount={players.filter((p) => p.team_id === team.id).length}
                isOver={overZone === team.id}
                isTarget={pickedPlayer !== null && zoneOf(pickedPlayer) !== team.id}
                zoneProps={zoneProps(team.id)}
                onRename={onRenameTeam}
              >
                {players.filter((p) => p.team_id === team.id).map((p) => renderChip(p, teamColor(team)))}
              </TeamCard>
            ))}
          </div>

          <div
            {...zoneProps(NO_TEAM_ZONE)}
            className={`flex flex-wrap items-center justify-between gap-3 bg-inkSurface border-[3px] border-dashed rounded-xl px-4 py-3 transition ${
              overZone === NO_TEAM_ZONE ? "border-fg bg-inkSurface3 scale-[1.01]" : "border-fg/50"
            } ${pickedPlayer && zoneOf(pickedPlayer) !== NO_TEAM_ZONE ? "cursor-pointer" : ""}`}
          >
            <div className="text-sm text-inkMuted flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-fg">Sans équipe :</span>
              {unassigned.length === 0 ? (
                <span>tout le monde a une équipe.</span>
              ) : (
                <>
                  {unassigned.map((p) => renderChip(p, null))}
                  <span className="text-xs">— placés automatiquement au lancement s’ils n’ont pas choisi.</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={onShuffle}
              disabled={busy || players.length === 0}
              className="bg-inkSurface border-2 border-fg shadow-sticker-sm disabled:opacity-40 transition rounded-xl px-4 py-2.5 text-sm font-bold inline-flex items-center gap-2"
            >
              <Shuffle className="w-4 h-4" /> Mélanger les équipes
            </button>
          </div>
        </>
      )}

      {/* Pastille "fantôme" qui suit le doigt / la souris pendant le glisser. */}
      {drag?.moved && (
        <div
          aria-hidden
          className="fixed z-50 pointer-events-none"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
        >
          <span className="flex items-center gap-1.5 bg-inkSurface border-2 border-fg rounded-full pl-1.5 pr-3 py-1.5 font-bold text-sm shadow-sticker rotate-3 scale-105">
            <GripVertical className="w-4 h-4 text-inkMuted shrink-0" />
            {ghostTeam && <TeamDot color={teamColor(ghostTeam)} className="w-3 h-3" />}
            <span className="truncate">{drag.player.display_name}</span>
          </span>
        </div>
      )}
    </section>
  );
}

function PlayerChip({
  player,
  color,
  busy,
  dragging,
  picked,
  handlers,
}: {
  player: Player;
  color: string | null;
  busy: boolean;
  dragging: boolean;
  picked: boolean;
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: () => void;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  };
}) {
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={picked}
      aria-label={`${player.display_name} — glisser vers une équipe`}
      {...handlers}
      onClick={(e) => e.stopPropagation()}
      className={`touch-none select-none inline-flex items-center gap-1.5 max-w-full border-2 border-fg rounded-full pl-1.5 pr-3 py-1.5 text-sm font-bold text-fg cursor-grab active:cursor-grabbing transition disabled:opacity-50 disabled:cursor-default ${
        picked ? "bg-sage shadow-sticker -translate-y-0.5" : "bg-inkSurface shadow-sticker-sm hover:-translate-y-0.5"
      } ${dragging ? "opacity-30" : ""}`}
    >
      <GripVertical className="w-4 h-4 text-inkMuted shrink-0" />
      {color && <TeamDot color={color} className="w-3 h-3" />}
      <span className="truncate max-w-[140px]">{player.display_name}</span>
    </button>
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
      } ${active ? "bg-sage text-sageOn border-2 border-fg shadow-sticker-sm" : "text-inkMuted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

function TeamCard({
  team,
  memberCount,
  isOver,
  isTarget,
  zoneProps,
  onRename,
  children,
}: {
  team: Team;
  memberCount: number;
  isOver: boolean;
  isTarget: boolean;
  zoneProps: Record<string, unknown>;
  onRename: (teamId: string, name: string) => void;
  children: ReactNode;
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
    <article
      {...zoneProps}
      className={`bg-inkSurface border-[3px] border-fg rounded-2xl overflow-hidden transition ${
        isOver ? "shadow-sticker-lg -translate-y-1" : "shadow-sticker"
      } ${isTarget ? "cursor-pointer" : ""}`}
      // Survol pendant un glisser : contour épais à la couleur de l'équipe.
      style={isOver || isTarget ? { outline: `4px solid ${color}`, outlineOffset: 3 } : undefined}
    >
      <div className="h-3 border-b-[3px] border-fg" style={{ background: color }} />
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <TeamDot color={color} className="w-4 h-4" />
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
              className="w-full bg-transparent border-0 border-b-2 border-dashed border-fg/40 focus:border-fg outline-none font-display text-lg py-1"
            />
          </label>
          <span className="text-xs text-inkMuted whitespace-nowrap">
            {memberCount} joueur{memberCount > 1 ? "s" : ""}
          </span>
        </div>
        <div
          className={`min-h-[52px] rounded-xl flex flex-wrap items-center gap-2 p-2 transition ${
            isOver ? "bg-inkSurface3" : "bg-inkSurface3/60"
          }`}
        >
          {memberCount === 0 ? (
            <p className="text-sm text-inkMuted px-1">{isOver ? "Lâche ici !" : "Glisse des joueurs ici."}</p>
          ) : (
            children
          )}
        </div>
      </div>
    </article>
  );
}
