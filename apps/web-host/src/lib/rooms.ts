import { supabase } from "./supabase";
import { generateRoomCode } from "@blindtest/game-logic";

export type Room = {
  id: string;
  code: string;
  status: "lobby" | "in_progress" | "finished";
  // Réglages bonus/malus (voir migration 0018) : par room plutôt que côté
  // client, car resolve_round_attempt/resolve_buzz_winner tournent
  // indépendamment du navigateur de l'hôte et ont besoin d'une source de
  // vérité côté serveur. Activés par défaut. bonus_joker_enabled ne
  // conditionne que le TIRAGE (voir insertRound plus bas) : si
  // désactivé, aucune manche n'est jamais tirée joker.
  bonus_joker_enabled: boolean;
  bonus_speed_enabled: boolean;
  bonus_remontada_enabled: boolean;
  malus_streak_lockout_enabled: boolean;
  malus_streak_block_enabled: boolean;
};

export type Player = {
  id: string;
  room_id: string;
  display_name: string;
  is_host: boolean;
  score: number;
  connected: boolean;
  // Bonus/malus (voir migration 0017) : nombre de bonnes réponses
  // d'affilée pour CE joueur — il n'y en a jamais qu'un seul avec un
  // compteur > 0 dans toute la room à un instant donné (resolve_round_
  // attempt remet les autres à zéro), donc pas besoin d'info
  // supplémentaire pour savoir "qui détient la série". À partir de 3,
  // délai de buzz de 5/10/15s en début de manche (voir resolve_buzz_
  // winner) ; calcul du délai fait côté client à partir de cette seule
  // valeur, voir buzzLockoutSeconds dans app/play/page.tsx.
  correct_streak_count: number;
  // Nombre de premiers-buzz ratés d'affilée pour ce joueur (personnel,
  // pas de notion de "détenteur unique" ici). Remis à zéro par
  // resolve_round_attempt dès que ce joueur répond correctement, ou dès
  // que le blocage complet (voir wrong_streak_block_round_index) a été
  // posé.
  wrong_streak_count: number;
  // order_index de la manche dont les 3 échecs d'affilée ont déclenché le
  // blocage complet — le buzzer de ce joueur est bloqué sur la manche
  // (wrong_streak_block_round_index + 1) uniquement (voir resolve_buzz_
  // winner) : null si aucun blocage n'est en attente.
  wrong_streak_block_round_index: number | null;
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
  // Cumul du temps réellement joué avant le buzz en cours (voir migration
  // 0009) : le timer côté hôte se base sur elapsed_seconds + le temps écoulé
  // depuis started_at, jamais sur started_at seul, pour ne pas décompter le
  // temps passé à juger une réponse (pendant lequel la musique est coupée).
  elapsed_seconds: number;
  was_correct: boolean | null;
  // Cumulatifs sur la durée de la manche (mode "Maître du jeu") : une fois
  // crédité, un élément reste acquis même si un buzz suivant ne le retrouve
  // pas. Toujours false/false en mode "Tout le monde participe" tant que la
  // manche n'est pas jugée (un seul buzz suffit à la clôturer dans ce mode).
  title_found: boolean;
  artist_found: boolean;
  // Joueur temporairement exclu du buzz après avoir été jugé sur cette
  // manche (voir resolveRoundAttempt) — débloqué dès qu'un autre joueur
  // buzze à sa suite.
  locked_player_id: string | null;
  // Dénormalisé au moment de la création de la manche (voir insertRound et
  // la migration 0016) : mode "Tout le monde participe" actif pour CETTE
  // manche précise. Permet aux écrans joueurs de savoir s'ils peuvent
  // afficher la réponse dès "revealed" (voir PlayerRound/answerRevealed
  // côté /play) sans dépendre d'un état côté hôte auquel ils n'ont pas
  // accès.
  blind_mode: boolean;
  // Tiré au hasard côté client au moment de créer la manche (voir
  // insertRound, migration 0017) : double les points de cette manche,
  // dans les deux sens (resolve_round_attempt).
  is_joker: boolean;
};

