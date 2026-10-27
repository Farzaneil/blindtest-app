/**
 * En-têtes de sécurité HTTP (bêta publique) :
 * - frame-ancestors / X-Frame-Options : le site ne peut pas être affiché
 *   dans une iframe d'un autre site (anti "clickjacking") ;
 * - nosniff : le navigateur respecte les types de fichiers déclarés ;
 * - Referrer-Policy : l'adresse complète des pages (codes de partie…)
 *   n'est pas transmise aux sites externes ;
 * - Permissions-Policy : caméra, micro et localisation désactivés.
 * Pas de Content-Security-Policy stricte pour l'instant : le SDK Spotify,
 * Supabase (temps réel) et les CDN Deezer demanderaient une liste fine à
 * maintenir.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  /**
   * Ancienne adresse de prod -> nom de domaine (liens et QR codes déjà
   * partagés). Seul l'hôte exact est redirigé : les déploiements de
   * prévisualisation (*-git-*.vercel.app) restent accessibles.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "blindtest-app-web-host.vercel.app" }],
        destination: "https://kazouband.fr/:path*",
        permanent: true,
      },
    ];
  },
};
