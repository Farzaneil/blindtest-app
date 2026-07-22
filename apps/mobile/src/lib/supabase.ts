import { createClient } from "@supabase/supabase-js";

// TODO: déplacer ces valeurs dans des variables d'environnement (.env, non
// commité) une fois le projet Supabase créé. Voir README.md racine.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
