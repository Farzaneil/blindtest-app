/**
 * Support pour un futur bandeau de consentement cookies (Phase 6 du plan
 * cadrage_comptes_recompenses_rgpd.md, section 6). Aujourd'hui, ce projet
 * ne pose qu'un seul cookie : le cookie de session joueur
 * (COOKIE_PLAYER_SESSION, voir playerAuth.ts), strictement nécessaire au
 * fonctionnement du site (garder la connexion active) — il ne nécessite
 * donc PAS de consentement au sens CNIL/RGPD, comme n'importe quel cookie
 * de session technique.
 *
 * Le jour où un outil de mesure d'audience est ajouté (Neil l'a confirmé
 * envisagé, sans date précise), il s'agira d'un cookie non essentiel qui
 * nécessitera un consentement préalable. Plutôt que d'afficher dès
 * maintenant un bandeau "on utilise des cookies" qui serait trompeur (rien
 * de non essentiel n'est encore posé), on prépare l'infrastructure ici :
 * ANALYTICS_ENABLED reste à false tant qu'aucun outil n'est branché — le
 * composant CookieConsentBanner ne s'affiche donc pas aujourd'hui. Le jour
 * où l'analytics arrive, il suffira de :
 *   1. Passer ANALYTICS_ENABLED à true (ou lire une variable d'env dédiée).
 *   2. Ne charger le script d'analytics que si hasAnalyticsConsent() renvoie
 *      true (jamais avant que le joueur ait cliqué "Accepter").
 * Aucune autre modification nécessaire : le bandeau, le stockage du choix
 * et la page /confidentialite sont déjà prêts à l'emploi.
 */

// Mettre à true (ou brancher sur une variable d'env) le jour où un outil de
// mesure d'audience est réellement intégré au site.
export const ANALYTICS_ENABLED = false;

export const COOKIE_ANALYTICS_CONSENT = "bt_analytics_consent";

export type ConsentValue = "accepted" | "refused";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  // 13 mois, recommandation CNIL pour la durée de validité d'un consentement.
  const maxAgeSeconds = 60 * 60 * 24 * 396;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

export function getStoredConsent(): ConsentValue | null {
  const raw = readCookie(COOKIE_ANALYTICS_CONSENT);
  return raw === "accepted" || raw === "refused" ? raw : null;
}

export function setStoredConsent(value: ConsentValue) {
  writeCookie(COOKIE_ANALYTICS_CONSENT, value);
}

export function hasAnalyticsConsent(): boolean {
  return ANALYTICS_ENABLED && getStoredConsent() === "accepted";
}
