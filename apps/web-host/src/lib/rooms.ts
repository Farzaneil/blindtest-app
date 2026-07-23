import { supabase } from "./supabase";
import { generateRoomCode } from "@blindtest/game-logic";

export type Room = {
  id: string;
  code: string;
  status: "lobby" | "in_progress" | "finished";
};

export type Player = {
  id: string;
  room_id: string;
  display_name: string;
  is_host: boolean;
  score: number;
  connected: boolean;
};

export type Round = {
  id: string;
  room_id: string;
  order_index: number;
  title: string;
  artist: string;
  status: "pending" | "playing" | "buzzed" | "revealed" | "scored";
  buzzed_by_player_id: string | null;
};

export async function createRoom(): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, status: "lobby" })
      .select()
      .single();

    if (!error && data) return data as Room;
    if (error && error.code !== "23505") throw error;
  }
  throw new Error("Impossible de générer un code de partie unique après plusieurs tentatives.");
}

export function subscribeToPlayers(roomId: string, onChange: (players: Player[]) => void) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("joined_at");
    onChange((data as Player[]) ?? []);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`players:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToRounds(roomId: string, onChange: (round: Round | null) => void) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("rounds")
      .select("*")
      .eq("room_id", roomId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    onChange((data as Round) ?? null);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`rounds:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

async function insertRound(
  roomId: string,
  track: { sourceTrackId: string; title: string; artist: string }
): Promise<Round> {
  const { data: existing } = await supabase
    .from("rounds")
    .select("order_index")
    .eq("room_id", roomId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = (existing?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("rounds")
    .insert({
      room_id: roomId,
      order_index: nextIndex,
      source_track_id: track.sourceTrackId,
      title: track.title,
      artist: track.artist,
      status: "playing",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error("Impossible de créer la manche.");
  }

  await supabase.from("rooms").update({ status: "in_progress" }).eq("id", roomId);

  return data as Round;
}

/**
 * Lance une manche "factice" (pas de vrai morceau) — utile pour retester le
 * mécanisme de buzz seul, indépendamment de Spotify.
 */
export async function startTestRound(roomId: string): Promise<void> {
  await insertRound(roomId, {
    sourceTrackId: "test-track",
    title: "Morceau de test",
    artist: "Artiste de test",
  });
}

/**
 * Lance une vraie manche à partir d'un morceau choisi via la recherche
 * Spotify (voir /lib/useSpotifyPlayer.ts + @blindtest/api-clients). Ne
 * démarre pas la lecture elle-même : ça reste à la charge de l'appelant
 * (spotify.playTrackOnHostDevice), pour garder cette fonction indépendante
 * de la source musicale.
 */
export async function startRoundWithTrack(
  roomId: string,
  track: { sourceTrackId: string; title: string; artist: string }
): Promise<Round> {
  return insertRound(roomId, track);
}

// ============================================================================
// Fonctions côté joueur — utilisées par la page /play (voir app/play/page.tsx).
// ============================================================================

export type PlayerRound = {
  id: string;
  status: "pending" | "playing" | "buzzed" | "revealed" | "scored";
  buzzed_by_player_id: string | null;
  title: string;
  artist: string;
};

function generateWebDeviceId(): string {
  return `web_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export const webDeviceId = generateWebDeviceId();

export async function joinRoomByCode(code: string, displayName: string) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, code, status")
    .eq("code", code.toUpperCase())
    .single();

  if (roomError || !room) {
    throw new Error("Code de partie introuvable. Vérifie qu'il est bien affiché sur l'écran hôte.");
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .insert({ room_id: room.id, display_name: displayName, device_id: webDeviceId })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error("Impossible de rejoindre la partie, réessaie.");
  }

  return { room, player };
}

export function subscribeToCurrentRoundForPlayer(
  roomId: string,
  onChange: (round: PlayerRound | null) => void
) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("rounds")
      .select("id, status, buzzed_by_player_id, title, artist")
      .eq("room_id", roomId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    onChange((data as PlayerRound) ?? null);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`rounds-player:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function sendBuzz(roundId: string, playerId: string): Promise<void> {
  const { error } = await supabase.from("buzzes").insert({ round_id: roundId, player_id: playerId });
  if (error) throw error;
}
