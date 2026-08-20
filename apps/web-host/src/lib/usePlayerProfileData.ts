"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type PlayerStats = {
  gamesPlayed: number;
  correctAnswers: number;
  totalAttempts: number;
  bestStreak: number;
  successRate: number; // 0-100, arrondi
};

export type PlayerHistoryEntry = {
  roomId: string;
  roomCode: string;
  playedAt: string; // ISO, rooms.created_at
  playerCount: number;
  rank: number;
  score: number;
};

type State = {
  loading: boolean;
  error: string | null;
  stats: PlayerStats;
  history: PlayerHistoryEntry[];
};

const EMPTY_STATS: PlayerStats = {
  gamesPlayed: 0,
  correctAnswers: 0,
  totalAttempts: 0,
  bestStreak: 0,
  successRate: 0,
};

/**
 * Classement "façon compétition" (deux ex-aequo partagent le même rang, le
 * rang suivant saute en conséquence) — même logique que withRanks dans
 * ranking.ts, réécrite ici en minimal plutôt que réutilisée : withRanks
 * attend le type Player complet de rooms.ts (display_name, is_host,
 * connected, bonus/malus...), alors qu'ici on n'a besoin que du score pour
 * calculer le rang d'un compte dans une partie terminée.
 */
function rankOf(players: { id: string; score: number }[], playerId: string): number {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let previousScore: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    if (previousScore === null || sorted[i].score !== previousScore) {
      rank = i + 1;
      previousScore = sorted[i].score;
    }
    if (sorted[i].id === playerId) return rank;
  }
  return sorted.length;
}

/**
 * Stats + historique de l'espace joueur (/profil), calculés directement
 * depuis les tables de partie déjà existantes (players/rooms/round_attempts
 * — voir migrations 0001 et 0008), filtrées par account_id (voir migration
 * 0020). Rien de nouveau côté schéma : ces données existent déjà pour
 * chaque partie jouée, on les agrège seulement ici pour un compte donné.
 *
 * Passe par la clé anon (lib/supabase.ts, PAS supabaseAdmin) :
 * players/rooms/round_attempts sont déjà en lecture libre pour tout le
 * monde (modèle "dev, entre amis", voir migrations 0003/0008) — pas besoin
 * du service_role ici, contrairement aux routes qui modifient
 * player_accounts (voir api/player-account/*).
 *
 * Contrairement à Badges/Classement (voir /profil/page.tsx), qui dépendent
 * de systèmes pas encore construits (XP/niveaux, badges à paliers — phases
 * 3 et 5 du cadrage), Stats et Historique n'ont besoin de rien de plus que
 * ce qui existe déjà : d'où le choix de les livrer dès cette phase 2.
 */
type LoadResult = { stats: PlayerStats; history: PlayerHistoryEntry[] };

/**
 * Calcul pur (aucun setState ici) : renvoie le résultat ou lève une erreur.
 * Séparé de `refresh` ci-dessous pour que tous les setState restent
 * DANS des callbacks .then()/.catch() plutôt que directement dans le corps
 * de la fonction appelée par l'effet — même contrainte, même solution, que
 * dans usePlayerAccount.ts (voir son commentaire : la règle eslint
 * react-hooks interdit un setState synchrone dans le corps d'un effet, y
 * compris via une fonction async appelée directement).
 */
async function loadPlayerProfileData(accountId: string): Promise<LoadResult> {
  // 1) Toutes les lignes `players` liées à ce compte — une par partie
  //    rejointe (voir players.account_id, migration 0020).
  const { data: myPlayers, error: myPlayersError } = await supabase
    .from("players")
    .select("id, room_id, score")
    .eq("account_id", accountId);
  if (myPlayersError) throw myPlayersError;

  const playerIds = (myPlayers ?? []).map((p) => p.id);
  const roomIds = Array.from(new Set((myPlayers ?? []).map((p) => p.room_id)));

  if (playerIds.length === 0 || roomIds.length === 0) {
    return { stats: EMPTY_STATS, history: [] };
  }

  // 2) Tentatives (bonnes réponses, streak, taux de réussite) — voir
  //    round_attempts, migration 0008. Triées chronologiquement pour
  //    calculer le meilleur streak de bonnes réponses consécutives.
  const { data: attempts, error: attemptsError } = await supabase
    .from("round_attempts")
    .select("points_awarded, created_at")
    .in("player_id", playerIds)
    .order("created_at", { ascending: true });
  if (attemptsError) throw attemptsError;

  // 3) Rooms jouées, pour dater/nommer l'historique et ne compter que les
  //    parties réellement terminées (status = 'finished' — voir migration
  //    0001) dans "Parties jouées" et l'historique : une partie quittée en
  //    cours de route (lobby/in_progress abandonnée) n'est pas vraiment
  //    "une partie jouée".
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, code, created_at, status")
    .in("id", roomIds);
  if (roomsError) throw roomsError;

  const finishedRooms = (rooms ?? []).filter((r) => r.status === "finished");
  const finishedRoomIds = finishedRooms.map((r) => r.id);

  // 4) Tous les joueurs des parties terminées, pour calculer le rang de ce
  //    compte dans chacune (voir rankOf ci-dessus).
  let allPlayersInFinishedRooms: { id: string; room_id: string; score: number }[] = [];
  if (finishedRoomIds.length > 0) {
    const { data: allPlayers, error: allPlayersError } = await supabase
      .from("players")
      .select("id, room_id, score")
      .in("room_id", finishedRoomIds);
    if (allPlayersError) throw allPlayersError;
    allPlayersInFinishedRooms = allPlayers ?? [];
  }

  const totalAttempts = attempts?.length ?? 0;
  const correctAnswers = (attempts ?? []).filter((a) => a.points_awarded === 2).length;

  let bestStreak = 0;
  let currentStreak = 0;
  for (const a of attempts ?? []) {
    if (a.points_awarded === 2) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const stats: PlayerStats = {
    gamesPlayed: finishedRoomIds.length,
    correctAnswers,
    totalAttempts,
    bestStreak,
    successRate: totalAttempts > 0 ? Math.round((correctAnswers / totalAttempts) * 100) : 0,
  };

  const myPlayerByRoom = new Map((myPlayers ?? []).map((p) => [p.room_id, p]));
  const history: PlayerHistoryEntry[] = finishedRooms
    .map((room): PlayerHistoryEntry | null => {
      const mine = myPlayerByRoom.get(room.id);
      if (!mine) return null;
      const playersInRoom = allPlayersInFinishedRooms.filter((p) => p.room_id === room.id);
      return {
        roomId: room.id,
        roomCode: room.code,
        playedAt: room.created_at,
        playerCount: playersInRoom.length,
        rank: rankOf(playersInRoom, mine.id),
        score: mine.score,
      };
    })
    .filter((e): e is PlayerHistoryEntry => e !== null)
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());

  return { stats, history };
}

export function usePlayerProfileData(accountId: string) {
  const [state, setState] = useState<State>({ loading: true, error: null, stats: EMPTY_STATS, history: [] });

  const refresh = useCallback(() => {
    loadPlayerProfileData(accountId)
      .then((result) => setState({ loading: false, error: null, ...result }))
      .catch((e: any) => setState({ loading: false, error: e?.message ?? "Erreur inconnue", stats: EMPTY_STATS, history: [] }));
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}
