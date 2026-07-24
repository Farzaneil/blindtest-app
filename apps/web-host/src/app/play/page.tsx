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
import { useEffect, useState } from "react";
import {
  joinRoomByCode,
  getPlayerSession,
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
} from "../../lib/rooms";
import { withRanks, formatOrdinal } from "../../lib/ranking";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const storedPlayerId = readStoredPlayerId();
      if (storedPlayerId) {
        const found = await getPlayerSession(storedPlayerId);
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
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      {checkingSession ? (
        <p className="text-muted animate-pulse">Reconnexion…</p>
      ) : session ? (
        <BuzzerView roomId={session.roomId} playerId={session.playerId} onLeave={handleLeave} />
      ) : (
        <JoinView onJoined={handleJoined} />
      )}
    </main>
  );
}

function JoinView({ onJoined }: { onJoined: (s: Session) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && !loading;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { room, player } = await joinRoomByCode(code.trim(), name.trim());
      onJoined({ roomId: room.id, playerId: player.id });
    } catch (e: any) {
      setError(e?.message ?? "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm bg-surface border border-surfaceBorder rounded-3xl px-6 py-8 shadow-glowAccent">
      <h1 className="text-3xl font-black mb-2 text-accentSoft">Rejoindre une partie</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Code de la partie"
        className="w-full text-center text-xl uppercase bg-white/5 border-2 border-accent focus:shadow-glowAccent outline-none transition rounded-xl px-4 py-3"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ton pseudo"
        className="w-full text-center text-xl bg-white/5 border-2 border-accent focus:shadow-glowAccent outline-none transition rounded-xl px-4 py-3"
      />
      {error && <p className="text-danger text-center">{error}</p>}
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="bg-accent shadow-glowAccent hover:brightness-110 disabled:opacity-40 disabled:shadow-none transition px-8 py-3 rounded-full text-lg font-bold w-full"
      >
        {loading ? "..." : "Rejoindre"}
      </button>
      <Link href="/" className="text-xs text-muted hover:text-accentSoft underline transition">
        ← Accueil
      </Link>
    </div>
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
    return subscribeToRoom(roomId, (room) => setRoomStatus(room?.status ?? null));
  }, [roomId]);

  useEffect(() => {
    return subscribeToRoundHistory(roomId, setRoundHistory);
  }, [roomId]);

  useEffect(() => {
    return subscribeToRoundAttempts(roomId, setRoundAttempts);
  }, [roomId]);

  const alreadyBuzzed =
    round?.status === "buzzed" || round?.status === "revealed" || round?.status === "scored";
  const answerRevealed = round?.status === "scored";
  // Mode "Maître du jeu" uniquement : ce joueur vient de répondre (bon ou
  // mauvais) sur cette manche et doit laisser un autre joueur tenter sa
  // chance avant de pouvoir rebuzzer — débloqué dès qu'un autre joueur
  // buzze à son tour (voir resolveRoundAttempt côté hôte).
  const isLocked = round?.status === "playing" && round.locked_player_id === playerId;
  const canBuzz = round?.status === "playing" && !sending && !isLocked;
  const iWon = alreadyBuzzed && round?.buzzed_by_player_id === playerId;
  const buzzer = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;
  const somethingAlreadyFound = round && (round.title_found || round.artist_found);

  const ranked = withRanks(players);
  const me = ranked.find((p) => p.id === playerId);

  // Mêmes calculs que sur l'écran hôte (voir app/host/page.tsx) : temps de
  // réaction minimal parmi les tentatives qui ont valu 2 points (titre ET
  // artiste trouvés — une réponse fausse ou partielle rapide ne doit pas
  // gagner ce titre), et manche ayant reçu le plus de tentatives jugées.
  const fastestAttempt = roundAttempts
    .filter((a) => a.points_awarded === 2 && a.reaction_seconds !== null)
    .reduce<RoundAttempt | null>((best, a) => {
      if (!best || (a.reaction_seconds as number) < (best.reaction_seconds as number)) return a;
      return best;
    }, null);
  const fastestPlayer = fastestAttempt
    ? players.find((p) => p.id === fastestAttempt.player_id)
    : null;

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

  if (roomStatus === "finished") {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm bg-surface border border-surfaceBorder rounded-3xl px-6 py-8">
        <p className="text-3xl font-bold text-gold text-center">🏁 Partie terminée !</p>

        {ranked.length > 0 && (
          <div className="flex items-end justify-center gap-3">
            {ranked
              .filter((p) => p.rank <= 3)
              .sort((a, b) => a.rank - b.rank)
              .map((p) => {
                const height = p.rank === 1 ? "h-24" : p.rank === 2 ? "h-16" : "h-12";
                const podiumColor =
                  p.rank === 1
                    ? "border-accent bg-accent/10 text-accentSoft"
                    : p.rank === 2
                      ? "border-accent2 bg-accent2/10 text-accent2Soft"
                      : "border-danger bg-danger/10 text-danger";
                return (
                  <div key={p.id} className="flex flex-col items-center gap-1 w-20">
                    <span className="text-sm truncate w-full text-center">{p.display_name}</span>
                    <div
                      className={`w-full ${height} rounded-t-xl border-2 flex items-start justify-center pt-2 font-black text-lg ${podiumColor}`}
                    >
                      {p.rank}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {(fastestAttempt || mostContestedCount > 1) && (
          <div className="grid grid-cols-1 gap-3 w-full">
            {fastestAttempt && (
              <div className="bg-white/5 rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-muted">⚡ Buzzeur le plus rapide</p>
                <p className="text-sm font-bold text-accentSoft">
                  {fastestPlayer?.display_name ?? "Joueur"} —{" "}
                  {(fastestAttempt.reaction_seconds as number).toFixed(1)}s
                </p>
              </div>
            )}
            {mostContestedRound && mostContestedCount > 1 && (
              <div className="bg-white/5 rounded-xl px-4 py-3 text-left">
                <p className="text-xs text-muted">🔥 Manche la plus disputée</p>
                <p className="text-sm font-bold text-accentSoft">
                  {mostContestedRound.title} ({mostContestedCount} tentatives)
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="w-full space-y-2 text-left max-h-64 overflow-y-auto pr-1">
          {ranked.map((p) => (
            <li key={p.id} className="flex justify-between rounded-xl px-4 py-3 bg-white/5">
              <span>
                {p.rank}. {p.display_name}
              </span>
              <span className="font-bold">{p.score} pts</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-4">
          <Link href="/" className="text-xs text-muted hover:text-accentSoft underline transition">
            ← Accueil
          </Link>
          <button onClick={onLeave} className="text-xs text-muted hover:text-danger underline transition">
            Quitter la partie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm">
      {/* Toujours visible : pseudo, score et position au classement, pas
          seulement entre les manches — pour que le joueur garde un œil sur
          sa progression même pendant qu'une manche est en cours. */}
      <div className="w-full flex justify-between items-center bg-surface border border-surfaceBorder rounded-2xl px-5 py-3">
        <span className="font-bold truncate">{me?.display_name ?? "…"}</span>
        <span className="text-sm text-muted whitespace-nowrap">
          {me ? `${formatOrdinal(me.rank)} / ${players.length}` : ""}{" "}
          <span className="font-bold text-accentSoft">· {me?.score ?? 0} pts</span>
        </span>
      </div>

      {!round ? (
        <p className="text-xl text-muted text-center animate-pulse">
          En attente du lancement d’une manche par l’hôte…
        </p>
      ) : (
        <>
          {somethingAlreadyFound && (
            <p className="text-sm text-muted text-center">
              Déjà trouvé : {[round.title_found && "titre", round.artist_found && "artiste"]
                .filter(Boolean)
                .join(" et ")}
              {" — à vous de jouer pour le reste !"}
            </p>
          )}
          <button
            onClick={onBuzz}
            disabled={!canBuzz}
            className={`w-56 h-56 rounded-full text-3xl font-black border-4 transition ${
              canBuzz
                ? "bg-accent border-accentSoft shadow-glowAccent animate-pulseGlow active:scale-95"
                : alreadyBuzzed
                  ? iWon
                    ? "bg-accent2 border-accent2Soft shadow-glowAccent2"
                    : "bg-white/10 border-white/10 text-muted"
                  : "bg-white/10 border-white/10 text-muted"
            }`}
          >
            {alreadyBuzzed ? "BUZZÉ !" : "BUZZ"}
          </button>
          {alreadyBuzzed && (
            <p className={`text-xl font-bold text-center ${iWon ? "text-accent2Soft" : "text-danger"}`}>
              {iWon
                ? "Tu as buzzé en premier !"
                : `${buzzer?.display_name ?? "Un autre joueur"} a buzzé en premier !`}
            </p>
          )}
          {isLocked && (
            <p className="text-sm text-muted text-center">
              Tu viens de répondre — attends qu’un autre joueur tente sa chance avant de rebuzzer.
            </p>
          )}
          {answerRevealed && (
            <div className="w-full text-center bg-white/5 border border-surfaceBorder rounded-2xl px-6 py-4">
              <p className="text-sm text-muted mb-1">La réponse était :</p>
              <p className="text-xl font-bold text-accentSoft">
                {round.title} — {round.artist}
              </p>
            </div>
          )}
        </>
      )}
      <div className="flex gap-4">
        <Link href="/" className="text-xs text-muted hover:text-accentSoft underline transition">
          ← Accueil
        </Link>
        <button onClick={onLeave} className="text-xs text-muted hover:text-danger underline transition">
          Quitter la partie
        </button>
      </div>
    </div>
  );
}
