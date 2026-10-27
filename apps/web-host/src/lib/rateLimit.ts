import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Limitation du nombre de requêtes côté serveur (voir migration
 * 0033_rate_limits.sql) : évite qu'un script épuise le quota de l'API
 * Deezer, inonde des boîtes mail de liens de connexion, ou essaie tous les
 * codes à 6 chiffres. En cas de panne de la base, on laisse passer (le jeu
 * ne doit pas tomber à cause de ce garde-fou).
 */

/** Adresse IP du visiteur (Vercel renseigne x-forwarded-for). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "inconnue"
  );
}

/** true si la requête est autorisée, false si la limite est atteinte. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("hit_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/** Plusieurs limites à respecter toutes (ex. par IP ET par e-mail). */
export async function rateLimitAll(limits: [key: string, max: number, windowSeconds: number][]): Promise<boolean> {
  const results = await Promise.all(limits.map(([k, m, w]) => rateLimit(k, m, w)));
  return results.every(Boolean);
}

export function tooManyRequests(message = "Trop de requêtes, réessaie dans un instant.") {
  return Response.json({ ok: false, error: message }, { status: 429 });
}
