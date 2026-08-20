import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase "admin" (clé service_role) — RÉSERVÉ AU SERVEUR (routes
 * API sous app/api/ uniquement, jamais importé depuis un composant
 * "use client"). Contrairement au reste de l'appli (voir supabase.ts, clé
 * anon + policies RLS ouvertes "entre amis", cf. migrations 0003/0004),
 * les tables liées aux comptes joueurs peuvent contenir des jetons OAuth
 * (player_account_providers, voir migration 0020) qui ne doivent jamais
 * transiter par la clé anon. Cette clé service_role contourne la RLS —
 * à ne jamais préfixer en NEXT_PUBLIC_ ni exposer côté navigateur.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// Vérifié une seule fois, au chargement du module (pas à chaque requête) :
// une URL/clé vide donnerait un "TypeError: fetch failed" totalement
// opaque au moment du premier appel réseau (voir callback/route.ts), sans
// aucun indice sur la cause réelle. Ici on échoue tout de suite avec un
// message qui dit explicitement ce qui manque.
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Configuration Supabase admin incomplète : " +
      (!SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL manquant. " : "") +
      (!SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY manquant. " : "") +
      "Vérifie apps/web-host/.env.local, puis relance `npm run dev` (les variables " +
      "d'environnement ne sont relues qu'au démarrage du serveur)."
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
