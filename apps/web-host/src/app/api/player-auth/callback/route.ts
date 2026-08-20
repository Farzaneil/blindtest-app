import { NextRequest, NextResponse } from "next/server";
import {
  exchangePlayerCodeForTokens,
  fetchSpotifyProfile,
  createSessionCookieValue,
  COOKIE_PLAYER_VERIFIER,
  COOKIE_PLAYER_STATE,
  COOKIE_PLAYER_NEXT,
  COOKIE_PLAYER_SESSION,
} from "../../../../lib/playerAuth";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

/**
 * Callback OAuth joueur. Après échange du code contre des jetons Spotify,
 * on lit le profil public (GET /v1/me) et on upsert le compte joueur en
 * base via le client service_role (supabaseAdmin) — jamais via la clé
 * anon, puisque player_account_providers contient les jetons (voir
 * migration 0020). On identifie un compte existant par (provider,
 * provider_user_id) : une reconnexion met juste à jour les jetons et le
 * pseudo/avatar (qui peuvent changer côté Spotify), sans créer de doublon.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const next = request.cookies.get(COOKIE_PLAYER_NEXT)?.value || "/";

  const redirectWithError = (message: string) =>
    NextResponse.redirect(`${origin}/connexion?next=${encodeURIComponent(next)}&error=${encodeURIComponent(message)}`);

  if (error) return redirectWithError(error);
  if (!code || !state) return redirectWithError("missing_code_or_state");

  const expectedState = request.cookies.get(COOKIE_PLAYER_STATE)?.value;
  const verifier = request.cookies.get(COOKIE_PLAYER_VERIFIER)?.value;

  if (!expectedState || state !== expectedState) {
    return redirectWithError("État OAuth invalide — relance la connexion depuis le début.");
  }
  if (!verifier) {
    return redirectWithError("Code verifier PKCE manquant — relance la connexion depuis le début.");
  }

  try {
    const tokens = await exchangePlayerCodeForTokens(code, verifier);
    const profile = await fetchSpotifyProfile(tokens.access_token);

    // Erreur explicitement capturée ici (et pas juste `const { data } = ...`
    // comme avant) : avec une SUPABASE_SERVICE_ROLE_KEY invalide ou une
    // migration 0020 pas encore appliquée, cette requête échoue aussi —
    // sans la lire, on traitait silencieusement ça comme "aucun compte
    // existant" et on repartait sur un insert voué à échouer avec un
    // message générique impossible à diagnostiquer depuis l'écran.
    const { data: existingProvider, error: existingProviderError } = await supabaseAdmin
      .from("player_account_providers")
      .select("id, account_id")
      .eq("provider", "spotify")
      .eq("provider_user_id", profile.id)
      .maybeSingle();

    if (existingProviderError) {
      throw new Error(
        `Lecture de player_account_providers échouée (vérifie SUPABASE_SERVICE_ROLE_KEY et que la migration 0020 est bien appliquée) : ${existingProviderError.message}`
      );
    }

    const pseudo = profile.display_name?.trim() || "Joueur Spotify";
    const avatarUrl = profile.images?.[0]?.url ?? null;

    let accountId: string;

    if (existingProvider) {
      accountId = existingProvider.account_id;

      const { error: updateAccountError } = await supabaseAdmin
        .from("player_accounts")
        .update({ pseudo, avatar_url: avatarUrl })
        .eq("id", accountId);
      if (updateAccountError) {
        throw new Error(`Mise à jour de player_accounts échouée : ${updateAccountError.message}`);
      }

      const { error: updateProviderError } = await supabaseAdmin
        .from("player_account_providers")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          connected_at: new Date().toISOString(),
        })
        .eq("id", existingProvider.id);
      if (updateProviderError) {
        throw new Error(`Mise à jour de player_account_providers échouée : ${updateProviderError.message}`);
      }
    } else {
      const { data: newAccount, error: accountError } = await supabaseAdmin
        .from("player_accounts")
        .insert({ pseudo, avatar_url: avatarUrl })
        .select("id")
        .single();

      if (accountError || !newAccount) {
        throw new Error(
          `Impossible de créer le compte joueur (vérifie SUPABASE_SERVICE_ROLE_KEY et que la migration 0020 est bien appliquée) : ${accountError?.message ?? "réponse vide"}`
        );
      }
      accountId = newAccount.id;

      const { error: providerError } = await supabaseAdmin.from("player_account_providers").insert({
        account_id: accountId,
        provider: "spotify",
        provider_user_id: profile.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
      });

      if (providerError) {
        throw new Error(`Impossible de lier le compte Spotify au compte joueur : ${providerError.message}`);
      }
    }

    const response = NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}player_connected=1`);

    const baseCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    };
    response.cookies.set(COOKIE_PLAYER_SESSION, createSessionCookieValue(accountId), baseCookieOptions);
    response.cookies.delete(COOKIE_PLAYER_VERIFIER);
    response.cookies.delete(COOKIE_PLAYER_STATE);
    response.cookies.delete(COOKIE_PLAYER_NEXT);

    return response;
  } catch (e: any) {
    // Loggé côté serveur (terminal `npm run dev`) en plus d'être renvoyé
    // dans l'URL de /connexion : l'URL a une longueur limite (certains
    // navigateurs/proxies tronquent au-delà d'un certain nombre de
    // caractères), le terminal donne le message complet + la stack dans
    // tous les cas.
    console.error("[player-auth/callback]", e);
    // "TypeError: fetch failed" (undici) masque systématiquement la vraie
    // raison réseau (DNS introuvable, connexion refusée, certificat TLS non
    // reconnu par un proxy d'entreprise qui inspecte le HTTPS...) dans sa
    // propriété `cause`, jamais dans `message`. On l'ajoute explicitement,
    // sinon ce cas précis reste undiagnostiquable depuis le bandeau d'erreur.
    const cause = e?.cause ? ` (cause : ${e.cause?.message ?? String(e.cause)})` : "";
    return redirectWithError(`${e?.message ?? "unknown"}${cause}`);
  }
}
