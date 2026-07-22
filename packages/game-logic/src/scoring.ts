/**
 * Règles de score, volontairement simples pour le MVP (V1). À affiner une
 * fois les premières parties testées.
 */
export const SCORING = {
  correctAnswer: 10,
  wrongAnswerPenalty: 0, // pas de pénalité par défaut, pour rester fun entre potes
  fastBuzzBonus: 0, // réservé pour une V2 (bonus si buzz dans les 2 premières secondes)
};

export function computeRoundScore(isCorrect: boolean): number {
  return isCorrect ? SCORING.correctAnswer : -SCORING.wrongAnswerPenalty;
}
