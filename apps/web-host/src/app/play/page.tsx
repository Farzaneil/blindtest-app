"use client";

// Page de test "joueur" dans le navigateur : rejoindre une partie + buzzer,
// sans passer par l'appli mobile native. Sert uniquement à valider le
// mécanisme central (join + buzz temps réel) pendant que la compilation
// native est mise de côté. Ouvre cette page dans plusieurs onglets pour
// simuler plusieurs joueurs.
//
// La session (playerId) est mise en cache dans sessionStorage : un refresh
// ou un retour en arrière navigateur (fausse manip courante) retrouve le
// même joueur au lieu d'en réinsérer un nouveau — ce qui aurait remis son
// score à zéro à chaque fois. sessionStorage plutôt que localStorage pour
// les mêmes raisons que côté hôte (voir app/host/page.tsx) : survit au
// refresh/back, pas à la fermeture de l'onglet, pas partagé entre onglets.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Trophy, Zap, Flame, Dice5, Check } from "lucide-react";
import { RoundTimer, roundTimeLeft } from "../_components/RoundTimer";
import {
  joinRoomByCode,
  getJoinInfoByCode,
  getTeams,
  PseudoTakenError,
  requestRejoin,
  getRejoinRequestStatus,
  subscribeToTeams,
  getPlayerSession,
  getRoomById,
  subscribeToRoom,
  subscribeToPlayers,
  subscribeToCurrentRoundForPlayer,
  subscribeToRoundHistory,
  subscribeToRoundAttempts,
  sendBuzz,
  type Player,
  type PlayerRound,
  type Round,
  type RoundAttempt,
  type Team,
} from "../../lib/rooms";
import {
  computePlayerStats,
  computeTeamStandings,
  formatSeconds,
  teamColor,
  textOnTeamColor,
  withTeamStreaks,
} from "../../lib/teams";
import { MvpBadge, TeamDot, TeamRecapTable, TeamResultBanner } from "../_components/Teams";
import { withRanks, formatOrdinal, podiumRowClasses, type RankedPlayer } from "../../lib/ranking";
import { isFullyBlockedThisRound, buzzUnlockedAtMs } from "../../lib/buzzLockout";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { useNewlyUnlockedBadges } from "../../lib/useNewlyUnlockedBadges";
import { BADGE_BY_KEY } from "../../lib/badges";
import { usePlayerCosmetics } from "../../lib/usePlayerCosmetics";
import { COSMETIC_BY_KEY, DEFAULT_COSMETIC_KEY } from "../../lib/cosmetics";
import { PlayerAccountCorner } from "../_components/PlayerAccountCorner";
import { PlayerAvatar, avatarForPlayer } from "../../lib/avatars";
import { AnimatedScoreboard, EndCeremony, podiumFrom, roundBonuses } from "../_components/ScoreAnimations";

type Session = { roomId: string; playerId: string };

const PLAYER_STORAGE_KEY = "blindtest_player_id";

function readStoredPlayerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PLAYER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredPlayerId(playerId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PLAYER_STORAGE_KEY, playerId);
  } catch {
    // Stockage indisponible (navigation privée stricte, quota…) : pas
    // grave, ça fonctionnera juste sans survivre à un refresh.
  }
}

/**
 * Code de partie passé dans l'URL (/play?code=ABC123), typiquement via le
 * QR code affiché sur l'écran hôte (voir _components/JoinQrCode.tsx).
 * Lu directement depuis window.location plutôt que via useSearchParams
 * pour ne pas avoir à envelopper la page dans un <Suspense>.
 */
function readCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("code");
  return code ? code.trim().toUpperCase() : null;
}

function clearStoredPlayerId() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PLAYER_STORAGE_KEY);
  } catch {
    // idem
  }
}

