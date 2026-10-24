/**
 * Effets spéciaux des avatars (voir lib/avatars.tsx) — module sans JSX,
 * utilisable aussi côté serveur (validation dans api/player-account/update-avatar).
 */

// ============================================================================
// Effets spéciaux (un seul à la fois, par-dessus l'avatar) : version or,
// avatar animé, chapeaux de saison, accessoires "légende" liés aux badges.
// Conditions vérifiées côté client (affichage) ET côté serveur (route
// api/player-account/update-avatar), à partir de l'XP et des badges.
// ============================================================================

export type AvatarExtraKey = "anime" | "or" | "couronne" | "star" | "halloween" | "noel" | "ete";

export type AvatarExtraUnlock =
  | { type: "level"; level: number }
  | { type: "badge"; badgeKey: string; progress?: number; tier?: "bronze" | "argent" | "or" }
  | { type: "season"; from: [number, number]; to: [number, number] }; // [mois, jour], bornes incluses

export type AvatarExtraDefinition = {
  key: AvatarExtraKey;
  label: string;
  description: string;
  unlockHint: string;
  unlock: AvatarExtraUnlock;
};

export const AVATAR_EXTRAS: AvatarExtraDefinition[] = [
  { key: "anime", label: "Animé", description: "Ton avatar s’anime quand tu buzzes et sur le podium.", unlockHint: "Niveau 5", unlock: { type: "level", level: 5 } },
  { key: "or", label: "Version or", description: "Rond doré et paillettes.", unlockHint: "10 victoires", unlock: { type: "badge", badgeKey: "champion", progress: 10 } },
  { key: "couronne", label: "Couronne", description: "Pour les buzzeurs les plus rapides.", unlockHint: "Badge Éclair en or", unlock: { type: "badge", badgeKey: "eclair", tier: "or" } },
  { key: "star", label: "Lunettes de star", description: "Pour celles et ceux qui ont du goût.", unlockHint: "Badge Curateur en argent", unlock: { type: "badge", badgeKey: "curateur", tier: "argent" } },
  { key: "halloween", label: "Chapeau de sorcière", description: "Édition Halloween.", unlockHint: "Du 15 octobre au 5 novembre", unlock: { type: "season", from: [10, 15], to: [11, 5] } },
  { key: "noel", label: "Bonnet de Noël", description: "Édition Noël.", unlockHint: "Du 1er décembre au 6 janvier", unlock: { type: "season", from: [12, 1], to: [1, 6] } },
  { key: "ete", label: "Chapeau de paille", description: "Édition été.", unlockHint: "Du 21 juin au 21 septembre", unlock: { type: "season", from: [6, 21], to: [9, 21] } },
];

export const AVATAR_EXTRA_BY_KEY: Record<string, AvatarExtraDefinition> = Object.fromEntries(AVATAR_EXTRAS.map((e) => [e.key, e]));
export const isAvatarExtraKey = (k: unknown): k is AvatarExtraKey => typeof k === "string" && k in AVATAR_EXTRA_BY_KEY;

const TIER_RANK = { none: 0, bronze: 1, argent: 2, or: 3 } as const;

export type AvatarUnlockContext = {
  xp: number;
  badges: Record<string, { progress: number; tier: "none" | "bronze" | "argent" | "or" }>;
  now?: Date;
};

function inSeason(now: Date, from: [number, number], to: [number, number]): boolean {
  const v = (now.getMonth() + 1) * 100 + now.getDate();
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
}

export function isAvatarExtraUnlocked(def: AvatarExtraDefinition, ctx: AvatarUnlockContext): boolean {
  const u = def.unlock;
  if (u.type === "level") return Math.floor(Math.max(ctx.xp, 0) / 100) + 1 >= u.level;
  if (u.type === "season") return inSeason(ctx.now ?? new Date(), u.from, u.to);
  const b = ctx.badges[u.badgeKey];
  if (!b) return false;
  if (u.progress !== undefined && b.progress < u.progress) return false;
  if (u.tier && TIER_RANK[b.tier] < TIER_RANK[u.tier]) return false;
  return true;
}

