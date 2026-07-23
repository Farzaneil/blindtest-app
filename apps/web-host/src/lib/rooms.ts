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
  started_at: string | null;
  was_correct: boolean | null;
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

/**
 * Récupère une room existante par id — utilisé par l'écran hôte pour
 * vérifier, au chargement, qu'une partie retrouvée dans sessionStorage
 * (voir app/page.tsx) existe toujours côté base avant de la réutiliser au
 * lieu d'en créer une nouvelle. Retourne null si la room n'existe plus
 * (par exemple si la base a été réinitialisée entre-temps).
 */
export async function getRoomById(roomId: string): Promise<Room | null> {
  const { data } = await supabase
    .from("rooms")
    .select("id, code, status")
    .eq("id", roomId)
    .maybeSingle();
  return (data as Room) ?? null;
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
 * Historique complet des manches déjà jugées ("scored") d'une room, pour le
 * panneau repliable "Historique des manches" côté hôte (voir app/page.tsx).
 * Volontairement une fonction distincte de subscribeToRounds ci-dessus, qui
 * ne renvoie que la toute dernière manche (order_index desc, limit 1) : ici
 * on veut au contraire toutes les manches passées, dans l'ordre où elles ont
 * été jouées. Le nom du joueur ayant buzzé n'est pas rejoué ici : l'appelant
 * le retrouve en croisant buzzed_by_player_id avec la liste `players` déjà
 * chargée (subscribeToPlayers), pour éviter une jointure superflue.
 */
export function subscribeToRoundHistory(roomId: string, onChange: (rounds: Round[]) => void) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("rounds")
      .select("*")
      .eq("room_id", roomId)
      .eq("status", "scored")
      .order("order_index", { ascending: true });
    onChange((data as Round[]) ?? []);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`rounds-history:${roomId}`)
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

/**
 * Passe une manche buzzée à "revealed" : c'est le moment où l'hôte clique
 * sur "Révéler la réponse", après que le joueur qui a buzzé a donné sa
 * réponse à voix haute. Tant que ce n'est pas fait, le titre/artiste ne
 * doit pas être affiché côté hôte — utile en particulier quand l'hôte joue
 * aussi (mode "tout le monde participe") et buzze lui-même : il ne doit pas
 * voir la réponse s'afficher automatiquement sur son propre écran. Passe
 * par la fonction Postgres reveal_round (voir
 * supabase/migrations/0006_reveal_round.sql), pour la même raison que
 * resolveRound ci-dessous (pas de policy UPDATE ouverte côté client).
 */
export async function revealRound(roundId: string): Promise<void> {
  const { error } = await supabase.rpc("reveal_round", { p_round_id: roundId });
  if (error) throw error;
}

/**
 * Valide (ou invalide) la réponse du joueur qui a buzzé, passe la manche à
 * "scored" et attribue un point si correct. Ne fonctionne que sur une
 * manche déjà "revealed" (voir revealRound ci-dessus). Passe par la
 * fonction Postgres resolve_round (voir
 * supabase/migrations/0005_resolve_round.sql et 0006_reveal_round.sql) : ni
 * rounds ni players n'ont de policy UPDATE ouverte côté client, cette RPC
 * est le seul chemin possible pour cette transition.
 */
export async function resolveRound(roundId: string, correct: boolean): Promise<void> {
  const { error } = await supabase.rpc("resolve_round", { p_round_id: roundId, p_correct: correct });
  if (error) throw error;
}

/**
 * Clôture une manche restée sans buzz une fois le timer visuel écoulé côté
 * hôte (voir app/page.tsx) : passe directement "playing" -> "scored" sans
 * gagnant, was_correct restant à NULL pour signaler dans l'historique que
 * personne n'a répondu (à distinguer d'une bonne/mauvaise réponse jugée par
 * resolveRound). Passe par la fonction Postgres timeout_round (voir
 * supabase/migrations/0007_round_timeout_and_history.sql) pour la même
 * raison que resolveRound/revealRound : pas de policy UPDATE ouverte côté
 * client. Si un joueur a buzzé juste avant l'expiration du timer, cet appel
 * ne fait rien (la RPC exige status = 'playing', déjà passé à 'buzzed').
 */
export async function timeoutRound(roundId: string): Promise<void> {
  const { error } = await supabase.rpc("timeout_round", { p_round_id: roundId });
  if (error) throw error;
}

// ============================================================================
// Fonctions côté joueur — utilisées par la page /play (voir app/play/page.tsx).
// Permettent de tester le mécanisme join + buzz depuis un simple onglet de
// navigateur, sans passer par l'appli mobile native (utile pour valider la
// logique pendant que la compilation native est mise de côté).
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

// Un id par onglet/session de navigateur (pas persisté entre rechargements,
// suffisant pour tester avec plusieurs onglets = plusieurs joueurs).
export const webDeviceId = generateWebDeviceId();

/**
 * Vérifie qu'un joueur (retrouvé via son id stocké dans sessionStorage,
 * voir app/play/page.tsx) existe toujours, et renvoie son roomId associé.
 * Permet de reconnecter un joueur après un refresh/retour en arrière sans
 * réinsérer une nouvelle ligne dans `players` — ce qui aurait remis son
 * score à zéro. Retourne null si le joueur n'existe plus (partie
 * abandonnée par l'hôte, base réinitialisée, etc.) : dans ce cas l'appelant
 * doit repasser par joinRoomByCode.
 */
export async function getPlayerSession(
  playerId: string
): Promise<{ roomId: string; playerId: string } | null> {
  const { data } = await supabase
    .from("players")
    .select("id, room_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!data) return null;
  return { roomId: data.room_id, playerId: data.id };
}

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