export default function PlayPage() {
  const [session, setSession] = useState<Session | null>(null);
  // Le tout premier rendu doit vérifier s'il y a une session à reprendre
  // avant d'afficher JoinView, sinon on verrait JoinView clignoter une
  // fraction de seconde même quand on va être reconnecté automatiquement.
  const [checkingSession, setCheckingSession] = useState(true);
  const [urlCode, setUrlCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const codeFromUrl = readCodeFromUrl();
      if (!cancelled) setUrlCode(codeFromUrl);
      const storedPlayerId = readStoredPlayerId();
      if (storedPlayerId) {
        const found = await getPlayerSession(storedPlayerId);
        // Arrivée via le QR code d'une AUTRE partie que celle mémorisée dans
        // cet onglet : on affiche l'écran pour rejoindre la nouvelle partie
        // plutôt que de renvoyer sur l'ancien buzzer. La session mémorisée
        // n'est pas effacée ici : elle sera simplement remplacée si le
        // joueur rejoint la nouvelle partie.
        if (found && codeFromUrl) {
          const storedRoom = await getRoomById(found.roomId);
          if (storedRoom && storedRoom.code.toUpperCase() !== codeFromUrl) {
            if (!cancelled) setCheckingSession(false);
            return;
          }
        }
        if (found && !cancelled) {
          setSession(found);
          setCheckingSession(false);
          return;
        }
        // Le joueur n'existe plus (l'hôte a lancé une nouvelle partie,
        // base réinitialisée, etc.) : on oublie cette session périmée
        // plutôt que de rester bloqué dessus.
        clearStoredPlayerId();
      }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJoined = (s: Session) => {
    writeStoredPlayerId(s.playerId);
    setSession(s);
  };

  const handleLeave = () => {
    clearStoredPlayerId();
    setSession(null);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-page">
      {checkingSession ? (
        <p className="text-inkMuted animate-pulse">Reconnexion…</p>
      ) : session ? (
        <BuzzerView roomId={session.roomId} playerId={session.playerId} onLeave={handleLeave} />
      ) : (
        <JoinView onJoined={handleJoined} initialCode={urlCode ?? ""} />
      )}
    </main>
  );
}

function JoinView({ onJoined, initialCode }: { onJoined: (s: Session) => void; initialCode: string }) {
  // Pré-rempli quand on arrive via le QR code de l'écran hôte (?code=…) :
  // il ne reste alors qu'à saisir son pseudo (ou juste à valider si on est
  // connecté à son compte joueur). JoinView n'est monté qu'une fois
  // checkingSession terminé, donc initialCode est déjà connu ici.
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Compte joueur connecté (voir usePlayerAccount) : si présent, on lie
  // account_id dès l'insertion dans `players` (voir joinRoomByCode) —
  // aucun impact sur le mode invité si non connecté (accountId undefined).
  // Connecté = plus besoin de retaper un pseudo : on utilise directement
  // celui du compte (déjà affiché en permanence par PlayerAccountCorner),
  // seul le code de la partie reste à saisir.
  const { account } = usePlayerAccount();

  // Mode équipes : dès qu'un code complet est saisi (ou pré-rempli par le
  // QR), on regarde si la partie se joue en équipes pour proposer le choix
  // de l'équipe AVANT de rejoindre (maquette "Joueur · Rejoindre").
  const [joinInfo, setJoinInfo] = useState<Awaited<ReturnType<typeof getJoinInfoByCode>>>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const normalizedCode = code.trim().toUpperCase();
  useEffect(() => {
    if (normalizedCode.length < 6) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJoinInfo(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      getJoinInfoByCode(normalizedCode)
        .then((info) => {
          if (!cancelled) setJoinInfo(info);
        })
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedCode]);
  const joinTeams = joinInfo?.gameMode === "team" ? joinInfo.teams : [];
  const needsTeam = joinTeams.length > 0;
  const selectedTeam = joinTeams.find((t) => t.id === selectedTeamId) ?? null;

  // Pseudo déjà pris dans la partie (voir PseudoTakenError) : le champ
  // passe en rouge avec un message, et un joueur connecté à son compte peut
  // alors saisir un autre pseudo pour cette partie uniquement.
  const [pseudoTaken, setPseudoTaken] = useState(false);
  const [useCustomName, setUseCustomName] = useState(false);
  // Reprise de place (voir migration 0026) : joueur existant qui porte ce
  // pseudo, et demande envoyée à l'hôte une fois que le joueur dit "c'est
  // moi". Le statut de la demande est relu toutes les 2 s tant qu'elle est
  // en attente (plus robuste qu'un abonnement temps réel pour un écran
  // qu'on ne garde que quelques secondes).
  const [rejoinTarget, setRejoinTarget] = useState<{ playerId: string; roomId: string } | null>(null);
  const [rejoinRequestId, setRejoinRequestId] = useState<string | null>(null);
  const [rejoinRefused, setRejoinRefused] = useState(false);
  useEffect(() => {
    if (!rejoinRequestId || !rejoinTarget) return;
    let cancelled = false;
    const check = async () => {
      const status = await getRejoinRequestStatus(rejoinRequestId);
      if (cancelled) return;
      if (status === "accepted") {
        onJoined({ roomId: rejoinTarget.roomId, playerId: rejoinTarget.playerId });
      } else if (status === "refused" || status === null) {
        setRejoinRequestId(null);
        setRejoinRefused(true);
      }
    };
    const interval = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [rejoinRequestId, rejoinTarget, onJoined]);

  const onRequestRejoin = async () => {
    if (!rejoinTarget) return;
    setError(null);
    setRejoinRefused(false);
    try {
      setRejoinRequestId(await requestRejoin(rejoinTarget.playerId));
    } catch (e: any) {
      setError(e?.message ?? "Impossible d’envoyer la demande à l’hôte.");
    }
  };
  const effectiveName = account && !useCustomName ? account.pseudo : name;
  const canSubmit =
    code.trim().length > 0 &&
    effectiveName.trim().length > 0 &&
    (!needsTeam || selectedTeam !== null) &&
    !loading;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { room, player } = await joinRoomByCode(
        code.trim(),
        effectiveName.trim(),
        account?.id,
        needsTeam ? selectedTeam?.id : null,
        account?.avatarKey ? { key: account.avatarKey, color: account.avatarColor, extra: account.avatarExtra } : null
      );
      onJoined({ roomId: room.id, playerId: player.id });
    } catch (e: any) {
      if (e instanceof PseudoTakenError) {
        setPseudoTaken(true);
        setRejoinTarget({ playerId: e.existingPlayerId, roomId: e.roomId });
        setRejoinRefused(false);
        if (account && !useCustomName) {
          setUseCustomName(true);
          setName(account.pseudo);
        }
      }
      setError(e?.message ?? "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-4 w-full max-w-sm bg-inkSurface border-[3px] border-inkBorder rounded-2xl px-6 py-8 shadow-sticker">
      <PlayerAccountCorner />
      <h1 className="text-3xl font-bold mb-2 font-display text-fg">Rejoindre une partie</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Code de la partie"
        className="w-full text-center text-xl uppercase bg-inkSurface2 border-2 border-inkBorder focus:border-fg outline-none transition rounded-xl px-4 py-3"
      />
      {account && !useCustomName ? (
        <p className="text-sm text-inkMuted">
          Tu rejoins en tant que <span className="font-semibold text-fg">{account.pseudo}</span>
        </p>
      ) : (
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (pseudoTaken) {
              setPseudoTaken(false);
              setRejoinTarget(null);
              setRejoinRefused(false);
              setError(null);
            }
          }}
          placeholder="Ton pseudo"
          aria-invalid={pseudoTaken}
          className={`w-full text-center text-xl bg-inkSurface2 border-2 outline-none transition rounded-xl px-4 py-3 ${
            pseudoTaken ? "border-danger focus:border-danger" : "border-inkBorder focus:border-fg"
          }`}
        />
      )}
      {useCustomName && (
        <p className="text-xs text-inkMuted text-center -mt-2">
          Ce pseudo ne vaut que pour cette partie, ton compte garde le sien.
        </p>
      )}
      {needsTeam && (
        <fieldset className="w-full flex flex-col gap-2.5">
          <legend className="text-sm text-inkMuted mb-2 text-center w-full">Choisis ton équipe</legend>
          {joinTeams.map((t) => {
            const selected = t.id === selectedTeamId;
            const color = teamColor(t);
            const members = joinInfo?.membersByTeam[t.id] ?? [];
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedTeamId(t.id)}
                className={`w-full min-h-[60px] rounded-2xl px-4 border-[3px] border-fg flex items-center justify-between gap-3 text-left transition ${
                  selected ? "shadow-sticker" : "shadow-sticker-sm"
                }`}
                style={{
                  background: selected ? color : "#FFFFFF",
                  color: selected ? textOnTeamColor(t) : "#111111",
                }}
              >
                {!selected && <TeamDot color={color} className="w-4 h-4 shrink-0" />}
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="font-bold text-lg truncate">{t.name}</span>
                  <span className="text-xs opacity-80 truncate">
                    {members.length === 0 ? "Personne encore" : members.join(", ")}
                  </span>
                </span>
                {selected && <Check className="w-6 h-6 shrink-0" />}
              </button>
            );
          })}
        </fieldset>
      )}
      {error && <p className="text-danger text-center">{error}</p>}
      {pseudoTaken && rejoinTarget && (
        <div className="w-full bg-inkSurface2 border border-inkBorder rounded-xl px-4 py-3 flex flex-col gap-2 text-center">
          {rejoinRequestId ? (
            <>
              <p className="text-sm text-fg font-semibold animate-pulse">Demande envoyée à l’hôte…</p>
              <p className="text-xs text-inkMuted">
                Dès qu’il accepte, tu reprends ta place avec ton score. Garde cette page ouverte.
              </p>
              <button
                type="button"
                onClick={() => setRejoinRequestId(null)}
                className="text-xs text-inkMuted hover:text-danger underline transition self-center"
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-inkMuted">
                {rejoinRefused
                  ? "L’hôte n’a pas validé ta demande. Choisis un autre pseudo, ou redemande-lui."
                  : "C’était toi ? Tu peux reprendre ta place (avec ton score) si l’hôte valide. Sinon, choisis un autre pseudo."}
              </p>
              <button
                type="button"
                onClick={onRequestRejoin}
                className="bg-inkSurface3 border border-inkBorderStrong hover:border-fg transition rounded-xl px-4 py-2.5 text-sm font-bold"
              >
                C’est moi : demander à reprendre ma place
              </button>
            </>
          )}
        </div>
      )}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="bg-sage text-fg hover:brightness-95 disabled:opacity-40 transition px-8 py-3 rounded-xl text-lg font-display w-full border-[3px] border-fg shadow-sticker-sm"
        style={selectedTeam ? { background: teamColor(selectedTeam), color: textOnTeamColor(selectedTeam) } : undefined}
      >
        {loading ? "..." : selectedTeam ? `Rejoindre ${selectedTeam.name}` : "Rejoindre"}
      </button>
      <Link
        href="/"
        className="text-xs text-inkMuted hover:text-fg underline transition inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Accueil
      </Link>
    </div>
  );
}

