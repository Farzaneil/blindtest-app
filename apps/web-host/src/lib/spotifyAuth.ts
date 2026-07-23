import crypto from "crypto";

/**
 * Auth Spotify — Authorization Code Flow avec PKCE.
 *
 * Toutes les fonctions ici sont volontairement "pures" : elles ne touchent
 * ni cookies ni request/response. C'est chaque route (login/callback/token)
 * qui lit/écrit les cookies directement sur le NextRequest/NextResponse
 * qu'elle manipule — plus explicite et sans ambiguïté sur la propagation
 * des Set-Cookie que la primitive cookies() de next/headers utilisée
 * indirectement à travers plusieurs fonctions.
 *
 * Pourquoi PKCE et pas le flow "classique" avec client secret : c'est ce que
 * Spotify recommande aujourd'hui pour les apps qui tournent côté navigateur,
 * et ça évite de faire transiter le client secret. Le client secret Spotify
 * n'est donc pas utilisé du tout ici.
 */

export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
export const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? "";

export const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export const COOKIE_VERIFIER = "spotify_pkce_verifier";
export const COOKIE_STATE = "spotify_oauth_state";
export const COOKIE_ACCESS_TOKEN = "spotify_access_token";
export const COOKIE_REFRESH_TOKEN = "spotify_refresh_token";
export const COOKIE_EXPIRES_AT = "spotify_expires_at";

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

export function buildAuthorizeUrl(codeChallenge: string, state: string): string {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    throw new Error(
      "SPOTIFY_CLIENT_ID et SPOTIFY_REDIRECT_URI doivent être renseignés dans apps/web-host/.env.local"
    );
  }

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    scope: SCOPES,
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

export async function exchangeCodeForTokens(code: string, verifier: string): Promise<SpotifyTokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échange du code Spotify échoué (${res.status}): ${text}`);
  }

  return (await res.json()) as SpotifyTokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: SPOTIFY_CLIENT_ID,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Rafraîchissement du token Spotify échoué (${res.status}): ${text}`);
  }

  const data = (await res.json()) as SpotifyTokenResponse;
  return { ...data, refresh_token: data.refresh_token ?? refreshToken };
}
