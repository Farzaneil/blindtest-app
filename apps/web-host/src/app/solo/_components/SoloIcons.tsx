/**
 * Icônes du mode solo, dessinées dans la DA du Kazou Band (contour noir
 * épais, aplats de la palette) : menu du bas et bonus. Maquettes validées
 * le 18 nov. 2026.
 */

import type { ReactNode } from "react";

const K = "#111111";
const Y = "#FFE14D";
const S = "#A8DCFF";
const L = "#C9B6FF";
const P = "#FF6FB5";
const O = "#F5A524";

const line = { stroke: K, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

function Svg({ size = 36, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0 overflow-visible">
      {children}
    </svg>
  );
}

export function IconMap({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 10 L14 6 L26 10 L35 6 L35 30 L26 34 L14 30 L5 34 Z" fill={Y} strokeWidth={3} {...line} />
      <path d="M14 6 L14 30 M26 10 L26 34" strokeWidth={2.4} {...line} />
      <path d="M9 26 Q15 18 21 22 T31 14" fill="none" stroke={K} strokeWidth={2.2} strokeDasharray="2 3" strokeLinecap="round" />
      <circle cx={31} cy={13} r={3} fill={P} strokeWidth={2} {...line} />
    </Svg>
  );
}

export function IconCalendar({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x={5} y={8} width={30} height={27} rx={6} fill="#fff" strokeWidth={3} {...line} />
      <path d="M5 14 Q5 8 11 8 L29 8 Q35 8 35 14 L35 17 L5 17 Z" fill={P} strokeWidth={3} {...line} />
      <path d="M13 4 L13 11 M27 4 L27 11" strokeWidth={3} {...line} />
      <path d="M20 20 L22 24.5 L27 25 L23.3 28.2 L24.4 33 L20 30.4 L15.6 33 L16.7 28.2 L13 25 L18 24.5 Z" fill={Y} strokeWidth={2} {...line} />
    </Svg>
  );
}

export function IconTrophy({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 6 L28 6 L28 16 Q28 25 20 25 Q12 25 12 16 Z" fill={Y} strokeWidth={3} {...line} />
      <path d="M12 9 Q5 9 6 15 Q7 20 13 20 M28 9 Q35 9 34 15 Q33 20 27 20" fill="none" strokeWidth={3} {...line} />
      <path d="M17 25 L23 25 L24 30 L16 30 Z" fill={O} strokeWidth={2.6} {...line} />
      <rect x={11} y={30} width={18} height={6} rx={2} fill={L} strokeWidth={3} {...line} />
      <path d="M16 10 L16 15" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

export function IconAvatar({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <g transform="translate(-4 -3) scale(1.12)">
        <path d="M8 20 Q8 14 14 14 L30 13 Q36 13 36 21 Q36 29 30 29 L14 28 Q8 28 8 22 Z" fill={L} strokeWidth={3} {...line} />
        <rect x={17} y={7} width={10} height={6} rx={2} fill={P} strokeWidth={2.4} {...line} />
        <circle cx={19} cy={21} r={1.8} fill={K} />
        <circle cx={26} cy={21} r={1.8} fill={K} />
        <path d="M20.5 24.5 Q22.5 26.3 24.5 24.5" fill="none" strokeWidth={2} {...line} />
      </g>
    </Svg>
  );
}

export function IconClock({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx={20} cy={22} r={13} fill={S} strokeWidth={3} {...line} />
      <circle cx={20} cy={22} r={8.5} fill="#fff" strokeWidth={2} {...line} />
      <path d="M20 22 L20 16.5 M20 22 L24 24" strokeWidth={2.6} {...line} />
      <rect x={16} y={4} width={8} height={5} rx={2} fill={K} />
      <path d="M31 10 L34 7" strokeWidth={3} {...line} />
    </Svg>
  );
}

export function IconBulb({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M20 5 Q31 5 31 16 Q31 22 26 26 L26 29 L14 29 L14 26 Q9 22 9 16 Q9 5 20 5 Z" fill={Y} strokeWidth={3} {...line} />
      <rect x={14} y={29} width={12} height={6} rx={2} fill={L} strokeWidth={2.6} {...line} />
      <path d="M15 15 Q16 10 20 9.5" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <text x={20} y={23} textAnchor="middle" fontFamily="var(--font-dela)" fontSize={10} fill={K}>
        A
      </text>
    </Svg>
  );
}

export function IconReplay({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 20 A12 12 0 1 0 12 11" fill="none" stroke={K} strokeWidth={7} strokeLinecap="round" />
      <path d="M8 20 A12 12 0 1 0 12 11" fill="none" stroke={L} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M6 6 L14 9 L10 15 Z" fill={L} strokeWidth={2.4} {...line} />
      <circle cx={18} cy={26} r={3} fill={P} strokeWidth={2} {...line} />
      <path d="M21 26 L21 15 L26 16.5" fill="none" strokeWidth={2.4} {...line} />
    </Svg>
  );
}

export function IconSkip({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M6 9 L19 20 L6 31 Z" fill={P} strokeWidth={3} {...line} />
      <path d="M18 9 L31 20 L18 31 Z" fill={P} strokeWidth={3} {...line} />
      <rect x={31} y={9} width={4.5} height={22} rx={2} fill={K} />
    </Svg>
  );
}

export function IconLock({ size = 30 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x={8} y={17} width={24} height={18} rx={5} fill="#E3DDF5" stroke="#7F7896" strokeWidth={3} strokeLinejoin="round" />
      <path d="M13 17 L13 12 Q13 5 20 5 Q27 5 27 12 L27 17" fill="none" stroke="#7F7896" strokeWidth={3} strokeLinecap="round" />
      <circle cx={20} cy={26} r={2.6} fill="#7F7896" />
    </Svg>
  );
}

/** Étoile de la DA (aplat jaune, contour noir) ; vide = blanche. */
export function StarIcon({ filled = true, size = 20 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="shrink-0 overflow-visible">
      <path
        d="M20 3.5 L25 14 L36.5 15.4 L28 23.3 L30.3 34.8 L20 29.1 L9.7 34.8 L12 23.3 L3.5 15.4 L15 14 Z"
        fill={filled ? Y : "#fff"}
        stroke={K}
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
      {filled && <path d="M14.5 17.5 L18 17" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />}
    </svg>
  );
}

/** Rangée de 3 étoiles (obtenues + vides). */
export function StarRow({ count, size = 20, gap = -2 }: { count: number; size?: number; gap?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={`${count} étoile${count > 1 ? "s" : ""} sur 3`}>
      {[0, 1, 2].map((i) => (
        <StarIcon key={i} filled={i < count} size={size} />
      ))}
    </span>
  );
}
