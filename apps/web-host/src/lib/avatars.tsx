/**
 * Avatars "La Bande-Son" (DA Arcade autocollants, maquettes validées dans le
 * canvas "Blindtest — Refonte Arcade", page Avatars) : 12 objets de musique
 * avec un visage, dessinés en SVG (viewBox 0 0 100 100) — pas de fichiers
 * image, net à toutes les tailles. Tous disponibles dès le départ.
 *
 * - Un compte choisit son avatar et la couleur du rond (profil), stockés
 *   dans player_accounts (migration 0030) et recopiés sur sa ligne
 *   `players` en rejoignant une partie.
 * - Un invité reçoit un avatar et une couleur tirés de son pseudo
 *   (toujours les mêmes pour un même pseudo), voir avatarForPlayer.
 *
 * Les tracés SVG sont des chaînes statiques écrites ici (aucune donnée
 * utilisateur), d'où l'usage de dangerouslySetInnerHTML.
 *
 * Pas de "use client" : module sans état ni hook, importé aussi par les
 * routes serveur (validation de l'avatar choisi).
 *
 * Effets spéciaux (or, animé, chapeaux de saison, accessoires) : voir
 * lib/avatarExtras.ts.
 */

import { avatarAnimationClass, avatarOverlay, isAvatarExtraKey } from "./avatarExtras";

export type AvatarDefinition = { key: string; name: string; what: string; bg: string; svg: string };