const EXTRA_OVERLAYS: Record<string, string> = {
  "couronne": "<g transform=\"rotate(-8 50 10)\"><path d=\"M29 19 L33 -3 L42 8 L50 -8 L58 8 L67 -3 L71 19 Z\" fill=\"#F5A524\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"10\" r=\"3\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"2\"/><circle cx=\"37\" cy=\"13\" r=\"2.2\" fill=\"#A8DCFF\" stroke=\"#111111\" stroke-width=\"2\"/><circle cx=\"63\" cy=\"13\" r=\"2.2\" fill=\"#A8DCFF\" stroke=\"#111111\" stroke-width=\"2\"/></g>",
  "halloween": "<g transform=\"rotate(-10 50 10)\"><path d=\"M35 15 C40 5 44 -9 61 -17 C58 -6 62 5 65 15 Z\" fill=\"#8A5CFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M36.5 10 Q50 13.5 63.5 10 L64.5 14 Q50 17.5 35.5 14 Z\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"2\"/><ellipse cx=\"50\" cy=\"16.5\" rx=\"30\" ry=\"6\" fill=\"#8A5CFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></g><path d=\"M84.0 6.0 L85.6 9.8 L89.7 10.1 L86.6 12.8 L87.5 16.9 L84.0 14.7 L80.5 16.9 L81.4 12.8 L78.3 10.1 L82.4 9.8 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"2.5\" stroke-linejoin=\"round\"/>",
  "noel": "<g transform=\"rotate(-8 50 10)\"><path d=\"M31 17 Q38 -6 68 -9 Q81 -6 79 8 Q68 3 63 17 Z\" fill=\"#D7263D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"79\" cy=\"9\" r=\"6\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"25\" y=\"11\" width=\"48\" height=\"11\" rx=\"5.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/></g>",
  "ete": "<g transform=\"rotate(-6 50 10)\"><ellipse cx=\"50\" cy=\"17\" rx=\"35\" ry=\"7\" fill=\"#F5A524\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M34 16 C34 1 66 1 66 16 Z\" fill=\"#F5A524\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M34.6 10.5 H65.4 L65.9 15 H34.1 Z\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"2\"/></g>",
  "or": "<circle cx=\"50\" cy=\"50\" r=\"41.5\" fill=\"none\" stroke=\"#F5A524\" stroke-width=\"5\"/><path d=\"M88.0 3.0 L90.1 10.9 L98.0 13.0 L90.1 15.1 L88.0 23.0 L85.9 15.1 L78.0 13.0 L85.9 10.9 Z\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M9.0 26.0 L10.5 31.5 L16.0 33.0 L10.5 34.5 L9.0 40.0 L7.5 34.5 L2.0 33.0 L7.5 31.5 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M87.0 80.0 L88.3 84.7 L93.0 86.0 L88.3 87.3 L87.0 92.0 L85.7 87.3 L81.0 86.0 L85.7 84.7 Z\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"3\" stroke-linejoin=\"round\"/>"
};

