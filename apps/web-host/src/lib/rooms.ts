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

/**
 * Crée une nouvelle partie et retourne son code + id. Réessaie avec un
 * nouveau code si celui généré existe déjà (collision très rare vu
 * l'alphabet à 32 caractères ^ 6).
 */
export async function createRoom(): Promise<Room> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .insert({ code, status: "lobby" })
      .select()
      .single();

    if (!error && data) return data as Room;
    if (error && error.code !== "23505") throw error; // 23505 = violation de contrainte unique
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

/**
 * Lance une manche "factice" (pas de vrai morceau) pour tester le mécanisme
 * de buzz sans dépendre de la lecture Spotify, qui n'est pas encore câblée.
 * À remplacer quand la vraie playlist sera branchée : la manche sera créée
 * avec le titre réel tiré de la playlist en cours.
 */
export async function startTestRound(roomId: string): Promise<void> {
  const { data: existing } = await supabase
    .from("rounds")
    .select("order_index")
    .eq("room_id", roomId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = (existing?.order_index ?? -1) + 1;

  await supabase.from("rounds").insert({
    room_id: roomId,
    order_index: nextIndex,
    source_track_id: "test-track",
    title: "Morceau de test",
    artist: "Artiste de test",
    status: "playing",
    started_at: new Date().toISOString(),
  });

  await supabase.from("rooms").update({ status: "in_progress" }).eq("id", roomId);
}