export const AVATARS: AvatarDefinition[] = [
  {
    "key": "vinny",
    "name": "Vinny",
    "what": "le vinyle",
    "bg": "#FFE14D",
    "svg": "<circle cx=\"50\" cy=\"52\" r=\"31\" fill=\"#4D7CFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"24\" fill=\"none\" stroke=\"#111111\" stroke-width=\"2\" opacity=\"0.35\"/><path d=\"M27 42 A25 25 0 0 1 40 29\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"15\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"44.5\" cy=\"49\" r=\"3.4\" fill=\"#111111\"/><circle cx=\"45.7\" cy=\"47.7\" r=\"1.1\" fill=\"#FFFFFF\"/><circle cx=\"55.5\" cy=\"49\" r=\"3.4\" fill=\"#111111\"/><circle cx=\"56.7\" cy=\"47.7\" r=\"1.1\" fill=\"#FFFFFF\"/><path d=\"M46 55 Q50 58.6 54 55\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>"
  },
  {
    "key": "kassie",
    "name": "Kassie",
    "what": "la cassette",
    "bg": "#A8DCFF",
    "svg": "<rect x=\"16\" y=\"28\" width=\"68\" height=\"46\" rx=\"9\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"25\" y=\"35\" width=\"50\" height=\"11\" rx=\"3\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M30 40.5 H58\" stroke=\"#111111\" stroke-width=\"2\" opacity=\"0.4\"/><circle cx=\"37\" cy=\"58\" r=\"8.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"38.5\" cy=\"59.5\" r=\"3.8\" fill=\"#111111\"/><circle cx=\"63\" cy=\"58\" r=\"8.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"64.5\" cy=\"59.5\" r=\"3.8\" fill=\"#111111\"/><path d=\"M45.5 64 Q50 68.0 54.5 64\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><circle cx=\"26\" cy=\"66\" r=\"3\" fill=\"#FF6FB5\" opacity=\"0.75\"/>"
  },
  {
    "key": "mike",
    "name": "Mike",
    "what": "le micro",
    "bg": "#C9B6FF",
    "svg": "<rect x=\"42\" y=\"54\" width=\"16\" height=\"32\" rx=\"7\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"37\" y=\"53\" width=\"26\" height=\"8\" rx=\"3.5\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"35\" r=\"21\" fill=\"#D6D9DE\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M33 27 H67 M30 36 H70\" stroke=\"#111111\" stroke-width=\"2\" opacity=\"0.18\"/><circle cx=\"43\" cy=\"34\" r=\"5\" fill=\"#111111\"/><circle cx=\"44.8\" cy=\"32.1\" r=\"1.6\" fill=\"#FFFFFF\"/><circle cx=\"57\" cy=\"34\" r=\"5\" fill=\"#111111\"/><circle cx=\"58.8\" cy=\"32.1\" r=\"1.6\" fill=\"#FFFFFF\"/><path d=\"M44 42 Q50 49.2 56 42 Z\" fill=\"#111111\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M47.3 45.3 Q50 47.7 52.7 45.3\" fill=\"#FF6FB5\"/>"
  },
  {
    "key": "bobby",
    "name": "Bobby",
    "what": "le casque",
    "bg": "#FF6FB5",
    "svg": "<circle cx=\"50\" cy=\"56\" r=\"23\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M23 56 A27 27 0 0 1 77 56\" fill=\"none\" stroke=\"#111111\" stroke-width=\"12\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M23 56 A27 27 0 0 1 77 56\" fill=\"none\" stroke=\"#4D7CFF\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"14\" y=\"46\" width=\"15\" height=\"24\" rx=\"7\" fill=\"#4D7CFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"71\" y=\"46\" width=\"15\" height=\"24\" rx=\"7\" fill=\"#4D7CFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M38 54 Q42 49.6 46 54\" fill=\"none\" stroke=\"#111111\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M54 54 Q58 49.6 62 54\" fill=\"none\" stroke=\"#111111\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M43 61 Q50 69.4 57 61 Z\" fill=\"#111111\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M46.9 64.8 Q50 67.7 53.1 64.8\" fill=\"#FF6FB5\"/><circle cx=\"37\" cy=\"62\" r=\"3.5\" fill=\"#FF6FB5\" opacity=\"0.75\"/><circle cx=\"63\" cy=\"62\" r=\"3.5\" fill=\"#FF6FB5\" opacity=\"0.75\"/>"
  },
  {
    "key": "doudou",
    "name": "Doudou",
    "what": "la croche",
    "bg": "#A8DCFF",
    "svg": "<path d=\"M56 18 C72 20 80 30 76 44 C72 36 66 32 60 32 Z\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"54\" y=\"17\" width=\"8\" height=\"50\" rx=\"3\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"44\" cy=\"69\" rx=\"18\" ry=\"13.5\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\" transform=\"rotate(-18 44 69)\"/><circle cx=\"37.5\" cy=\"68\" r=\"4\" fill=\"#111111\"/><circle cx=\"38.9\" cy=\"66.5\" r=\"1.3\" fill=\"#FFFFFF\"/><circle cx=\"49\" cy=\"64.5\" r=\"4\" fill=\"#111111\"/><circle cx=\"50.4\" cy=\"63.0\" r=\"1.3\" fill=\"#FFFFFF\"/><path d=\"M41 74 Q45 77.6 49 74\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>"
  },
  {
    "key": "boomer",
    "name": "Boomer",
    "what": "la boombox",
    "bg": "#FFE14D",
    "svg": "<path d=\"M76 36 L84 19\" stroke=\"#111111\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"84\" cy=\"18\" r=\"3.6\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M32 37 V28 H68 V37\" fill=\"none\" stroke=\"#111111\" stroke-width=\"5\" stroke-linejoin=\"round\"/><rect x=\"14\" y=\"35\" width=\"72\" height=\"42\" rx=\"10\" fill=\"#C9B6FF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"32\" cy=\"57\" r=\"12\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"33.5\" cy=\"58.5\" r=\"5\" fill=\"#111111\"/><circle cx=\"68\" cy=\"57\" r=\"12\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"69.5\" cy=\"58.5\" r=\"5\" fill=\"#111111\"/><rect x=\"44\" y=\"42\" width=\"12\" height=\"7\" rx=\"2\" fill=\"#FFE14D\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M45.5 62 Q50 66.0 54.5 62\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>"
  },
  {
    "key": "mara",
    "name": "Mara",
    "what": "la maraca",
    "bg": "#39D98A",
    "svg": "<path d=\"M22 28 L15 24 M21 39 L13 39 M78 28 L85 24 M79 39 L87 39\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><rect x=\"45.5\" y=\"62\" width=\"10\" height=\"27\" rx=\"4.5\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"40\" rx=\"23\" ry=\"25\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"34\" cy=\"32\" r=\"2.6\" fill=\"#FFFFFF\"/><circle cx=\"66\" cy=\"32\" r=\"2.6\" fill=\"#FFFFFF\"/><circle cx=\"37\" cy=\"53\" r=\"2.6\" fill=\"#FFFFFF\"/><circle cx=\"63\" cy=\"53\" r=\"2.6\" fill=\"#FFFFFF\"/><circle cx=\"43\" cy=\"39\" r=\"5\" fill=\"#111111\"/><circle cx=\"44.8\" cy=\"37.1\" r=\"1.6\" fill=\"#FFFFFF\"/><circle cx=\"57\" cy=\"39\" r=\"5\" fill=\"#111111\"/><circle cx=\"58.8\" cy=\"37.1\" r=\"1.6\" fill=\"#FFFFFF\"/><path d=\"M44 47 Q50 54.2 56 47 Z\" fill=\"#111111\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M47.3 50.3 Q50 52.7 52.7 50.3\" fill=\"#FF6FB5\"/>"
  },
  {
    "key": "woofer",
    "name": "Woofer",
    "what": "l’enceinte",
    "bg": "#FF9A3C",
    "svg": "<path d=\"M80 49 Q86 58 80 67 M86 44 Q95 58 86 72\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><rect x=\"25\" y=\"15\" width=\"50\" height=\"70\" rx=\"10\" fill=\"#A8DCFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"40\" cy=\"33\" r=\"7.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"41.3\" cy=\"34.3\" r=\"3.3\" fill=\"#111111\"/><circle cx=\"60\" cy=\"33\" r=\"7.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"61.3\" cy=\"34.3\" r=\"3.3\" fill=\"#111111\"/><circle cx=\"50\" cy=\"61\" r=\"14.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"62\" rx=\"7.5\" ry=\"8.5\" fill=\"#111111\"/><ellipse cx=\"50\" cy=\"66.5\" rx=\"4\" ry=\"2.6\" fill=\"#FF6FB5\"/>"
  },
  {
    "key": "gigi",
    "name": "Gigi",
    "what": "la guitare",
    "bg": "#C9B6FF",
    "svg": "<rect x=\"46\" y=\"8\" width=\"8\" height=\"38\" rx=\"2\" fill=\"#E7B48F\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"42\" y=\"5\" width=\"16\" height=\"11\" rx=\"3.5\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"71\" rx=\"21\" ry=\"17\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"51\" rx=\"15\" ry=\"13\" fill=\"#FF9A3C\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M36.5 61 Q50 64 63.5 61\" fill=\"none\" stroke=\"#FF9A3C\" stroke-width=\"6\"/><circle cx=\"44\" cy=\"50\" r=\"4.2\" fill=\"#111111\"/><circle cx=\"45.5\" cy=\"48.4\" r=\"1.3\" fill=\"#FFFFFF\"/><circle cx=\"56\" cy=\"50\" r=\"4.2\" fill=\"#111111\"/><circle cx=\"57.5\" cy=\"48.4\" r=\"1.3\" fill=\"#FFFFFF\"/><ellipse cx=\"50\" cy=\"71\" rx=\"6.5\" ry=\"5.5\" fill=\"#111111\"/><rect x=\"41\" y=\"81\" width=\"18\" height=\"4\" rx=\"2\" fill=\"#111111\"/>"
  },
  {
    "key": "goldie",
    "name": "Goldie",
    "what": "le disque d’or",
    "bg": "#4D7CFF",
    "svg": "<path d=\"M80.0 10.0 L82.1 17.9 L90.0 20.0 L82.1 22.1 L80.0 30.0 L77.9 22.1 L70.0 20.0 L77.9 17.9 Z\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M18.0 69.0 L19.5 74.5 L25.0 76.0 L19.5 77.5 L18.0 83.0 L16.5 77.5 L11.0 76.0 L16.5 74.5 Z\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"31\" fill=\"#F5A524\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"24\" fill=\"none\" stroke=\"#111111\" stroke-width=\"2\" opacity=\"0.3\"/><path d=\"M29 44 H71\" stroke=\"#111111\" stroke-width=\"3\"/><rect x=\"29\" y=\"40\" width=\"18\" height=\"11\" rx=\"4.5\" fill=\"#111111\"/><rect x=\"53\" y=\"40\" width=\"18\" height=\"11\" rx=\"4.5\" fill=\"#111111\"/><path d=\"M32 43 L36 43\" stroke=\"#FFFFFF\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M40 60 Q49 67 59 58\" fill=\"none\" stroke=\"#111111\" stroke-width=\"4\" stroke-linecap=\"round\"/>"
  },
  {
    "key": "boum",
    "name": "Boum",
    "what": "le tambour",
    "bg": "#FFE14D",
    "svg": "<path d=\"M26 18 L46 40\" fill=\"none\" stroke=\"#111111\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M26 18 L46 40\" fill=\"none\" stroke=\"#E7B48F\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M74 18 L54 40\" fill=\"none\" stroke=\"#111111\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M74 18 L54 40\" fill=\"none\" stroke=\"#E7B48F\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"26\" cy=\"18\" r=\"4.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"74\" cy=\"18\" r=\"4.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M22 44 V74 Q50 88 78 74 V44 Z\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"44\" rx=\"28\" ry=\"8.5\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M24 70 L31 64 L38 71 L45 64 L52 71 L59 64 L66 71 L73 64 L76 67\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"3\" stroke-linejoin=\"round\"/><circle cx=\"41\" cy=\"55\" r=\"4.3\" fill=\"#111111\"/><circle cx=\"42.5\" cy=\"53.4\" r=\"1.4\" fill=\"#FFFFFF\"/><circle cx=\"59\" cy=\"55\" r=\"4.3\" fill=\"#111111\"/><circle cx=\"60.5\" cy=\"53.4\" r=\"1.4\" fill=\"#FFFFFF\"/><path d=\"M46 60 Q50 63.6 54 60\" fill=\"none\" stroke=\"#111111\" stroke-width=\"3.5\" stroke-linecap=\"round\"/>"
  },
  {
    "key": "radiola",
    "name": "Radiola",
    "what": "la radio",
    "bg": "#A8DCFF",
    "svg": "<path d=\"M64 30 L78 11\" stroke=\"#111111\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"78\" cy=\"11\" r=\"4\" fill=\"#FF6FB5\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"16\" y=\"29\" width=\"68\" height=\"50\" rx=\"13\" fill=\"#39D98A\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"37\" cy=\"43\" r=\"5\" fill=\"#111111\"/><circle cx=\"38.8\" cy=\"41.1\" r=\"1.6\" fill=\"#FFFFFF\"/><circle cx=\"63\" cy=\"43\" r=\"5\" fill=\"#111111\"/><circle cx=\"64.8\" cy=\"41.1\" r=\"1.6\" fill=\"#FFFFFF\"/><rect x=\"27\" y=\"54\" width=\"46\" height=\"16\" rx=\"8\" fill=\"#FFFFFF\" stroke=\"#111111\" stroke-width=\"4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M36 54 V70 M45 54 V70 M54 54 V70 M63 54 V70\" stroke=\"#111111\" stroke-width=\"2.5\"/><circle cx=\"26\" cy=\"50\" r=\"3\" fill=\"#FF6FB5\" opacity=\"0.75\"/>"
  }
];

