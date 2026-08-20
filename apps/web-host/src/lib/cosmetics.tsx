import type { ReactNode } from "react";

/**
 * Catalogue des cosmétiques de buzzer — phase 4 du plan décrit dans
 * cadrage_comptes_recompenses_rgpd.md (section 5.5). Comme pour les badges
 * (voir badges.ts), les DÉFINITIONS (libellés, couleurs/dégradés, icônes,
 * conditions de déblocage) vivent dans le CODE, jamais en base — seuls le
 * déblocage et l'équipement sont persistés (voir player_cosmetics, migration
 * 0022, alimentée par award_cosmetic_unlocks() côté SQL).
 *
 * Visuels repris fidèlement de la maquette validée
 * (maquette_comptes_espace_joueur.html, section "Skin du buzzer") : mêmes
 * couleurs, mêmes dégradés, mêmes icônes SVG. Les conditions de déblocage
 * ci-dessous sont dupliquées dans award_cosmetic_unlocks() (voir
 * supabase/migrations/0022_cosmetics.sql) — à garder synchronisées.
 */

export type CosmeticCategory = "uni" | "nature" | "cosmique" | "slay";

export type CosmeticUnlockCondition =
  | { type: "always" } // Uni, couleurs de base — dispo dès le départ, sans condition.
  | { type: "first_badge_tier"; tier: "bronze" | "argent" | "or" } // Uni, teintes de palier.
  | { type: "level"; level: number } // Cosmique (certains motifs) + tout le set Slay.
  | { type: "level_and_badge_or"; level: number; badgeKey: string }; // Nature (tous) + 2 motifs Cosmique.

export type CosmeticDefinition = {
  key: string;
  category: CosmeticCategory;
  label: string;
  /** Fond CSS du bouton (couleur pleine ou dégradé) — repris de la maquette. */
  swatch: string;
  /** Couleur unique représentative (anneau du buzzer sur /play, textes...). */
  accentColor: string;
  /** Contraste du texte de statut ("BUZZ"...) une fois ce skin appliqué au buzzer. */
  textOn: "dark" | "light";
  /** Icône de fond optionnelle (filigrane sur le gros buzzer de /play) — Nature/Cosmique seulement. */
  icon?: (props: { size: number }) => ReactNode;
  unlock: CosmeticUnlockCondition;
  unlockHint: string;
};

function pawIcon({ size, fill }: { size: number; fill: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <ellipse cx="12" cy="16" rx="5.2" ry="4.2" />
      <ellipse cx="5.6" cy="9.3" rx="2.1" ry="2.7" />
      <ellipse cx="10.3" cy="6.6" rx="2.1" ry="2.7" />
      <ellipse cx="14.7" cy="6.6" rx="2.1" ry="2.7" />
      <ellipse cx="18.4" cy="9.3" rx="2.1" ry="2.7" />
    </svg>
  );
}