export type RoundAttempt = {
  id: string;
  round_id: string;
  room_id: string;
  player_id: string;
  title_found: boolean;
  artist_found: boolean;
  points_awarded: number;
  // Temps écoulé (en secondes) entre le début du "stint" de cette tentative
  // et le buzz qui l'a déclenchée (voir migration 0011). Sert à calculer le
  // "buzzeur le plus rapide" sur l'écran de fin de partie — uniquement
  // parmi les tentatives où points_awarded === 2 (titre ET artiste
  // trouvés), pour qu'une réponse fausse ou partielle rapide ne puisse pas
  // remporter ce titre.
  reaction_seconds: number | null;
  created_at: string;
  // Bonus/malus (voir migration 0017) : posés par resolve_round_attempt,
  // purement informatifs pour l'affichage ("+1 bonus vitesse !" etc.) —
  // déjà inclus dans points_awarded, pas à additionner à part.
  speed_bonus_awarded: boolean;
  remontada_bonus_awarded: boolean;
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
    .select("id, code, status, bonus_joker_enabled, bonus_speed_enabled, bonus_remontada_enabled, malus_streak_lockout_enabled, malus_streak_block_enabled")
    .eq("id", roomId)
    .maybeSingle();
  return (data as Room) ?? null;
}

/**
 * S'abonne au statut de la room ("lobby" / "in_progress" / "finished").
 * Utilisé côté joueur (app/play/page.tsx) pour afficher l'écran de fin de
 * partie enrichi dès que l'hôte marque la partie comme terminée (voir
 * finishRoom ci-dessous) : sans ça, un joueur n'a aucun moyen de savoir que
 * la file d'attente est épuisée, puisque `rounds` ne change plus une fois
 * la dernière manche jouée.
 */
export function subscribeToRoom(roomId: string, onChange: (room: Room | null) => void) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("rooms")
      .select("id, code, status, bonus_joker_enabled, bonus_speed_enabled, bonus_remontada_enabled, malus_streak_lockout_enabled, malus_streak_block_enabled")
      .eq("id", roomId)
      .maybeSingle();
    onChange((data as Room) ?? null);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Marque la partie comme terminée (file d'attente épuisée, voir
 * `queueExhausted` dans app/host/page.tsx) — c'est ce qui déclenche l'écran
 * de fin de partie enrichi côté joueurs via subscribeToRoom ci-dessus.
 * Update direct (pas de RPC) : seule la colonne `status` est accordée en
 * écriture aux clients anon/authenticated (voir
 * supabase/migrations/0004_rls_hardening.sql), donc pas besoin d'une
 * fonction SECURITY DEFINER pour cette transition précise.
 */
/**
 * Met à jour un ou plusieurs réglages bonus/malus de la room (voir
 * migration 0018) — modifiable à tout moment pendant la partie depuis le
 * panneau playlist côté hôte (voir app/host/page.tsx). Update direct (pas
 * de RPC) : ces colonnes sont explicitement accordées en écriture aux
 * clients anon/authenticated (voir la migration), contrairement à
 * score/correct_streak_count etc. qui restent réservés aux fonctions
 * SECURITY DEFINER.
 */
export async function updateRoomBonusMalusSettings(
  roomId: string,
  settings: Partial<
    Pick<
      Room,
      | "bonus_joker_enabled"
      | "bonus_speed_enabled"
      | "bonus_remontada_enabled"
      | "malus_streak_lockout_enabled"
      | "malus_streak_block_enabled"
    >
  >
): Promise<void> {
  const { error } = await supabase.from("rooms").update(settings).eq("id", roomId);
  if (error) throw error;
}

export async function finishRoom(roomId: string): Promise<void> {
  await supabase.from("rooms").update({ status: "finished" }).eq("id", roomId);
}

