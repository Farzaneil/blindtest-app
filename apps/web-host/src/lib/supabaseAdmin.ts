import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase "admin" (clé service_role) — RÉSERVÉ AU SERVEUR (routes
 * API sous app/api/ uniquement, jamais importé depuis un composant
 * "use client"). Contrairement au reste de l'appli (voir supabase.ts, clé
 * anon + policies RLS ouvertes "entre amis", cf. migrations 0003/0004),
 * les tables liées aux comptes joueurs peuvent contenir des jetons OAuth
 * (player_account_providers, voir migration 0020) qui ne doivent jamais
 * transiter par la clé anon. Cette clé service_role contourne la RLS —
 * à ne jamais préfixer en NEXT_PUBLIC_ ni exposer côté navigateur.
 *
 * Initialisation PARESSEUSE (voir getSupabaseAdmin) plutôt qu'au chargement
 * du module comme avant : Next.js importe TOUTES les routes API pendant
 * "Collecting page data" au build (`next build`, notamment sur Vercel),
 * même celles qui ne servent aucune requête à ce moment-là. Un throw au
 * chargement du module (ancienne version) plantait donc le build ENTIER dès
 * qu'une seule variable d'env manquait au moment du build — repéré en
 * production sur Vercel avec "Failed to collect page data for
 * /api/player-account/delete" au tout premier déploiement incluant une
 * route qui importe ce fichier, faute d'avoir encore renseigné
 * SUPABASE_SERVICE_ROLE_KEY dans les variables d'environnement Vercel.
 * Avec l'init paresseuse, une variable manquante ne fait échouer que LA
 * requête qui a effectivement besoin du client admin (réponse 500 sur cette
 * route précise), jamais le déploiement de tout le site.
 */
let cached: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  // Vérifié à la première utilisation réelle (pas au chargement du module) :
  // une URL/clé vide donnerait sinon un "TypeError: fetch failed" totalement
  // opaque au moment du premier appel réseau (voir callback/route.ts), sans
  // aucun indice sur la cause réelle. Ici on échoue tout de suite avec un
  // message qui dit explicitement ce qui manque.
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Configuration Supabase admin incomplète : " +
        (!SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL manquant. " : "") +
        (!SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY manquant. " : "") +
        "En local, vérifie apps/web-host/.env.local puis relance `npm run dev` " +
        "(les variables d'environnement ne sont relues qu'au démarrage du serveur). " +
        "En production (Vercel), vérifie les variables d'environnement du projet."
    );
  }

  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return cached;
}

// Proxy plutôt qu'un simple appel à getSupabaseAdmin() ici : ça préserverait
// exactement la même syntaxe d'appel partout ailleurs (supabaseAdmin.from(...),
// voir callback/route.ts et api/player-account/*), tout en ne déclenchant
// getSupabaseAdmin() (et donc la vérification des variables d'env) qu'au
// premier ACCÈS réel à une propriété — jamais au chargement du module.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  },
});