const STAR_GLASSES: Record<string, string> = {
  "vinny": "<path d=\"M50.5 49.0 L49.5 49.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M44.5 40.5 L46.7 45.9 L52.6 46.4 L48.1 50.2 L49.5 55.9 L44.5 52.8 L39.5 55.9 L40.9 50.2 L36.4 46.4 L42.3 45.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M55.5 40.5 L57.7 45.9 L63.6 46.4 L59.1 50.2 L60.5 55.9 L55.5 52.8 L50.5 55.9 L51.9 50.2 L47.4 46.4 L53.3 45.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"44.5\" cy=\"49.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"55.5\" cy=\"49.5\" r=\"2.0\" fill=\"#111111\"/>",
  "kassie": "<path d=\"M45.4 58.0 L54.6 58.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M37.0 46.0 L40.2 53.6 L48.4 54.3 L42.1 59.7 L44.1 67.7 L37.0 63.4 L29.9 67.7 L31.9 59.7 L25.6 54.3 L33.8 53.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M63.0 46.0 L66.2 53.6 L74.4 54.3 L68.1 59.7 L70.1 67.7 L63.0 63.4 L55.9 67.7 L57.9 59.7 L51.6 54.3 L59.8 53.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"37\" cy=\"58.5\" r=\"2.9\" fill=\"#111111\"/><circle cx=\"63\" cy=\"58.5\" r=\"2.9\" fill=\"#111111\"/>",
  "mike": "<path d=\"M49.0 34.0 L51.0 34.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M43.0 25.5 L45.2 30.9 L51.1 31.4 L46.6 35.2 L48.0 40.9 L43.0 37.8 L38.0 40.9 L39.4 35.2 L34.9 31.4 L40.8 30.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M57.0 25.5 L59.2 30.9 L65.1 31.4 L60.6 35.2 L62.0 40.9 L57.0 37.8 L52.0 40.9 L53.4 35.2 L48.9 31.4 L54.8 30.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"43\" cy=\"34.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"57\" cy=\"34.5\" r=\"2.0\" fill=\"#111111\"/>",
  "bobby": "<path d=\"M48.0 53.0 L52.0 53.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M42.0 44.5 L44.2 49.9 L50.1 50.4 L45.6 54.2 L47.0 59.9 L42.0 56.8 L37.0 59.9 L38.4 54.2 L33.9 50.4 L39.8 49.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M58.0 44.5 L60.2 49.9 L66.1 50.4 L61.6 54.2 L63.0 59.9 L58.0 56.8 L53.0 59.9 L54.4 54.2 L49.9 50.4 L55.8 49.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"42\" cy=\"53.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"58\" cy=\"53.5\" r=\"2.0\" fill=\"#111111\"/>",
  "doudou": "<path d=\"M43.5 66.2 L43.0 66.2\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M37.5 59.5 L39.7 64.9 L45.6 65.4 L41.1 69.2 L42.5 74.9 L37.5 71.8 L32.5 74.9 L33.9 69.2 L29.4 65.4 L35.3 64.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M49.0 56.0 L51.2 61.4 L57.1 61.9 L52.6 65.7 L54.0 71.4 L49.0 68.3 L44.0 71.4 L45.4 65.7 L40.9 61.9 L46.8 61.4 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"37.5\" cy=\"68.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"49\" cy=\"65.0\" r=\"2.0\" fill=\"#111111\"/>",
  "boomer": "<path d=\"M40.4 57.0 L59.6 57.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M32.0 45.0 L35.2 52.6 L43.4 53.3 L37.1 58.7 L39.1 66.7 L32.0 62.4 L24.9 66.7 L26.9 58.7 L20.6 53.3 L28.8 52.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M68.0 45.0 L71.2 52.6 L79.4 53.3 L73.1 58.7 L75.1 66.7 L68.0 62.4 L60.9 66.7 L62.9 58.7 L56.6 53.3 L64.8 52.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"57.5\" r=\"2.9\" fill=\"#111111\"/><circle cx=\"68\" cy=\"57.5\" r=\"2.9\" fill=\"#111111\"/>",
  "mara": "<path d=\"M49.0 39.0 L51.0 39.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M43.0 30.5 L45.2 35.9 L51.1 36.4 L46.6 40.2 L48.0 45.9 L43.0 42.8 L38.0 45.9 L39.4 40.2 L34.9 36.4 L40.8 35.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M57.0 30.5 L59.2 35.9 L65.1 36.4 L60.6 40.2 L62.0 45.9 L57.0 42.8 L52.0 45.9 L53.4 40.2 L48.9 36.4 L54.8 35.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"43\" cy=\"39.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"57\" cy=\"39.5\" r=\"2.0\" fill=\"#111111\"/>",
  "woofer": "<path d=\"M47.0 33.0 L53.0 33.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M40.0 23.0 L42.6 29.4 L49.5 29.9 L44.3 34.4 L45.9 41.1 L40.0 37.5 L34.1 41.1 L35.7 34.4 L30.5 29.9 L37.4 29.4 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M60.0 23.0 L62.6 29.4 L69.5 29.9 L64.3 34.4 L65.9 41.1 L60.0 37.5 L54.1 41.1 L55.7 34.4 L50.5 29.9 L57.4 29.4 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"40\" cy=\"33.5\" r=\"2.4\" fill=\"#111111\"/><circle cx=\"60\" cy=\"33.5\" r=\"2.4\" fill=\"#111111\"/>",
  "gigi": "<path d=\"M50.0 50.0 L50.0 50.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M44.0 41.5 L46.2 46.9 L52.1 47.4 L47.6 51.2 L49.0 56.9 L44.0 53.8 L39.0 56.9 L40.4 51.2 L35.9 47.4 L41.8 46.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M56.0 41.5 L58.2 46.9 L64.1 47.4 L59.6 51.2 L61.0 56.9 L56.0 53.8 L51.0 56.9 L52.4 51.2 L47.9 47.4 L53.8 46.9 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"44\" cy=\"50.5\" r=\"2.0\" fill=\"#111111\"/><circle cx=\"56\" cy=\"50.5\" r=\"2.0\" fill=\"#111111\"/>",
  "goldie": "<path d=\"M46.4 45.5 L53.6 45.5\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M38.0 33.5 L41.2 41.1 L49.4 41.8 L43.1 47.2 L45.1 55.2 L38.0 50.9 L30.9 55.2 L32.9 47.2 L26.6 41.8 L34.8 41.1 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M62.0 33.5 L65.2 41.1 L73.4 41.8 L67.1 47.2 L69.1 55.2 L62.0 50.9 L54.9 55.2 L56.9 47.2 L50.6 41.8 L58.8 41.1 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"38\" cy=\"46.0\" r=\"2.9\" fill=\"#111111\"/><circle cx=\"62\" cy=\"46.0\" r=\"2.9\" fill=\"#111111\"/>",
  "boum": "<path d=\"M47.3 55.0 L52.7 55.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M41.0 46.0 L43.4 51.7 L49.6 52.2 L44.9 56.3 L46.3 62.3 L41.0 59.0 L35.7 62.3 L37.1 56.3 L32.4 52.2 L38.6 51.7 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M59.0 46.0 L61.4 51.7 L67.6 52.2 L62.9 56.3 L64.3 62.3 L59.0 59.0 L53.7 62.3 L55.1 56.3 L50.4 52.2 L56.6 51.7 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"41\" cy=\"55.5\" r=\"2.2\" fill=\"#111111\"/><circle cx=\"59\" cy=\"55.5\" r=\"2.2\" fill=\"#111111\"/>",
  "radiola": "<path d=\"M45.4 43.0 L54.6 43.0\" stroke=\"#111111\" stroke-width=\"3\"/><path d=\"M37.0 31.0 L40.2 38.6 L48.4 39.3 L42.1 44.7 L44.1 52.7 L37.0 48.4 L29.9 52.7 L31.9 44.7 L25.6 39.3 L33.8 38.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M63.0 31.0 L66.2 38.6 L74.4 39.3 L68.1 44.7 L70.1 52.7 L63.0 48.4 L55.9 52.7 L57.9 44.7 L51.6 39.3 L59.8 38.6 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"37\" cy=\"43.5\" r=\"2.9\" fill=\"#111111\"/><circle cx=\"63\" cy=\"43.5\" r=\"2.9\" fill=\"#111111\"/>"
};

/** Animation propre à chaque avatar (effet "Animé"). */
const ANIMATION_CLASS: Record<string, string> = {
  vinny: "avatar-anim-spin",
  goldie: "avatar-anim-spin",
  mike: "avatar-anim-hop",
  woofer: "avatar-anim-pulse",
  boomer: "avatar-anim-pulse",
  boum: "avatar-anim-hop",
  mara: "avatar-anim-shake",
};

export function avatarOverlay(avatarKey: string, extra: string | null | undefined): string {
  if (!extra) return "";
  if (extra === "star") return STAR_GLASSES[avatarKey] ?? "";
  return EXTRA_OVERLAYS[extra] ?? "";
}

export function avatarAnimationClass(avatarKey: string): string {
  return ANIMATION_CLASS[avatarKey] ?? "avatar-anim-bop";
}