export const AVATAR_BY_KEY: Record<string, AvatarDefinition> = Object.fromEntries(AVATARS.map((a) => [a.key, a]));

/** Couleurs proposées pour le rond de l'avatar. */
export const AVATAR_COLORS = ["#FFE14D", "#A8DCFF", "#C9B6FF", "#FF6FB5", "#4D7CFF", "#FF9A3C", "#39D98A", "#FFFFFF"];

export const isAvatarKey = (k: unknown): k is string => typeof k === "string" && k in AVATAR_BY_KEY;
export const isAvatarColor = (c: unknown): c is string => typeof c === "string" && AVATAR_COLORS.includes(c.toUpperCase());

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Avatar à afficher pour un joueur : le sien s'il en a choisi un, sinon tiré de son pseudo. */
export function avatarForPlayer(p: {
  display_name?: string | null;
  avatar_key?: string | null;
  avatar_color?: string | null;
  avatar_extra?: string | null;
}) {
  const h = hash(p.display_name ?? "");
  const key = isAvatarKey(p.avatar_key) ? p.avatar_key : AVATARS[h % AVATARS.length].key;
  const color = isAvatarColor(p.avatar_color)
    ? p.avatar_color.toUpperCase()
    : isAvatarKey(p.avatar_key)
      ? AVATAR_BY_KEY[key].bg
      : AVATAR_COLORS[(h >>> 8) % (AVATAR_COLORS.length - 1)];
  const extra = isAvatarKey(p.avatar_key) && isAvatarExtraKey(p.avatar_extra) ? p.avatar_extra : null;
  return { key, color, extra };
}

