import { supabase } from "./supabase";

export type Round = {
  id: string;
  status: "pending" | "playing" | "buzzed" | "revealed" | "scored";
  buzzed_by_player_id: string | null;
  title: string;
  artist: string;
};

function generateDeviceId(): string {
  return `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

// TODO: persister via AsyncStorage pour garder le même device_id entre deux
// ouvertures de l'app. Pour l'instant, un nouvel id est généré à chaque
// lancement (sans conséquence pour tester le buzz entre potes).
export const deviceId = generateDeviceId();

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
    .insert({ room_id: room.id, display_name: displayName, device_id: deviceId })
    .select()
    .single();

  if (playerError || !player) {
    throw new Error("Impossible de rejoindre la partie, réessaie.");
  }

  return { room, player };
}

export function subscribeToCurrentRound(roomId: string, onChange: (round: Round | null) => void) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("rounds")
      .select("id, status, buzzed_by_player_id, title, artist")
      .eq("room_id", roomId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    onChange((data as Round) ?? null);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`rounds-mobile:${roomId}`)
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
