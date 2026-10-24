import { createClient } from "@supabase/supabase-js";

/**
 * Connexion joueur par lien magique (Supabase Auth, e-mail). Supabase ne
 * sert ici qu'à ENVOYER le lien et à VÉRIFIER le retour : la session du
 * jeu reste notre propre cookie signé (voir playerAuth.ts,
 * COOKIE_PLAYER_SESSION), créé par app/api/player-auth/confirm.
 *
 * Flux PKCE, compatible avec le modèle d'e-mail PAR DÉFAUT de Supabase
 * (non modifiable sans SMTP personnalisé sur l'offre gratuite) : l'envoi
 * produit un "code verifier", que l'on garde dans un cookie httpOnly
 * (COOKIE_MAGIC_VERIFIER) ; le lien de l'e-mail ramène sur confirm avec
 * ?code=…, échangé contre l'utilisateur grâce à ce verifier. Le lien doit
 * donc être ouvert dans le même navigateur que la demande.
 */

export const COOKIE_MAGIC_VERIFIER = "player_magic_verifier";
const STORAGE_KEY = "bt-player-auth";
const VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;

/** Client Supabase Auth d'une seule requête serveur, avec un stockage en mémoire inspectable. */
export function supabaseAuthClient(initialVerifier?: string | null) {
  const store = new Map<string, string>();
  if (initialVerifier) store.set(VERIFIER_KEY, initialVerifier);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: STORAGE_KEY,
      storage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    },
  });
  return { client, getVerifier: () => store.get(VERIFIER_KEY) ?? null };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isPlausibleEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/** Chemin de retour sûr (jamais une URL externe). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/** Pseudo de départ d'un nouveau compte : la partie avant le @, modifiable dans le profil. */
export function pseudoFromEmail(email: string): string {
  const base = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const pretty = base.charAt(0).toUpperCase() + base.slice(1);
  return (pretty || "Joueur").slice(0, 24);
}

/** E-mails autorisés à utiliser Spotify comme source musicale (variable d'env). */
export function isSpotifyAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.SPOTIFY_HOST_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return list.includes(normalizeEmail(email));
}

/**
 * Origine réelle vue par le navigateur (127.0.0.1 vs localhost en local,
 * domaine en prod) : lue dans les en-têtes plutôt que dans request.url,
 * que le serveur de dev peut réécrire en "localhost". Les cookies posés
 * sur 127.0.0.1 sont invisibles depuis localhost (et inversement).
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
