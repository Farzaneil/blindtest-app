/**
 * Comparaison floue entre la réponse transcrite (mode reconnaissance vocale)
 * et la bonne réponse stockée. Distance de Levenshtein simple, normalisée par
 * la longueur, avec un seuil tolérant les fautes de prononciation/transcription.
 */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents (diacritiques Unicode)
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function isAnswerMatch(spoken: string, expected: string, threshold = 0.75): boolean {
  const a = normalize(spoken);
  const b = normalize(expected);
  if (!a || !b) return false;
  const distance = levenshtein(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);
  return similarity >= threshold;
}
