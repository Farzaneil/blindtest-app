import type { BossDef } from "../../../lib/solo/worlds";

/**
 * Boss du mode solo : une enceinte à lunettes noires, même DA que les
 * Kazous (contour noir épais, aplats). La couleur, l'accent et le brassard
 * changent d'un boss à l'autre ; en phase 2, des étincelles apparaissent.
 * Les Kazous ne sont jamais des adversaires : ils encouragent le joueur.
 */
export function BossSprite({ boss, size = 160, phase2 = false, hit = false }: { boss: BossDef; size?: number; phase2?: boolean; hit?: boolean }) {
  const K = "#111111";
  const dark = boss.color === "#2B2B33";
  const panel = dark ? "#3A3A46" : "rgba(255,255,255,0.35)";
  const line = { stroke: K, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={boss.name}
      className={`shrink-0 overflow-visible transition-transform duration-150 ${hit ? "scale-95 -rotate-3" : ""}`}
    >
      <rect x={20} y={10} width={60} height={84} rx={12} fill={boss.color} strokeWidth={4} {...line} />
      <rect x={27} y={17} width={46} height={70} rx={7} fill={panel} />
      <circle cx={50} cy={66} r={15} fill={dark ? "#1C1C22" : "#fff"} strokeWidth={3} {...line} />
      <circle cx={50} cy={66} r={7} fill={boss.accent} strokeWidth={2.5} {...line} />
      <circle cx={50} cy={66} r={2.2} fill={K} />
      <path d="M30 34 L70 34 L68 44 Q62 47 55 44 L50 39 L45 44 Q38 47 32 44 Z" fill={K} />
      <path d="M35 37 L41 37 M56 37 L62 37" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <path d={phase2 ? "M30 28 L43 33 M70 28 L57 33" : "M30 30 L42 32 M70 30 L58 32"} strokeWidth={3} {...line} />
      <path
        d={hit ? "M44 52 Q50 48 56 52" : "M43 51 Q50 48 57 51"}
        fill="none"
        stroke={dark ? "#fff" : K}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <rect x={14} y={54} width={12} height={20} rx={6} fill={boss.color} strokeWidth={3} {...line} />
      <rect x={74} y={54} width={12} height={20} rx={6} fill={boss.color} strokeWidth={3} {...line} />
      <rect x={28} y={2} width={44} height={10} rx={3} fill="#FFE14D" strokeWidth={3} {...line} />
      <text x={50} y={10} textAnchor="middle" fontFamily="var(--font-dela)" fontSize={7} fill={K}>
        {boss.badge}
      </text>
      {phase2 && (
        <>
          <path d="M8 14 Q9.3 18.7 14 20 Q9.3 21.3 8 26 Q6.7 21.3 2 20 Q6.7 18.7 8 14 Z" fill="#FFE14D" strokeWidth={2.2} {...line} />
          <path d="M92 8 Q93.1 11.9 97 13 Q93.1 14.1 92 18 Q90.9 14.1 87 13 Q90.9 11.9 92 8 Z" fill="#FFE14D" strokeWidth={2.2} {...line} />
        </>
      )}
    </svg>
  );
}