/**
 * Repasse la room en "in_progress" — utilisé quand l'hôte clique sur
 * "+ Ajouter d'autres morceaux" après un écran de fin de partie, pour que
 * l'écran de fin de partie disparaisse côté joueurs dès qu'une nouvelle
 * manche est sur le point d'être relancée.
 */
export async function resumeRoom(roomId: string): Promise<void> {
  await supabase.from("rooms").update({ status: "in_progress" }).eq("id", roomId);
}

/**
 * "Redémarrer une partie" côté hôte : remet tous les scores de la room à
 * zéro et efface l'historique des manches jouées, sans recréer de room ni
 * forcer les joueurs à se reconnecter (contrairement au bouton "↻ Nouvelle
 * partie" de l'écran hôte, qui crée un tout nouveau code). La file
 * d'attente (queue/queueIndex, gérée côté navigateur hôte en
 * sessionStorage) n'est pas touchée ici : voir handleRestartGame dans
 * app/host/page.tsx.
 *
 * Passe par la fonction Postgres reset_room_scores (voir
 * supabase/migrations/0014_reset_room_scores.sql) pour la même raison que
 * resolveRoundAttempt/timeoutRound : aucune policy UPDATE n'est ouverte sur
 * `players` côté client depuis le durcissement RLS.
 */
