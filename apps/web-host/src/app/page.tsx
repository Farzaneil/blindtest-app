"use client";

// Page volontairement non pré-générée statiquement : elle crée une
// nouvelle partie à chaque chargement, ça n'a pas de sens de la figer
// au moment du build.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  createRoom,
  subscribeToPlayers,
  subscribeToRounds,
  startTestRound,
  type Player,
  type Round,
} from "../lib/rooms";

/**
 * Écran hôte / "TV" — voir les commentaires dans supabase/migrations et dans
 * lib/rooms.ts pour le détail du modèle temps réel. Rappel : cette page
 * n'affiche jamais de réponse privée, seulement l'état commun de la partie
 * (joueurs connectés, manche en cours, qui a buzzé).
 */
export default function HostScreen() {
  const [room, setRoom] = useState<{ id: string; code: string } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createRoom()
      .then((r) => setRoom({ id: r.id, code: r.code }))
      .catch((e) => setError(e?.message ?? "Erreur de connexion à Supabase"));
  }, []);

  useEffect(() => {
    if (!room) return;
    const unsubPlayers = subscribeToPlayers(room.id, setPlayers);
    const unsubRounds = subscribeToRounds(room.id, setRound);
    return () => {
      unsubPlayers();
      unsubRounds();
    };
  }, [room]);

  if (error) {
    return (
      <main className="flex items-center justify-center min-h-screen p-10 text-center">
        <p className="text-xl text-red-400">
          {error}
          <br />
          Vérifie que apps/web-host/.env.local contient bien NEXT_PUBLIC_SUPABASE_URL et
          NEXT_PUBLIC_SUPABASE_ANON_KEY, puis relance `npm run web-host`.
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-xl text-gray-400">Création de la partie…</p>
      </main>
    );
  }

  const winner = round?.buzzed_by_player_id
    ? players.find((p) => p.id === round.buzzed_by_player_id)
    : null;

  const canStartRound = !round || round.status === "revealed" || round.status === "scored";

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-10 p-10">
      <div className="text-center">
        <p className="text-lg text-gray-400">Rejoignez la partie avec le code</p>
        <p className="text-6xl font-black tracking-widest text-accent">{room.code}</p>
      </div>

      <div className="w-full max-w-xl">
        <h2 className="text-2xl font-bold mb-4">Joueurs connectés ({players.length})</h2>
        <ul className="space-y-2">
          {players.length === 0 && <li className="text-gray-500">En attente de joueurs…</li>}
          {players.map((p) => (
            <li
              key={p.id}
              className="flex justify-between bg-white/5 rounded-lg px-4 py-3 text-xl"
            >
              <span>{p.display_name}</span>
              <span className="font-bold">{p.score} pts</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full max-w-xl text-center">
        {canStartRound ? (
          <button
            onClick={() => startTestRound(room.id)}
            className="bg-accent px-8 py-4 rounded-full text-xl font-bold"
          >
            Lancer une manche de test
          </button>
        ) : round?.status === "playing" ? (
          <p className="text-2xl">🎵 Manche en cours — en attente d’un buzz…</p>
        ) : (
          <p className="text-3xl font-bold text-accent2">
            🔔 {winner?.display_name ?? "Un joueur"} a buzzé en premier !
          </p>
        )}
      </div>
    </main>
  );
}