export const COSMETIC_DEFINITIONS: CosmeticDefinition[] = [
  // === Uni — couleurs de base, dès le départ, sans condition ================
  { key: "uni_sage", category: "uni", label: "Sage", swatch: "#3ECF7E", accentColor: "#3ECF7E", textOn: "dark", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_bleu", category: "uni", label: "Bleu", swatch: "#6E93D6", accentColor: "#6E93D6", textOn: "dark", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_magenta", category: "uni", label: "Magenta", swatch: "#E24B9E", accentColor: "#E24B9E", textOn: "light", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_violet", category: "uni", label: "Violet", swatch: "#8B5CF6", accentColor: "#8B5CF6", textOn: "light", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_orange", category: "uni", label: "Orange", swatch: "#F5A524", accentColor: "#F5A524", textOn: "dark", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_turquoise", category: "uni", label: "Turquoise", swatch: "#2FB8B0", accentColor: "#2FB8B0", textOn: "dark", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_rouge", category: "uni", label: "Rouge", swatch: "#E2574B", accentColor: "#E2574B", textOn: "light", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },
  { key: "uni_jaune", category: "uni", label: "Jaune", swatch: "#F5E24B", accentColor: "#F5E24B", textOn: "dark", unlock: { type: "always" }, unlockHint: "Disponible dès le départ." },

  // === Uni — teintes de palier, liées aux badges tous confondus ==============
  { key: "uni_bronze", category: "uni", label: "Bronze", swatch: "#C97B4A", accentColor: "#C97B4A", textOn: "dark", unlock: { type: "first_badge_tier", tier: "bronze" }, unlockHint: "Dès ton premier badge bronze obtenu, toutes catégories confondues." },
  { key: "uni_argent", category: "uni", label: "Argent", swatch: "#C7CBD1", accentColor: "#C7CBD1", textOn: "dark", unlock: { type: "first_badge_tier", tier: "argent" }, unlockHint: "Dès ton premier badge argent obtenu, toutes catégories confondues." },
  { key: "uni_or", category: "uni", label: "Or", swatch: "#F5A524", accentColor: "#F5A524", textOn: "dark", unlock: { type: "first_badge_tier", tier: "or" }, unlockHint: "Dès ton premier badge or obtenu, toutes catégories confondues." },

  // === Nature — verrouillée avant Niveau 5, puis 1 motif par badge OR ========
  {
    key: "nature_tigre", category: "nature", label: "Tigre",
    swatch: "linear-gradient(145deg,#FFB44D 0%,#E8622C 55%,#7A2A0A 100%)", accentColor: "#E8622C", textOn: "light",
    icon: ({ size }) => pawIcon({ size, fill: "white" }),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "eclair" },
    unlockHint: "Niveau 5 + palier or du badge Éclair.",
  },
  {
    key: "nature_leopard", category: "nature", label: "Léopard",
    swatch: "linear-gradient(145deg,#F0C878 0%,#C99A3E 55%,#7A5A1E 100%)", accentColor: "#C99A3E", textOn: "dark",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <g fill="white">
          <ellipse cx="12" cy="16" rx="5.2" ry="4.2" />
          <ellipse cx="5.6" cy="9.3" rx="2.1" ry="2.7" />
          <ellipse cx="10.3" cy="6.6" rx="2.1" ry="2.7" />
          <ellipse cx="14.7" cy="6.6" rx="2.1" ry="2.7" />
          <ellipse cx="18.4" cy="9.3" rx="2.1" ry="2.7" />
        </g>
        <g fill="none" stroke="#3A2410" strokeWidth="1.4">
          <circle cx="6" cy="5" r="1.3" />
          <circle cx="18" cy="6" r="1.1" />
          <circle cx="20" cy="15" r="1.2" />
          <circle cx="4" cy="16" r="1" />
        </g>
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "sans_faute" },
    unlockHint: "Niveau 5 + palier or du badge Sans-faute.",
  },
  {
    key: "nature_vache", category: "nature", label: "Vache",
    swatch: "linear-gradient(145deg,#FFFFFF 0%,#F2F2F2 55%,#C7C7C7 100%)", accentColor: "#C7C7C7", textOn: "dark",
    icon: ({ size }) => pawIcon({ size, fill: "#1A1A1A" }),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "increvable" },
    unlockHint: "Niveau 5 + palier or du badge Increvable.",
  },
  {
    key: "nature_zebre", category: "nature", label: "Zèbre",
    swatch: "linear-gradient(145deg,#4A4A4A 0%,#1A1A1A 60%,#000 100%)", accentColor: "#4A4A4A", textOn: "light",
    icon: ({ size }) => pawIcon({ size, fill: "white" }),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "sociable" },
    unlockHint: "Niveau 5 + palier or du badge Sociable.",
  },
  {
    key: "nature_serpent", category: "nature", label: "Serpent",
    swatch: "linear-gradient(145deg,#5CC489 0%,#2E8B57 55%,#0F4A2E 100%)", accentColor: "#2E8B57", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 19c0-3 5-3 5-6.5S6 9 6 5.5" />
        <circle cx="6" cy="4.5" r="1.4" fill="white" stroke="none" />
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "sang_froid" },
    unlockHint: "Niveau 5 + palier or du badge Sang-froid.",
  },
  {
    key: "nature_feuillage", category: "nature", label: "Feuillage",
    swatch: "linear-gradient(145deg,#6FBF6A 0%,#2F6B3A 55%,#153A1C 100%)", accentColor: "#2F6B3A", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path fill="white" d="M12 3c-5 2-8 6-8 11a8 8 0 0016 0c0-5-3-9-8-11z" />
        <path fill="none" stroke="#2F6B3A" strokeWidth="1.1" d="M12 5v14" />
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "fidele" },
    unlockHint: "Niveau 5 + palier or du badge Fidèle.",
  },
  {
    key: "nature_floral", category: "nature", label: "Floral",
    swatch: "linear-gradient(145deg,#FFB4C6 0%,#D6497A 55%,#7A1F42 100%)", accentColor: "#D6497A", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <g fill="white">
          <circle cx="12" cy="6.5" r="3.1" />
          <circle cx="12" cy="17.5" r="3.1" />
          <circle cx="6.5" cy="12" r="3.1" />
          <circle cx="17.5" cy="12" r="3.1" />
        </g>
        <circle cx="12" cy="12" r="3" fill="#FFD84D" />
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "bonne_oreille" },
    unlockHint: "Niveau 5 + palier or du badge Bonne oreille.",
  },

  // === Cosmique — verrouillée avant Niveau 5, puis niveau ou badge rare ======
  {
    key: "cosmique_galaxie", category: "cosmique", label: "Galaxie",
    swatch: "radial-gradient(circle at 35% 30%,#C77DFF 0%,#6B3FA0 40%,#2A1750 80%,#0F0821 100%)", accentColor: "#6B3FA0", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 12c2.5-2 2-5-.5-5.8S6.6 7.6 7.4 11 11 15.8 14 15c2.6-.7 3.4-4 2-6" />
        <g fill="white" stroke="none">
          <circle cx="5" cy="6" r="0.9" />
          <circle cx="19" cy="8" r="0.7" />
          <circle cx="18" cy="18" r="0.9" />
          <circle cx="5" cy="18" r="0.7" />
        </g>
      </svg>
    ),
    unlock: { type: "level", level: 15 },
    unlockHint: "Débloqué au Niveau 15.",
  },
  {
    key: "cosmique_voie_lactee", category: "cosmique", label: "Voie lactée",
    swatch: "linear-gradient(120deg,#0A0A20 0%,#2C2A6E 45%,#7B8FE8 55%,#2C2A6E 65%,#0A0A20 100%)", accentColor: "#2C2A6E", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="white">
        <path d="M16 4a8 8 0 100 16 6.4 6.4 0 010-16z" />
        <path d="M6 6l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2z" />
        <circle cx="5" cy="17" r="0.9" />
      </svg>
    ),
    unlock: { type: "level", level: 18 },
    unlockHint: "Débloqué au Niveau 18.",
  },
  {
    key: "cosmique_planete", category: "cosmique", label: "Planète",
    swatch: "linear-gradient(140deg,#F5CD79 0%,#D68A2E 50%,#7A3F0F 100%)", accentColor: "#D68A2E", textOn: "dark",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="5.4" fill="white" />
        <ellipse cx="12" cy="12" rx="10.2" ry="3" fill="none" stroke="white" strokeWidth="1.7" transform="rotate(-18 12 12)" />
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "invincible" },
    unlockHint: "Niveau 5 + palier or du badge Invincible.",
  },
  {
    key: "cosmique_aurore", category: "cosmique", label: "Aurore",
    swatch: "linear-gradient(125deg,#062020 0%,#0FBE7A 35%,#3ECFCF 55%,#8B5CF6 80%,#1B0F3A 100%)", accentColor: "#0FBE7A", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
        <path d="M2 15c4-6 6 2 10-3s6 3 10-2" stroke="#3ECF7E" />
        <path d="M2 11c4-6 6 2 10-3s6 3 10-2" stroke="#8B5CF6" opacity=".85" />
      </svg>
    ),
    unlock: { type: "level", level: 20 },
    unlockHint: "Débloqué au Niveau 20.",
  },
  {
    key: "cosmique_fusee", category: "cosmique", label: "Fusée",
    swatch: "linear-gradient(160deg,#FFD84D 0%,#FF7A3C 40%,#B5391F 75%,#5A150A 100%)", accentColor: "#FF7A3C", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path fill="white" d="M12 2c3 3 4 7.5 3 12.5l-3 3-3-3C8 9.5 9 5 12 2z" />
        <path fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" d="M9 14.5l-3 5M15 14.5l3 5" />
        <circle cx="12" cy="9" r="1.6" fill="#5A150A" />
      </svg>
    ),
    unlock: { type: "level_and_badge_or", level: 5, badgeKey: "maitre_du_jeu" },
    unlockHint: "Niveau 5 + palier or du badge Maître du jeu.",
  },
  {
    key: "cosmique_comete", category: "cosmique", label: "Comète",
    swatch: "linear-gradient(135deg,#0A0F2E 0%,#2A4A8C 45%,#8FD6FF 80%,#FFFFFF 100%)", accentColor: "#2A4A8C", textOn: "light",
    icon: ({ size }) => (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <g fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" opacity=".75">
          <path d="M14 9L4 19" />
          <path d="M12 6L3 15" />
          <path d="M16 12l-8 8" />
        </g>
        <circle cx="16" cy="8" r="3.6" fill="white" />
      </svg>
    ),
    unlock: { type: "level", level: 12 },
    unlockHint: "Débloqué au Niveau 12.",
  },

  // === Slay — drapeaux, verrouillés avant Niveau 5 puis tout le set d'un coup =
  { key: "slay_pride", category: "slay", label: "Pride", swatch: "linear-gradient(180deg,#E50000 0% 16.66%,#FF8C00 16.66% 33.33%,#FFED00 33.33% 50%,#008026 50% 66.66%,#004DFF 66.66% 83.33%,#732982 83.33% 100%)", accentColor: "#FF8C00", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_gay", category: "slay", label: "Gay", swatch: "linear-gradient(180deg,#078D70 0% 14.3%,#26CEAA 14.3% 28.6%,#98E8C1 28.6% 42.9%,#FFFFFF 42.9% 57.1%,#7BADE2 57.1% 71.4%,#5049CC 71.4% 85.7%,#3D1A78 85.7% 100%)", accentColor: "#26CEAA", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_bi", category: "slay", label: "Bisexuel·le", swatch: "linear-gradient(180deg,#D60270 0% 40%,#9B4F96 40% 60%,#0038A8 60% 100%)", accentColor: "#9B4F96", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_trans", category: "slay", label: "Trans", swatch: "linear-gradient(180deg,#5BCEFA 0% 20%,#F5A9B8 20% 40%,#fff 40% 60%,#F5A9B8 60% 80%,#5BCEFA 80% 100%)", accentColor: "#5BCEFA", textOn: "dark", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_nonbinaire", category: "slay", label: "Non-binaire", swatch: "linear-gradient(180deg,#FCF434 0% 25%,#fff 25% 50%,#9C59D1 50% 75%,#2C2C2C 75% 100%)", accentColor: "#9C59D1", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_lesbienne", category: "slay", label: "Lesbienne", swatch: "linear-gradient(180deg,#D62900 0% 20%,#FF9B55 20% 40%,#fff 40% 60%,#D461A6 60% 80%,#A50062 80% 100%)", accentColor: "#D461A6", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_pan", category: "slay", label: "Pansexuel·le", swatch: "linear-gradient(180deg,#FF218C 0% 33.3%,#FFD800 33.3% 66.6%,#21B1FF 66.6% 100%)", accentColor: "#FF218C", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
  { key: "slay_ace", category: "slay", label: "Asexuel·le", swatch: "linear-gradient(180deg,#000 0% 25%,#A4A4A4 25% 50%,#fff 50% 75%,#810081 75% 100%)", accentColor: "#A4A4A4", textOn: "light", unlock: { type: "level", level: 5 }, unlockHint: "Débloqué au Niveau 5, avec tout le set Slay." },
];

export const COSMETIC_BY_KEY: Record<string, CosmeticDefinition> = Object.fromEntries(
  COSMETIC_DEFINITIONS.map((c) => [c.key, c])
);

export const DEFAULT_COSMETIC_KEY = "uni_sage";

export const COSMETIC_CATEGORY_LABEL: Record<CosmeticCategory, string> = {
  uni: "Uni",
  nature: "Nature",
  cosmique: "Cosmique",
  slay: "Slay",
};