export async function resetRoomScores(roomId: string): Promise<void> {
  const { error } = await supabase.rpc("reset_room_scores", { p_room_id: roomId });
  if (error) throw error;
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

/**
 * Détail de toutes les tentatives jugées (round_attempts) d'une room, pour
 * afficher le fil des buzz d'une manche à rallonge (mode "Maître du jeu")
 * dans le panneau "Historique des manches" — une manche simple n'aura
 * qu'une seule tentative, une manche avec réponses partielles en aura
 * plusieurs. room_id est dénormalisé sur round_attempts précisément pour
 * pouvoir filtrer ainsi sans jointure (voir la migration 0008).
 */
export function subscribeToRoundAttempts(
  roomId: string,
  onChange: (attempts: RoundAttempt[]) => void
) {
  const fetchAndEmit = async () => {
    const { data } = await supabase
      .from("round_attempts")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    onChange((data as RoundAttempt[]) ?? []);
  };
  fetchAndEmit();

  const channel = supabase
    .channel(`round-attempts:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "round_attempts", filter: `room_id=eq.${roomId}` },
      fetchAndEmit
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// Probabilité qu'une manche soit tirée "joker" (double les points, dans
// les deux sens — voir migration 0017 et resolve_round_attempt). ~1
// manche sur 10 (resserré depuis 1 sur 5, jugé trop fréquent après une
// première partie de test) : reste une surprise sans devenir la norme.
const JOKER_ROUND_PROBABILITY = 0.1;

async function insertRound(
  roomId: string,
  track: { sourceTrackId: string; title: string; artist: string },
  blindMode: boolean,
  jokerEnabled: boolean
): Promise<Round> {
  const { data: existing } = await supabase
    .from("rounds")
    .select("order_index")
    .eq("room_id", roomId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = (existing?.order_index ?? -1) + 1;

  // Manche joker (voir migration 0017) : tirée au hasard ici plutôt que
  // côté serveur — purement cosmétique/ludique, aucune conséquence de
  // sécurité à avoir ça décidé côté client, comme le mélange de playlist
  // ou la génération par genre juste au-dessus dans ce fichier. Si le
  // bonus est désactivé dans les réglages de la room, on ne tire même pas
  // au hasard : is_joker restera toujours false.
  const isJoker = jokerEnabled && Math.random() < JOKER_ROUND_PROBABILITY;

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
      blind_mode: blindMode,
      is_joker: isJoker,
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
export async function startTestRound(
  roomId: string,
  blindMode = false,
  jokerEnabled = true
): Promise<void> {
  await insertRound(
    roomId,
    {
      sourceTrackId: "test-track",
      title: "Morceau de test",
      artist: "Artiste de test",
    },
    blindMode,
    jokerEnabled
  );
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
  track: { sourceTrackId: string; title: string; artist: string },
  blindMode: boolean,
  jokerEnabled: boolean
): Promise<Round> {
  return insertRound(roomId, track, blindMode, jokerEnabled);
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
 * Juge la tentative du joueur qui a buzzé, sur une manche déjà "revealed"
 * (voir revealRound ci-dessus). Remplace l'ancien resolveRound(correct) :
 * gère maintenant 4 issues (titre seul, artiste seul, les deux, aucun des
 * deux) au lieu de bonne/mauvaise réponse.
 *
 * - titleFound && artistFound -> +2 points, manche clôturée.
 * - un seul des deux -> +1 point ; si forceEnd est false (mode "Maître du
 *   jeu"), la manche repart en "playing" pour laisser retrouver l'élément
 *   manquant (le joueur qui vient de répondre est verrouillé jusqu'au
 *   prochain buzz d'un autre joueur) ; si forceEnd est true (mode "Tout le
 *   monde participe"), la manche est clôturée quand même.
 * - aucun des deux -> -1 point, même logique de reprise/clôture selon
 *   forceEnd.
 *
 * Passe par la fonction Postgres resolve_round_attempt (voir
 * supabase/migrations/0008_partial_answers.sql) : ni rounds ni players
 * n'ont de policy UPDATE ouverte côté client, cette RPC est le seul chemin
 * possible pour cette transition.
 */
export async function resolveRoundAttempt(
  roundId: string,
  titleFound: boolean,
  artistFound: boolean,
  forceEnd: boolean
): Promise<void> {
  const { error } = await supabase.rpc("resolve_round_attempt", {
    p_round_id: roundId,
    p_title_found: titleFound,
    p_artist_found: artistFound,
    p_force_end: forceEnd,
  });
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
  locked_player_id: string | null;
  title_found: boolean;
  artist_found: boolean;
  title: string;
  artist: string;
  // Voir le commentaire sur Round.blind_mode plus haut.
  blind_mode: boolean;
  // Voir le commentaire sur Round.is_joker plus haut.
  is_joker: boolean;
  // Nécessaire pour savoir si CE joueur est bloqué sur CETTE manche par le
  // malus 2 (voir lib/buzzLockout.ts) : comparé à
  // player.wrong_streak_block_round_index côté client, purement pour
  // l'affichage (l'application réelle du blocage se fait côté serveur,
  // voir resolve_buzz_winner).
  order_index: number;
  started_at: string | null;
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

/**
 * Fait rejoindre l'hôte lui-même comme joueur (is_host = true), pour le
 * mode "Je joue aussi sur cet écran" (voir le toggle dans
 * app/host/page.tsx, visible uniquement en mode "Tout le monde
 * participe") : contrairement à joinRoomByCode, roomId est déjà connu
 * (l'hôte est forcément déjà dans sa propre room) donc pas besoin de
 * chercher par code. is_host=true n'est qu'informatif (voir migration
 * 0015) : le reste du jeu (buzz, score, classement, jugement) traite cette
 * ligne exactement comme celle de n'importe quel autre joueur.
 */
export async function joinRoomAsHost(roomId: string, displayName: string): Promise<Player> {
  const { data, error } = await supabase
    .from("players")
    .insert({ room_id: roomId, display_name: displayName, device_id: webDeviceId, is_host: true })
    .select()
    .single();

  if (error || !data) {
    throw new Error("Impossible de te connecter comme joueur sur cet écran, réessaie.");
  }

  return data as Player;
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
      .select(
        "id, status, buzzed_by_player_id, locked_player_id, title_found, artist_found, title, artist, blind_mode, is_joker, order_index, started_at"
      )
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
