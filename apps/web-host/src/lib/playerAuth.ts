import crypto from "crypto";

/**
 * Auth Spotify "joueur" — distincte de la connexion Spotify "hôte" (voir
 * spotifyAuth.ts, qui sert à contrôler la lecture via le Web Playback SDK).
 * Ici on ne cherche qu'une identité (pseudo, avatar) pour l'espace joueur :
 * n'importe quel compte Spotify (gratuit ou Premium) doit pouvoir s'en
 * servir, avec des scopes beaucoup plus légers. Même appli Spotify côté
 * développeur (même SPOTIFY_CLIENT_ID), mais redirect URI et cookies
 * séparés, pour qu'une connexion hôte n'active jamais par erreur un compte
 * joueur et inversement (voir cadrage_comptes_recompenses_rgpd.md, section 2).
 *
 * Contrairement au flow hôte (qui ne fait que garder les jetons Spotify en
 * cookies httpOnly, sans jamais toucher Supabase), le callback ici crée/
 * met à jour un compte joueur en base (voir api/player-auth/callback) via
 * le client service_role (voir supabaseAdmin.ts) — player_account_providers
 * contient les jetons et n'est jamais accessible via la clé anon.
 */

export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
export const SPOTIFY_PLAYER_REDIRECT_URI = process.env.SPOTIFY_PLAYER_REDIRECT_URI ?? "";

export const PLAYER_SCOPES = ["user-read-email", "user-read-private"].join(" ");

export const COOKIE_PLAYER_VERIFIER = "player_pkce_verifier";
export const COOKIE_PLAYER_STATE = "player_oauth_state";
export const COOKIE_PLAYER_NEXT = "player_oauth_next";
export const COOKIE_PLAYER_SESSION = "player_session";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generatePkceVerifier(): string {
  return base64url(crypto.randomBytes(64)).slice(0, 128);
}

export function codeChallengeFromVerifier(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64url(hash);
}

export function generateState(): string {
  return base64url(crypto.randomBytes(16));
}

export function buildPlayerAuthorizeUrl(codeChallenge: string, state: string): string {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_PLAYER_REDIRECT_URI) {
    throw new Error(
      "SPOTIFY_CLIENT_ID et SPOTIFY_PLAYER_REDIRECT_URI doivent être renseignés dans apps/web-host/.env.local " +
        "(sur le dashboard développeur Spotify, ajoute cette redirect URI en plus de celle déjà utilisée par la connexion hôte)."
    );
  }

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_PLAYER_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    scope: PLAYER_SCOPES,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export type SpotifyTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
};

export async function exchangePlayerCodeForTokens(code: string, verifier: string): Promise<SpotifyTokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_PLAYER_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échange du code Spotify (joueur) échoué (${res.status}): ${text}`);
  }

  return (await res.json()) as SpotifyTokenResponse;
}

export type SpotifyPublicProfile = {
  id: string;
  display_name: string | null;
  images?: { url: string }[];
};

export async function fetchSpotifyProfile(accessToken: string): Promise<SpotifyPublicProfile> {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lecture du profil Spotify échouée (${res.status}): ${text}`);
  }

  return (await res.json()) as SpotifyPublicProfile;
}

// ---------------------------------------------------------------------------
// Session joueur — cookie signé contenant juste l'account_id, pas de table
// de sessions séparée : cohérent avec le reste de l'appli, qui n'a pas
// d'auth Supabase réelle et garde tout côté cookie/device_id (voir
// spotifyAuth.ts, joinRoomByCode...). Signature HMAC pour empêcher un
// client de forger un account_id arbitraire — sans ça, n'importe qui
// pourrait se faire passer pour n'importe quel compte joueur juste en
// connaissant/devinant son id.
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.PLAYER_SESSION_SECRET ?? "";

function sign(value: string): string {
  if (!SESSION_SECRET) {
    throw new Error(
      "PLAYER_SESSION_SECRET doit être renseigné dans apps/web-host/.env.local (chaîne aléatoire longue, jamais commitée)."
    );
  }
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

export function createSessionCookieValue(accountId: string): string {
  return `${accountId}.${sign(accountId)}`;
}

export function verifySessionCookieValue(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const [accountId, signature] = cookieValue.split(".");
  if (!accountId || !signature) return null;

  let expected: string;
  try {
    expected = sign(accountId);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  return accountId;
}