/**
 * Bandeau du haut en mode équipes (maquette "Joueur · Buzzer") : nom et
 * score de l'équipe dans sa couleur, rapport de force face à la meilleure
 * équipe adverse, contribution personnelle.
 */
function TeamHeader({
  team,
  standings,
  myScore,
  myRankInTeam,
  myName,
  streak,
}: {
  team: Team;
  standings: ReturnType<typeof computeTeamStandings>;
  myScore: number;
  myRankInTeam: number;
  myName: string;
  streak: number;
}) {
  const mine = standings.find((s) => s.team.id === team.id);
  const bestOther = standings.find((s) => s.team.id !== team.id);
  const myTotal = mine?.score ?? 0;
  const otherTotal = bestOther?.score ?? 0;
  const positive = Math.max(0, myTotal) + Math.max(0, otherTotal);
  const ratio = positive === 0 ? 50 : Math.round((Math.max(0, myTotal) / positive) * 100);
  const diff = myTotal - otherTotal;
  const on = textOnTeamColor(team);
  const summary = !bestOther
    ? ""
    : diff > 0
      ? `${diff} pt${diff > 1 ? "s" : ""} d'avance sur ${bestOther.team.name}`
      : diff < 0
        ? `${-diff} pt${diff < -1 ? "s" : ""} de retard sur ${bestOther.team.name}`
        : `Égalité avec ${bestOther.team.name}`;
  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ background: teamColor(team), color: on }}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-display font-bold text-xl truncate">{team.name}</span>
          {mine && standings.length > 1 && <span className="text-sm font-semibold whitespace-nowrap">{formatOrdinal(mine.rank)} / {standings.length}</span>}
        </div>
        {bestOther && (
          <div className="flex items-center gap-3 tabular-nums">
            <span className="font-display font-bold text-3xl leading-none">{myTotal}</span>
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(10,10,12,0.25)" }}
              role="img"
              aria-label={`${team.name} ${myTotal} points, ${bestOther.team.name} ${otherTotal} points`}
            >
              <div className="h-full" style={{ width: `${ratio}%`, background: on }} />
            </div>
            <span className="font-display font-bold text-xl leading-none opacity-70">{otherTotal}</span>
          </div>
        )}
        {summary && <span className="text-xs font-semibold opacity-80">{summary}</span>}
      </div>
      <p className="text-sm text-center text-inkMuted flex items-center justify-center gap-1.5">
        <span className="text-fg font-semibold truncate max-w-[140px]">{myName}</span>
        {streak >= 3 && (
          <span className="inline-flex items-center gap-0.5 text-xs text-amberStrong" title="Ton équipe enchaîne : buzzer retardé en début de manche">
            <Flame className="w-3.5 h-3.5" /> {streak}
          </span>
        )}
        · ta contribution : <span className="font-bold text-fg">{myScore} pts</span>
        {myRankInTeam > 0 && <span>({formatOrdinal(myRankInTeam)} de l’équipe)</span>}
      </p>
    </div>
  );
}

