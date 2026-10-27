import { awardGameRewards, finishRoom, getRoomById, hasHostToken, type Room } from "./rooms";
import { supabase } from "./supabase";

/**
 * Partie "hôte" mémorisée dans l'onglet (sessionStorage), partagée entre
 * l'écran hôte (app/host/page.tsx, qui en est le propriétaire) et l'accueil,
 * qui s'en sert pour afficher "Partie en cours · Reprendre" au lieu de
 * laisser croire qu'un clic sur "Créer une partie" en démarre une neuve.
 */
export const HOST_ROOM_STORAGE_KEY = "blindtest_host_room";

export type OngoingHostGame = { room: Room; playerCount: number };

/** Partie hôte de cet onglet, si elle existe encore et n'est pas terminée. */
export async function readOngoingHostGame(): Promise<OngoingHostGame | null> {
  let stored: { id: string } | null = null;
  try {
    const raw = window.sessionStorage.getItem(HOST_ROOM_STORAGE_KEY);
    stored = raw ? (JSON.parse(raw) as { id: string }) : null;
  } catch {
    return null;
  }
  if (!stored?.id) return null;
  // Partie créée avant le jeton d'hôte (migration 0032), ou jeton perdu :
  // plus pilotable depuis cet onglet, on repart sur une partie neuve.
  if (!hasHostToken(stored.id)) {
    forgetHostGame();
    return null;
  }
  const room = await getRoomById(stored.id);
  if (!room || room.status === "finished") {
    // Partie terminée (ou disparue) : "Créer une partie" doit en créer une
    // neuve, pas ramener sur l'écran de fin de l'ancienne.
    forgetHostGame();
    return null;
  }
  const { count } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);
  return { room, playerCount: count ?? 0 };
}

/**
 * Termine vraiment une partie hôte avant d'en lancer une autre : les
 * joueurs basculent sur l'écran de fin (statut "finished") et les
 * badges/XP sont attribués (award_game_rewards, idempotent).
 */
export async function endHostGame(roomId: string): Promise<void> {
  await finishRoom(roomId).catch(() => {});
  await awardGameRewards(roomId).catch(() => {});
}

/** Oublie la partie de cet onglet : /host en créera une neuve. */
export function forgetHostGame() {
  try {
    window.sessionStorage.removeItem(HOST_ROOM_STORAGE_KEY);
  } catch {
    // Stockage indisponible : rien à oublier.
  }
}
