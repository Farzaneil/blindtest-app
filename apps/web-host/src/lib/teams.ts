import type { Player, RoundAttempt, Team } from "./rooms";

/**
 * Calculs du mode équipes, partagés entre l'écran hôte et /play pour que
 * les deux affichent exactement les mêmes chiffres. Le score d'une équipe
 * n'est jamais stocké en base : c'est toujours la somme des scores de ses
 * joueurs (voir supabase/migrations/0025_teams.sql).
 */

// Couleur de repli si une équipe n'a pas de couleur (ne devrait pas
// arriver : configure_room_teams en pose toujours une).
export const FALLBACK_TEAM_COLOR = "#8B8B96";

// Couleur de texte lisible posée SUR la couleur d'équipe (bandeaux, buzzer).
const TEXT_ON_TEAM_COLOR: Record<string, string> = {
  "#6E93D6": "#0A1526",
  "#F0874A": "#2B1206",
  // Ancienne couleur "Les Ambres" (avant la migration 0027).
  "#D6A15A": "#2B1B08",
  "#A78BFA": "#1A1033",
  "#E879A6": "#2B0A18",
};

export function teamColor(team: Pick<Team, "color"> | null | undefined): string {
  return team?.color ?? FALLBACK_TEAM_COLOR;
}

export function textOnTeamColor(team: Pick<Team, "color"> | null | undefined): string {
  return TEXT_ON_TEAM_COLOR[teamColor(team).toUpperCase()] ?? "#0A0A0C";
}

export type PlayerStats = {
  points: number;
  // Tentatives ayant rapporté des points (titre et/ou artiste trouvé).
  goodAnswers: number;
  // Tentatives à points négatifs (rien trouvé).
  wrongAnswers: number;
  // Buzz le plus rapide parmi les réponses complètes (titre ET artiste),
  // même règle que le "buzzeur le plus rapide" historique de l'écran de fin.
  fastestSeconds: number | null;
};

export function computePlayerStats(players: Player[], attempts: RoundAttempt[]): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();
  for (const p of players) {
    stats.set(p.id, { points: p.score, goodAnswers: 0, wrongAnswers: 0, fastestSeconds: null });
  }
  for (const a of attempts) {
    const s = stats.get(a.player_id);
    if (!s) continue;
    if (a.points_awarded > 0) s.goodAnswers += 1;
    if (a.points_awarded < 0) s.wrongAnswers += 1;
    if (a.title_found && a.artist_found && a.reaction_seconds !== null) {
      if (s.fastestSeconds === null || a.reaction_seconds < s.fastestSeconds) {
        s.fastestSeconds = a.reaction_seconds;
      }
    }
  }
  return stats;
}

export type TeamStanding = {
  team: Team;
  score: number;
  // 1 = en tête ; deux équipes à égalité partagent le même rang.
  rank: number;
  // Joueurs de l'équipe, du meilleur score au plus faible.
  players: Player[];
  // Joueur au meilleur score de l'équipe (null si équipe vide ou tous à 0
  // ou moins) — badge "MVP" de l'écran de fin.
  mvpPlayerId: string | null;
};

export function computeTeamStandings(teams: Team[], players: Player[]): TeamStanding[] {
  const standings = teams.map((team) => {
    const members = players
      .filter((p) => p.team_id === team.id)
      .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
    const score = members.reduce((sum, p) => sum + p.score, 0);
    const mvp = members[0] && members[0].score > 0 ? members[0].id : null;
    return { team, score, rank: 0, players: members, mvpPlayerId: mvp };
  });
  const sorted = [...standings].sort((a, b) => b.score - a.score || a.team.position - b.team.position);
  for (const s of sorted) {
    s.rank = 1 + sorted.filter((o) => o.score > s.score).length;
  }
  return sorted;
}

export type Award = {
  key: "mvp" | "eclair" | "saboteur";
  label: string;
  player: Player;
  detail: string;
};

/** Distinctions globales de fin de partie (affichées s'il y a matière). */
export function computeAwards(players: Player[], stats: Map<string, PlayerStats>): Award[] {
  const awards: Award[] = [];
  const byScore = [...players].sort((a, b) => b.score - a.score);
  if (byScore[0] && byScore[0].score > 0) {
    awards.push({
      key: "mvp",
      label: "MVP du match",
      player: byScore[0],
      detail: `${byScore[0].score} points, meilleur score de la partie`,
    });
  }
  let fastest: { player: Player; seconds: number } | null = null;
  for (const p of players) {
    const s = stats.get(p.id)?.fastestSeconds;
    if (s !== null && s !== undefined && (!fastest || s < fastest.seconds)) fastest = { player: p, seconds: s };
  }
  if (fastest) {
    awards.push({
      key: "eclair",
      label: "Éclair",
      player: fastest.player,
      detail: `Buzz le plus rapide : ${formatSeconds(fastest.seconds)}`,
    });
  }
  let saboteur: { player: Player; wrong: number } | null = null;
  for (const p of players) {
    const w = stats.get(p.id)?.wrongAnswers ?? 0;
    if (w >= 2 && (!saboteur || w > saboteur.wrong)) saboteur = { player: p, wrong: w };
  }
  if (saboteur) {
    awards.push({
      key: "saboteur",
      label: "Saboteur",
      player: saboteur.player,
      detail: `${saboteur.wrong} mauvaises réponses`,
    });
  }
  return awards;
}

export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1).replace(".", ",")} s`;
}

/**
 * En mode équipes, les séries (bonus/malus) sont portées par l'équipe : la
 * valeur effective est le max sur ses membres — même règle que
 * resolve_buzz_winner côté serveur (voir 0025_teams.sql). Purement pour
 * l'affichage (buzzer retardé/bloqué) ; renvoie le joueur tel quel en solo.
 */
export function withTeamStreaks<P extends Player>(player: P, players: Player[], teamMode: boolean): P {
  if (!teamMode || !player.team_id) return player;
  const mates = players.filter((p) => p.team_id === player.team_id);
  const correct = Math.max(player.correct_streak_count, ...mates.map((p) => p.correct_streak_count));
  const blockIndexes = mates
    .map((p) => p.wrong_streak_block_round_index)
    .filter((v): v is number => v !== null);
  const block = blockIndexes.length > 0 ? Math.max(...blockIndexes) : player.wrong_streak_block_round_index;
  return { ...player, correct_streak_count: correct, wrong_streak_block_round_index: block };
}