/** Classement compact des équipes, pendant la fenêtre de révélation. */
function TeamMiniStandings({
  standings,
  myTeamId,
}: {
  standings: ReturnType<typeof computeTeamStandings>;
  myTeamId: string | null;
}) {
  return (
    <ul className="w-full bg-inkSurface border-[3px] border-inkBorder rounded-2xl px-4 py-3 flex flex-col gap-2 text-sm shadow-sticker">
      {standings.map((st) => (
        <li key={st.team.id} className={`flex justify-between gap-3 ${st.team.id === myTeamId ? "text-fg font-bold" : "text-inkMuted"}`}>
          <span className="flex items-center gap-2 min-w-0">
            <TeamDot color={teamColor(st.team)} className="w-2.5 h-2.5" />
            <span className="truncate">
              {st.rank}. {st.team.name}
            </span>
          </span>
          <span className="font-display font-bold tabular-nums">{st.score}</span>
        </li>
      ))}
    </ul>
  );
}

function BuzzerView({
  roomId,
  playerId,
  onLeave,
}: {
  roomId: string;
  playerId: string;
  onLeave: () => void;
}) {
  const [round, setRound] = useState<PlayerRound | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [sending, setSending] = useState(false);
  // Statut de la room ("lobby" / "in_progress" / "finished") : permet
  // d'afficher l'écran de fin de partie enrichi dès que l'hôte marque la
  // file d'attente comme épuisée (voir finishRoom côté host/page.tsx), sans
  // quoi rien ne prévient un joueur que la partie est terminée puisque
  // `rounds` ne change plus une fois la dernière manche jugée.
  const [roomStatus, setRoomStatus] = useState<"lobby" | "in_progress" | "finished" | null>(null);
  // Mode équipes (voir migration 0025) : format de la partie + équipes,
  // synchronisés en direct (l'hôte peut renommer ou changer de format
  // avant le lancement).
  const [gameMode, setGameMode] = useState<"solo" | "team">("solo");
  const [teams, setTeams] = useState<Team[]>([]);
  // Compte joueur connecté (voir usePlayerAccount) : uniquement pour savoir
  // à qui notifier un badge tout juste débloqué (voir
  // useNewlyUnlockedBadges ci-dessous) — un joueur invité (accountId
  // undefined) ne voit simplement jamais cette notification.
  const { account } = usePlayerAccount();
  const newlyUnlockedBadges = useNewlyUnlockedBadges(account?.id, roomStatus === "finished");
  // Skin de buzzer équipé (voir usePlayerCosmetics, migration 0022) : un
  // joueur invité (accountId undefined) garde le rendu par défaut (Sage),
  // identique à ce qui existait avant la phase 4 — aucun changement visuel
  // pour qui ne s'est jamais connecté.
  const { equippedKey } = usePlayerCosmetics(account?.id ?? "");
  const baseCosmetic = COSMETIC_BY_KEY[account ? equippedKey : DEFAULT_COSMETIC_KEY] ?? COSMETIC_BY_KEY[DEFAULT_COSMETIC_KEY];
  // Historique + tentatives : uniquement nécessaires pour calculer les
  // statistiques de l'écran de fin de partie (buzzeur le plus rapide,
  // manche la plus disputée) — mêmes données et même calcul que côté hôte,
  // pour rester cohérent entre les deux écrans.
  const [roundHistory, setRoundHistory] = useState<Round[]>([]);
  const [roundAttempts, setRoundAttempts] = useState<RoundAttempt[]>([]);

  useEffect(() => {
    return subscribeToCurrentRoundForPlayer(roomId, setRound);
  }, [roomId]);

  // Nécessaire pour afficher le pseudo/score/rang du joueur et le nom de
  // qui a buzzé en premier (voir lib/ranking.ts pour le calcul du rang,
  // partagé avec l'écran hôte pour rester cohérent).
  useEffect(() => {
    return subscribeToPlayers(roomId, setPlayers);
  }, [roomId]);

  useEffect(() => {
    return subscribeToRoom(roomId, (room) => {
      setRoomStatus(room?.status ?? null);
      setGameMode(room?.game_mode ?? "solo");
      // configure_room_teams met toujours à jour la room : on en profite
      // pour relire les équipes, sans dépendre uniquement de l'écho
      // Realtime de subscribeToTeams (même cause que le bug "Solo ->
      // Équipes" côté hôte, voir handleSetTeamCount).
      getTeams(roomId).then(setTeams).catch(() => {});
    });
  }, [roomId]);

  useEffect(() => {
    return subscribeToTeams(roomId, setTeams);
  }, [roomId]);

  useEffect(() => {
    return subscribeToRoundHistory(roomId, setRoundHistory);
  }, [roomId]);

  useEffect(() => {
    return subscribeToRoundAttempts(roomId, setRoundAttempts);
  }, [roomId]);

  const alreadyBuzzed =
    round?.status === "buzzed" || round?.status === "revealed" || round?.status === "scored";
  // En mode "Tout le monde participe" (round.blind_mode), un seul buzz
  // clôture toujours la manche (voir resolveRoundAttempt/forceEnd côté
  // hôte) : révéler dès "revealed" plutôt qu'attendre "scored" ne peut
  // donc jamais donner un avantage à un futur buzzeur sur CETTE manche, et
  // évite l'attente inutile pendant que l'hôte choisit le nombre de
  // points à attribuer. En mode "Maître du jeu", une manche peut au
  // contraire reprendre après une réponse partielle : revealed y reste
  // réservé à l'hôte (voir round.status === "revealed" côté
  // app/host/page.tsx), pas affiché ici avant "scored".
  const answerRevealed = round?.blind_mode
    ? round?.status === "revealed" || round?.status === "scored"
    : round?.status === "scored";
  // Mode "Maître du jeu" uniquement : ce joueur vient de répondre (bon ou
  // mauvais) sur cette manche et doit laisser un autre joueur tenter sa
  // chance avant de pouvoir rebuzzer — débloqué dès qu'un autre joueur
  // buzze à son tour (voir resolveRoundAttempt côté hôte).
  const isLocked = round?.status === "playing" && round.locked_player_id === playerId;
  const iWon = alreadyBuzzed && round?.buzzed_by_player_id === playerId;
  const buzzer = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;
  const somethingAlreadyFound = round && (round.title_found || round.artist_found);

  const ranked = withRanks(players);
  const me = ranked.find((p) => p.id === playerId);
  const teamMode = gameMode === "team" && teams.length > 0;
  const myTeam = teamMode && me?.team_id ? (teams.find((t) => t.id === me.team_id) ?? null) : null;
  const teamStandings = teamMode ? computeTeamStandings(teams, players) : [];
  const myStanding = myTeam ? teamStandings.find((s) => s.team.id === myTeam.id) : undefined;
  const teamOf = (pid: string | null | undefined) => {
    const p = pid ? players.find((x) => x.id === pid) : undefined;
    return teamMode && p?.team_id ? (teams.find((t) => t.id === p.team_id) ?? null) : null;
  };
  // Séries bonus/malus portées par l'équipe (même règle que le serveur).
  const meForLockout = me ? withTeamStreaks(me, players, teamMode) : me;
  // Mode équipes : le buzzer prend la couleur de l'équipe si le joueur n'a
  // pas équipé de skin (skin par défaut) ; un skin choisi reste prioritaire
  // sur le remplissage, seul l'anneau extérieur passe à la couleur d'équipe.
  const equippedCosmetic =
    myTeam && baseCosmetic.key === DEFAULT_COSMETIC_KEY
      ? {
          ...baseCosmetic,
          swatch: teamColor(myTeam),
          accentColor: teamColor(myTeam),
          textOn: textOnTeamColor(myTeam) === "#FFFFFF" ? ("light" as const) : ("dark" as const),
          icon: undefined,
        }
      : myTeam
        ? { ...baseCosmetic, accentColor: teamColor(myTeam) }
        : baseCosmetic;
  // Anneau couleur d'équipe autour du buzzer quand un skin perso est équipé
  // (avec le skin par défaut, c'est déjà le remplissage qui porte l'équipe).
  const buzzRing = myTeam && baseCosmetic.key !== DEFAULT_COSMETIC_KEY ? teamColor(myTeam) : null;

  // Classement animé affiché à la révélation de la réponse (voir
  // AnimatedScoreboard) : previousScores mémorise les scores tels
  // qu'il était juste AVANT que les points de la manche en cours ne soient
  // distribués — capturé une seule fois par manche, au moment où elle passe
  // à "playing" (donc juste après que les points de la manche PRÉCÉDENTE
  // ont déjà été appliqués). Un state plutôt qu'une ref : lire ref.current
  // pendant le rendu (pour le passer en prop à AnimatedScoreboard plus
  // bas) n'est pas autorisé par les règles de pureté de React.
  const [previousScores, setPreviousScores] = useState<Record<string, number> | null>(null);
  const snapshotRoundIdRef = useRef<string | null>(null);
  const roundIdForSnapshot = round?.id ?? null;
  const roundStatusForSnapshot = round?.status ?? null;
  useEffect(() => {
    if (
      roundStatusForSnapshot === "playing" &&
      roundIdForSnapshot &&
      snapshotRoundIdRef.current !== roundIdForSnapshot
    ) {
      setPreviousScores(Object.fromEntries(players.map((p) => [p.id, p.score])));
      snapshotRoundIdRef.current = roundIdForSnapshot;
    }
  }, [roundIdForSnapshot, roundStatusForSnapshot, players]);

  // Malus buzzer (voir lib/buzzLockout.ts + migration 0017) : la vraie
  // application se fait côté serveur (resolve_buzz_winner) — ceci ne sert
  // qu'à refléter visuellement l'état à ce joueur (bouton désactivé,
  // compte à rebours). Tick toutes les 250ms tant qu'une manche est en
  // cours, comme le timer équivalent côté hôte.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (round?.status !== "playing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNow(null);
      return;
    }
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [round?.id, round?.status]);

  const fullyBlocked = meForLockout && round ? isFullyBlockedThisRound(meForLockout, round) : false;
  const unlockedAtMs =
    meForLockout && round ? buzzUnlockedAtMs(meForLockout.correct_streak_count, round.started_at) : null;
  const lockoutRemainingSeconds =
    now !== null && unlockedAtMs ? Math.max(0, Math.ceil((unlockedAtMs - now) / 1000)) : 0;
  const isLockedOut = lockoutRemainingSeconds > 0;

  const timeLeft = roundTimeLeft(round, now);

  const canBuzz = round?.status === "playing" && !sending && !isLocked && !fullyBlocked && !isLockedOut;

  // Mêmes calculs que sur l'écran hôte (voir app/host/page.tsx) : temps de
  // réaction minimal parmi les tentatives qui ont valu 2 points (titre ET
  // artiste trouvés — une réponse fausse ou partielle rapide ne doit pas
  // gagner ce titre), et manche ayant reçu le plus de tentatives jugées.
  const fastestAttempt = roundAttempts
    .filter((a) => a.title_found && a.artist_found && a.reaction_seconds !== null)
    .reduce<RoundAttempt | null>((best, a) => {
      if (!best || (a.reaction_seconds as number) < (best.reaction_seconds as number)) return a;
      return best;
    }, null);
  const fastestPlayer = fastestAttempt
    ? players.find((p) => p.id === fastestAttempt.player_id)
    : null;

  // Bonus vitesse/remontada (voir migration 0017) éventuellement obtenus
  // sur LA manche en cours, pour affichage dans le bloc réponse révélée
  // ci-dessous — pas besoin d'une souscription dédiée, roundAttempts est
  // déjà là pour les stats de fin de partie.
  const currentRoundAttempts = round ? roundAttempts.filter((a) => a.round_id === round.id) : [];
  const currentRoundHadSpeedBonus = currentRoundAttempts.some((a) => a.speed_bonus_awarded);
  const currentRoundHadRemontadaBonus = currentRoundAttempts.some((a) => a.remontada_bonus_awarded);

  const attemptCountByRound = new Map<string, number>();
  for (const a of roundAttempts) {
    attemptCountByRound.set(a.round_id, (attemptCountByRound.get(a.round_id) ?? 0) + 1);
  }
  let mostContestedRound: Round | null = null;
  let mostContestedCount = 0;
  for (const r of roundHistory) {
    const count = attemptCountByRound.get(r.id) ?? 0;
    if (count > mostContestedCount) {
      mostContestedCount = count;
      mostContestedRound = r;
    }
  }

  const onBuzz = async () => {
    if (!round || !canBuzz) return;
    setSending(true);
    try {
      await sendBuzz(round.id, playerId);
    } finally {
      setSending(false);
    }
  };

  if (roomStatus === "finished" && teamMode) {
    const stats = computePlayerStats(players, roundAttempts);
    const myStats = stats.get(playerId);
    const share =
      me && myStanding && myStanding.score > 0 ? Math.round((Math.max(0, me.score) / myStanding.score) * 100) : null;
    const otherStandings = teamStandings.filter((st) => st.team.id !== myTeam?.id);
    const myTeamRank = myStanding?.rank ?? null;
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <EndCeremony
          compact
          confetti={myTeamRank === 1}
          title={<p className="text-2xl font-bold text-fg text-center font-display">Partie terminée !</p>}
          podium={podiumFrom(teamStandings, (st) => ({ id: st.team.id, name: st.team.name, score: st.score, color: teamColor(st.team) }))}
          headline={
            myTeam &&
            myTeamRank !== null && (
              <p
                className="font-display text-2xl border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-2 -rotate-2"
                style={{ background: teamColor(myTeam), color: textOnTeamColor(myTeam) }}
              >
                {myTeamRank === 1
                  ? `${myTeam.name} ${/^les\s/i.test(myTeam.name) ? "gagnent" : "gagne"} !`
                  : `${myTeam.name} : ${formatOrdinal(myTeamRank)}`}
              </p>
            )
          }
        >
          <TeamResultBanner standings={teamStandings} perspectiveTeamId={myTeam?.id ?? null} />

          {newlyUnlockedBadges.length > 0 && (
            <div className="w-full flex flex-col gap-2">
              {newlyUnlockedBadges.map((u) => {
                const def = BADGE_BY_KEY[u.badgeKey];
                if (!def) return null;
                return (
                  <div key={`${u.badgeKey}:${u.tier}`} className="flex items-center gap-3 bg-inkSurface2 border border-inkBorder rounded-xl px-4 py-3">
                    <def.icon className="w-6 h-6 shrink-0 text-fg" />
                    <p className="text-sm font-bold text-fg">Badge débloqué : {def.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {me && (
            <section
              className="w-full bg-inkSurface border-[3px] rounded-2xl p-4 flex flex-col gap-3 shadow-sticker"
              style={{ borderColor: myStanding?.mvpPlayerId === playerId ? "#F5A524" : "#111111" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-lg truncate">Toi · {me.display_name}</span>
                {myStanding?.mvpPlayerId === playerId && <MvpBadge label={`MVP ${myTeam?.name ?? ""}`.trim()} />}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                <div className="bg-inkSurface2 rounded-xl py-2.5">
                  <p className="font-display font-bold text-xl">{me.score}</p>
                  <p className="text-[11px] text-inkMuted">points</p>
                </div>
                <div className="bg-inkSurface2 rounded-xl py-2.5">
                  <p className="font-display font-bold text-xl">{myStats?.goodAnswers ?? 0}</p>
                  <p className="text-[11px] text-inkMuted">bonnes rép.</p>
                </div>
                <div className="bg-inkSurface2 rounded-xl py-2.5">
                  <p className="font-display font-bold text-xl">
                    {myStats?.fastestSeconds != null ? formatSeconds(myStats.fastestSeconds) : "—"}
                  </p>
                  <p className="text-[11px] text-inkMuted">buzz record</p>
                </div>
              </div>
              {share !== null && (
                <p className="text-sm text-inkMuted">Tu as apporté {share} % des points de ton équipe.</p>
              )}
            </section>
          )}

          {myStanding && <TeamRecapTable standing={myStanding} stats={stats} highlightPlayerId={playerId} />}

          {otherStandings.length > 0 && (
            <details className="w-full">
              <summary className="text-sm text-inkMuted hover:text-fg cursor-pointer text-center py-2">
                Voir le détail des autres équipes
              </summary>
              <div className="flex flex-col gap-3 mt-2">
                {otherStandings.map((st) => (
                  <TeamRecapTable key={st.team.id} standing={st} stats={stats} />
                ))}
              </div>
            </details>
          )}

          <div className="flex gap-4">
            <Link href="/" className="text-xs text-inkMuted hover:text-fg underline transition inline-flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Accueil
            </Link>
            <button onClick={onLeave} className="text-xs text-inkMuted hover:text-danger underline transition">
              Quitter la partie
            </button>
          </div>
        </EndCeremony>
      </div>
    );
  }

  if (roomStatus === "finished") {
    const meRanked = ranked.find((p) => p.id === playerId) ?? null;
    return (
      <div className="relative flex flex-col items-center gap-6 w-full max-w-sm bg-inkSurface border-[3px] border-inkBorder rounded-2xl px-6 py-8 shadow-sticker">
        <EndCeremony
          compact
          confetti={meRanked?.rank === 1}
          title={
            <>
              <Trophy className="w-10 h-10 text-fg" />
              <p className="text-2xl font-bold text-fg text-center font-display">Partie terminée !</p>
            </>
          }
          podium={podiumFrom(ranked, (p) => ({ id: p.id, name: p.display_name, score: p.score, avatar: avatarForPlayer(p) }))}
          headline={
            meRanked && (
              <p
                className={`font-display text-2xl border-[3px] border-fg rounded-2xl shadow-sticker px-5 py-2 -rotate-2 ${
                  meRanked.rank === 1 ? "bg-gold" : "bg-info"
                }`}
              >
                {meRanked.rank === 1 ? "Tu gagnes !" : `Tu finis ${formatOrdinal(meRanked.rank)} / ${ranked.length}`}
              </p>
            )
          }
        >

          {newlyUnlockedBadges.length > 0 && (
            <div className="w-full flex flex-col gap-2">
              {newlyUnlockedBadges.map((u) => {
                const def = BADGE_BY_KEY[u.badgeKey];
                if (!def) return null;
                const tierLabel = u.tier === "or" ? "Or" : u.tier === "argent" ? "Argent" : "Bronze";
                const tierColor = u.tier === "or" ? "text-fg" : u.tier === "argent" ? "text-inkMuted" : "text-fg";
                return (
                  <div
                    key={`${u.badgeKey}:${u.tier}`}
                    className="flex items-center gap-3 bg-inkSurface2 border border-inkBorder rounded-xl px-4 py-3"
                  >
                    <def.icon className={`w-6 h-6 shrink-0 ${tierColor}`} />
                    <p className="text-sm text-left">
                      <span className="font-bold text-fg">Badge débloqué : {def.label}</span>{" "}
                      <span className={`font-semibold ${tierColor}`}>({tierLabel})</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {(fastestAttempt || mostContestedCount > 1) && (
            <div className="grid grid-cols-1 gap-3 w-full">
              {fastestAttempt && (
                <div className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-xl px-4 py-3 text-left">
                  <p className="text-xs text-inkMuted flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Buzzeur le plus rapide
                  </p>
                  <p className="text-sm font-bold text-fg">
                    {fastestPlayer?.display_name ?? "Joueur"} —{" "}
                    {(fastestAttempt.reaction_seconds as number).toFixed(1)}s
                  </p>
                </div>
              )}
              {mostContestedRound && mostContestedCount > 1 && (
                <div className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-xl px-4 py-3 text-left">
                  <p className="text-xs text-inkMuted flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" /> Manche la plus disputée
                  </p>
                  <p className="text-sm font-bold text-fg">
                    {mostContestedRound.title} ({mostContestedCount} tentatives)
                  </p>
                </div>
              )}
            </div>
          )}

          <ul className="w-full space-y-2 text-left max-h-64 overflow-y-auto pr-1">
            {ranked.map((p) => {
              const plate = podiumRowClasses(p.rank);
              return (
                <li key={p.id} className={`flex justify-between rounded-xl border-2 border-fg px-4 py-3 ${plate.row}`}>
                  <span className={`flex items-center gap-2 ${plate.text}`}>
                    <span className="font-display font-black">{p.rank}.</span> {p.display_name}
                  </span>
                  <span className={`font-black font-display ${plate.text}`}>{p.score} pts</span>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-4">
            <Link
              href="/"
              className="text-xs text-inkMuted hover:text-fg underline transition inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Accueil
            </Link>
            <button onClick={onLeave} className="text-xs text-inkMuted hover:text-danger underline transition">
              Quitter la partie
            </button>
          </div>
        </EndCeremony>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      {/* Bandeau pseudo/score/rang : masqué pendant la fenêtre de révélation
          (voir answerRevealed), où le classement complet ci-dessous prend
          le relais et rendrait ce résumé redondant. Visible dans tous les
          autres cas, y compris avant le tout premier lancement de manche
          (round === null) et pendant qu'une manche est en cours. */}
      {!answerRevealed && myTeam && myStanding && (
        <TeamHeader
          team={myTeam}
          standings={teamStandings}
          myScore={me?.score ?? 0}
          myRankInTeam={myStanding.players.findIndex((p) => p.id === playerId) + 1}
          myName={me?.display_name ?? "…"}
          streak={meForLockout?.correct_streak_count ?? 0}
        />
      )}
      {!answerRevealed && !myTeam && (
        <div className="relative w-full flex justify-between items-center bg-inkSurface border-[3px] border-inkBorder rounded-2xl px-5 py-3 shadow-sticker">
          <span className="font-bold truncate flex items-center gap-2">
            {me && <PlayerAvatar player={me} size={34} />}
            {me?.display_name ?? "…"}
            {/* Malus buzzer en cours (voir lib/buzzLockout.ts) : purement
                informatif, l'application réelle se fait côté serveur. */}
            {me && me.correct_streak_count >= 3 && (
              <span
                className="inline-flex items-center gap-0.5 text-xs text-amberStrong shrink-0"
                title={`${me.correct_streak_count} bonnes réponses d'affilée — ton buzzer est retardé en début de manche`}
              >
                <Flame className="w-3.5 h-3.5" /> {me.correct_streak_count}
              </span>
            )}
          </span>
          <span className="text-sm text-inkMuted whitespace-nowrap">
            {me ? `${formatOrdinal(me.rank)} / ${players.length}` : ""}{" "}
            <span className="font-bold text-fg">· {me?.score ?? 0} pts</span>
          </span>
        </div>
      )}

      {!round ? (
        <div className="w-full flex flex-col items-center gap-4">
          <p className="text-xl text-inkMuted text-center animate-pulse">
            En attente du lancement d’une manche par l’hôte…
          </p>
          {/* Liste des joueurs déjà inscrits, avant le tout premier
              lancement (voir le commentaire sur subscribeToCurrentRoundForPlayer
              dans lib/rooms.ts : round ne redevient jamais null une fois la
              première manche créée, cette liste ne peut donc apparaître
              qu'ici, jamais entre deux manches). Pas de classement ici :
              tout le monde est encore à 0 point, un rang n'aurait pas de sens. */}
          {players.length > 0 && (
            <ul className="w-full space-y-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className="bg-inkSurface2 border border-inkBorder rounded-xl px-4 py-2.5 text-center truncate flex items-center justify-center gap-2"
                >
                  {teamOf(p.id) && <TeamDot color={teamColor(teamOf(p.id))} className="w-2.5 h-2.5" />}
                  {p.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : answerRevealed ? (
        <>
          {round.is_joker && (
            <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full">
              <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
            </span>
          )}
          {alreadyBuzzed && (
            <p className={`text-xl font-bold text-center text-fg`}>
              {iWon
                ? "Tu as buzzé en premier !"
                : round.buzzed_by_player_id === null
                  ? "Personne n’a buzzé à temps"
                  : `${buzzer?.display_name ?? "Un autre joueur"}${teamOf(buzzer?.id) ? ` (${teamOf(buzzer?.id)?.name})` : ""} a buzzé en premier !`}
            </p>
          )}
          <div className="relative w-full text-center bg-inkSurface border-[3px] border-inkBorder rounded-2xl px-6 py-4 shadow-sticker">
            <p className="text-sm text-inkMuted mb-1">La réponse était :</p>
            <p className="text-xl font-bold text-fg font-display">
              {round.title} — {round.artist}
            </p>
            {(currentRoundHadSpeedBonus || currentRoundHadRemontadaBonus) && (
              <p className="text-xs text-amberStrong mt-2">
                {[currentRoundHadSpeedBonus && "bonus vitesse", currentRoundHadRemontadaBonus && "bonus remontada"]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {/* Classement complet animé (voir AnimatedScoreboard) : remplace
              le bouton buzz pendant toute cette fenêtre de révélation,
              jusqu'à ce que l'hôte relance une manche — voir le rendu
              conditionnel ci-dessus (round.status repasse alors à
              "playing" sur un round.id différent, ce qui redémonte ce
              composant et fait réapparaître le buzzer). */}
          {teamMode && <TeamMiniStandings standings={teamStandings} myTeamId={myTeam?.id ?? null} />}
          <AnimatedScoreboard
            players={players}
            baseline={previousScores}
            meId={playerId}
            variant="phone"
            bonuses={roundBonuses(roundAttempts, round)}
            className="max-h-96 overflow-y-auto"
          />
        </>
      ) : (
        <>
          {round.is_joker && (
            <span className="inline-flex items-center gap-1.5 bg-amber text-amberOn font-display font-bold text-xs px-4 py-1.5 rounded-full">
              <Dice5 className="w-3.5 h-3.5" /> JOKER — POINTS DOUBLÉS
            </span>
          )}
          {somethingAlreadyFound && (
            <p className="text-sm text-inkMuted text-center">
              Déjà trouvé : {[round.title_found && "titre", round.artist_found && "artiste"]
                .filter(Boolean)
                .join(" et ")}
              {" — à vous de jouer pour le reste !"}
            </p>
          )}
          <RoundTimer timeLeft={timeLeft} />
          <button
            onClick={onBuzz}
            disabled={!canBuzz}
            className={`buzzer-3d relative overflow-hidden w-56 h-56 rounded-full text-4xl font-display ${
              canBuzz ? "buzzer-ready" : alreadyBuzzed && iWon ? "buzzer-pressed" : "buzzer-off bg-inkSurface2 text-inkMuted"
            }`}
            /* Skin de buzzer équipé (voir usePlayerCosmetics, migration
               0022) : appliqué uniquement quand CE buzzer représente
               vraiment "le mien" (prêt à buzzer, ou je viens de gagner) —
               les états bloqué/perdu restent volontairement neutres (gris),
               ce ne sont pas des moments de mise en avant du skin. */
            style={
              canBuzz || (alreadyBuzzed && iWon)
                ? ({
                    background: equippedCosmetic.swatch,
                    color: equippedCosmetic.textOn === "dark" ? "#111111" : "#FFFFFF",
                    // Anneau couleur d'équipe quand un skin perso est équipé
                    // (le remplissage reste celui du skin).
                    "--buzz-ring": buzzRing ?? "transparent",
                    "--buzz-ring-w": buzzRing ? "8px" : "0px",
                  } as CSSProperties)
                : undefined
            }
          >
            {(canBuzz || (alreadyBuzzed && iWon)) && equippedCosmetic.icon && (
              <span className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                {equippedCosmetic.icon({ size: 140 })}
              </span>
            )}
            {/* Même étiquette blanche "BUZZ" / "BUZZÉ !" quel que soit le skin,
                lisible sur les unis comme sur les motifs. */}
            <span
              className={`relative inline-flex items-center justify-center ${
                canBuzz || (alreadyBuzzed && iWon)
                  ? "bg-inkSurface text-fg border-[3px] border-fg rounded-2xl px-4 py-1 shadow-sticker-sm whitespace-nowrap -rotate-3"
                  : ""
              }`}
            >
              {alreadyBuzzed ? (
                iWon ? (
                  <span className="inline-flex items-center gap-2 text-3xl whitespace-nowrap">
                                        BUZZÉ !
                  </span>
                ) : (
                  // Manche close par le timer, sans aucun buzz.
                  round.buzzed_by_player_id ? "BUZZÉ" : "TERMINÉ"
                )
              ) : fullyBlocked ? (
                "BLOQUÉ"
              ) : isLockedOut ? (
                `${lockoutRemainingSeconds}s`
              ) : (
                "BUZZ"
              )}
            </span>
          </button>
          {alreadyBuzzed && (
            <p className={`text-xl font-bold text-center text-fg`}>
              {iWon
                ? "Tu as buzzé en premier !"
                : round.buzzed_by_player_id === null
                  ? "Personne n’a buzzé à temps"
                  : `${buzzer?.display_name ?? "Un autre joueur"}${teamOf(buzzer?.id) ? ` (${teamOf(buzzer?.id)?.name})` : ""} a buzzé en premier !`}
            </p>
          )}
          {!alreadyBuzzed && fullyBlocked && (
            <p className="text-sm font-bold text-fg text-center">
              Ton buzzer est bloqué ce tour-ci — trop de premières réponses ratées d’affilée.
            </p>
          )}
          {!alreadyBuzzed && !fullyBlocked && isLockedOut && (
            <p className="text-sm text-inkMuted text-center">
              Trop de bonnes réponses d’affilée : buzzer débloqué dans {lockoutRemainingSeconds}s.
            </p>
          )}
          {isLocked && (
            <p className="text-sm text-inkMuted text-center">
              Tu viens de répondre — attends qu’un autre joueur tente sa chance avant de rebuzzer.
            </p>
          )}
        </>
      )}
      <div className="flex gap-4">
        <Link
          href="/"
          className="text-xs text-inkMuted hover:text-fg underline transition inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
        <button onClick={onLeave} className="text-xs text-inkMuted hover:text-danger underline transition">
          Quitter la partie
        </button>
      </div>
    </div>
  );
}