export function Avatar({
  avatarKey,
  color,
  extra = null,
  animate = false,
  size = 40,
  className = "",
  title,
}: {
  avatarKey: string;
  color?: string | null;
  /** Effet spécial (voir lib/avatarExtras.ts). */
  extra?: string | null;
  /** Joue l'animation si l'effet "Animé" est équipé (buzz, podium, profil). */
  animate?: boolean;
  size?: number;
  className?: string;
  /** Texte alternatif ; sans titre, l'avatar est décoratif (le nom est affiché à côté). */
  title?: string;
}) {
  const def = AVATAR_BY_KEY[avatarKey] ?? AVATARS[0];
  const animClass = extra === "anime" && animate ? avatarAnimationClass(def.key) : "";
  const overlay = avatarOverlay(def.key, extra);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 overflow-visible ${className}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      <circle cx="50" cy="50" r="46" fill={color ?? def.bg} stroke="#111111" strokeWidth="5" />
      <g
        className={animClass}
        style={{ transformBox: "view-box", transformOrigin: "50px 52px" }}
        dangerouslySetInnerHTML={{ __html: def.svg }}
      />
      {overlay && <g dangerouslySetInnerHTML={{ __html: overlay }} />}
    </svg>
  );
}

/** Raccourci : avatar d'un joueur (choisi, ou tiré de son pseudo). */
export function PlayerAvatar({
  player,
  size = 40,
  animate = false,
  className = "",
}: {
  player: { display_name?: string | null; avatar_key?: string | null; avatar_color?: string | null; avatar_extra?: string | null };
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const { key, color, extra } = avatarForPlayer(player);
  return <Avatar avatarKey={key} color={color} extra={extra} animate={animate} size={size} className={className} />;
}
