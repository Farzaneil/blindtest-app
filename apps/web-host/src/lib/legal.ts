/**
 * Informations légales partagées par /mentions-legales, /cgu et
 * /confidentialite. À tenir à jour ici, une seule fois.
 */

/**
 * Adresse de contact (données personnelles, signalements, questions).
 * null tant qu'elle n'est pas créée : les pages affichent alors un texte
 * d'attente. À renseigner AVANT l'ouverture au public.
 */
export const CONTACT_EMAIL: string | null = "contact@kazouband.fr";

/** Date de dernière mise à jour des documents légaux. */
export const LEGAL_LAST_UPDATE = "27 octobre 2026";

/** Âge minimum pour créer un compte joueur (consentement numérique en France). */
export const MIN_ACCOUNT_AGE = 15;

export const HOSTING = {
  name: "Vercel Inc.",
  address: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  phone: "+1 951 383 6898",
  website: "vercel.com",
} as const;

export const DATABASE = {
  name: "Supabase Inc.",
  region: "Union européenne (Paris, France)",
  website: "supabase.com",
} as const;
