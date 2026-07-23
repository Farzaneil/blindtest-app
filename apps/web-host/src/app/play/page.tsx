"use client";

// Page de test "joueur" dans le navigateur : rejoindre une partie + buzzer,
// sans passer par l'appli mobile native. Sert uniquement à valider le
// mécanisme central (join + buzz temps réel) pendant que la compilation
// native est mise de côté. Ouvre cette page dans plusieurs onglets pour
// simuler plusieurs joueurs.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  joinRoomByCode,
  subscribeToCurrentRoundForPlayer,
  sendBuzz,
  type PlayerRound,
} from "../../lib/rooms";

type Session = { roomId: string; playerId: string };

export default function PlayPage() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <main className="flex items-center justify-center min-h-screen p-6">
      {session ? (
        <BuzzerView roomId={session.roomId} playerId={session.playerId} />
      ) : (
        <JoinView onJoined={setSession} />
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
    </div>
  );
}

function BuzzerView({ roomId, playerId }: { roomId: string; playerId: string }) {
  const [round, setRound] = useState<PlayerRound | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return subscribeToCurrentRoundForPlayer(roomId, setRound);
  }, [roomId]);

  const alreadyBuzzed =
    round?.status === "buzzed" || round?.status === "revealed" || round?.status === "scored";
  const canBuzz = round?.status === "playing" && !sending;
  const iWon = alreadyBuzzed && round?.buzzed_by_player_id === playerId;

  const onBuzz = async () => {
    if (!round || !canBuzz) return;
    setSending(true);
    try {
      await sendBuzz(round.id, playerId);
    } finally {
      setSending(false);
    }
  };

  if (!round) {
    return (
      <p className="text-xl text-muted text-center animate-pulse">
        En attente du lancement d’une manche par l’hôte…
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
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
        <p className={`text-xl font-bold ${iWon ? "text-accent2Soft" : "text-danger"}`}>
          {iWon ? "Tu as buzzé en premier !" : "Trop tard, un autre joueur a buzzé avant toi."}
        </p>
      )}
    </div>
  );
}
