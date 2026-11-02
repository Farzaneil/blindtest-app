"use client";

/**
 * Le Kazou Band en scène : les animations de Kaz, Zou et Zazou pendant la
 * partie (maquette validée « Le Kazou Band entre en scène », lot 1).
 *
 * Rappel de la règle (voir lib/kazou.tsx) : les mascottes ANIMENT, elles ne
 * jouent pas. Jamais à la place d'un joueur (scores, podium, avatars) ; à la
 * fin, sur le téléphone, la mascotte reste petite, à côté du résultat.
 * Muettes et silencieuses : aucune bulle, aucun son.
 *
 * - KazouLobby : salle d'attente, chacun bouge à son rythme.
 * - KazouGameIntro : entrée en scène au lancement de la toute première manche.
 * - KazouCeremony : roulement de tambour puis joie, au-dessus du podium (hôte).
 * - KazouRankBadge : petite mascotte à côté de « Tu gagnes ! / Tu finis 3e ».
 * - useKazouCameos : apparitions en bord d'écran pendant la partie (lot 2).
 * - KazouBuzzBuddy : le Kazou du thème posé au bord du buzzer.
 *
 * Les mouvements sont des animations CSS (globals.css, section « Kazou Band
 * en scène »). Si « Réduire les animations » est activé, l'entrée en scène
 * n'est pas jouée et les autres scènes s'affichent figées.
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { KAZOUS, Kazou, type KazouKey, type KazouMood } from "../../lib/kazou";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Un Kazou animable : le <span> porte le déplacement (entrée, sortie), le
 * dessin porte l'humeur et les rebonds, pour que les deux transformations
 * ne s'écrasent pas. `uid` rend uniques les id du dessin (clipPath), sinon
 * deux Kazous identiques sur la page pourraient perdre leurs bandes.
 */
function Actor({
  who,
  mood,
  size,
  outer = "",
  inner = "",
  style,
  innerStyle,
}: {
  who: KazouKey;
  mood: KazouMood;
  size: number;
  outer?: string;
  inner?: string;
  style?: CSSProperties;
  innerStyle?: CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <span className={`inline-block shrink-0 ${outer}`} style={style}>
      <span className={`block ${inner}`} style={innerStyle}>
        <Kazou who={who} mood={mood} size={size} uid={uid} className="block" />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Salle d'attente                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Kaz tape la mesure (bouton enfoncé en rythme), Zou se balance, Zazou
 * flotte et fait une pirouette de temps en temps.
 */
export function KazouLobby({ size = 92 }: { size?: number }) {
  const [tap, setTap] = useState(false);
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const cycle = () => {
      timers.forEach(clearTimeout);
      timers = [];
      for (let beat = 0; beat < 4; beat++) {
        timers.push(setTimeout(() => setTap(true), beat * 300));
        timers.push(setTimeout(() => setTap(false), beat * 300 + 150));
      }
      timers.push(setTimeout(() => setSpin((n) => n + 1), 1700));
    };
    const first = setTimeout(cycle, 1200);
    const every = setInterval(cycle, 4200);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <span className="inline-flex items-center" role="img" aria-label="Kaz, Zou et Zazou, le Kazou Band">
      <Actor who="kaz" mood={tap ? "buzz" : "joie"} size={size} outer="kz-beat" />
      <Actor who="zou" mood="joie" size={size} outer="kz-sway" />
      {/* key : relance la pirouette à chaque cycle, sans couper le flottement. */}
      <span className="inline-block kz-float">
        <Actor key={spin} who="zazou" mood="joie" size={size} inner={spin > 0 ? "kz-spin" : ""} />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Lancement de la partie                                                   */
/* ------------------------------------------------------------------------ */

const INTRO_JUMP_MS = 1400;
const INTRO_EXIT_MS = 2500;
const INTRO_END_MS = 3100;

/**
 * Entrée en scène du trio, une seule fois, quand la toute première manche
 * démarre. `firstRoundId` = id de la manche n° 1 (order_index 0), sinon
 * null : l'animation se joue quand il passe de null à un id. Une page
 * rechargée en pleine partie ne la rejoue donc pas (manche > 1).
 *
 * Calque plein écran SANS interaction (pointer-events: none) : la musique
 * démarre en même temps, un joueur rapide peut buzzer à travers.
 */
export function KazouGameIntro({ firstRoundId }: { firstRoundId: string | null }) {
  const sawNoRound = useRef(firstRoundId === null);
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState<"enter" | "jump" | "exit" | null>(null);

  useEffect(() => {
    if (firstRoundId === null) {
      sawNoRound.current = true;
      return;
    }
    if (!sawNoRound.current || prefersReducedMotion()) return;
    sawNoRound.current = false;
    setRunId((n) => n + 1);
  }, [firstRoundId]);

  useEffect(() => {
    if (runId === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("enter");
    const timers = [
      setTimeout(() => setPhase("jump"), INTRO_JUMP_MS),
      setTimeout(() => setPhase("exit"), INTRO_EXIT_MS),
      setTimeout(() => setPhase(null), INTRO_END_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [runId]);

  if (!phase) return null;
  const jumping = phase === "jump";
  const leaving = phase === "exit";
  const cast: { who: KazouKey; enter: string; tilt: string }[] = [
    { who: "kaz", enter: "kz-drop-in", tilt: "-25deg" },
    { who: "zou", enter: "kz-from-left", tilt: "0deg" },
    { who: "zazou", enter: "kz-from-right", tilt: "25deg" },
  ];

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[60] pointer-events-none flex flex-col items-center justify-center gap-6 overflow-hidden kz-intro ${leaving ? "kz-intro-out" : ""}`}
    >
      <div className="flex items-end">
        {cast.map((c, i) => (
          <Actor
            key={c.who}
            who={c.who}
            mood={jumping ? "buzz" : "joie"}
            size={112}
            outer={leaving ? "kz-exit-up" : c.enter}
            style={leaving ? ({ animationDelay: `${i * 80}ms`, "--kz-tilt": c.tilt } as CSSProperties) : undefined}
            inner={jumping ? "kz-jump" : ""}
            innerStyle={jumping ? { animationDelay: `${i * 90}ms` } : undefined}
          />
        ))}
      </div>
      {phase !== "enter" && (
        <p className="font-display text-5xl text-fg text-center animate-[stampIn_0.5s_cubic-bezier(0.3,1.6,0.5,1)_both]">
          C’est parti !
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Fin de partie                                                            */
/* ------------------------------------------------------------------------ */

/**
 * Au-dessus du podium (écran de l'hôte) : Kaz à gauche fait le roulement de
 * tambour (il tremble, bouton enfoncé), Zou et Zazou à droite trépignent ;
 * à la révélation du gagnant, les trois passent en champion et sautent.
 */
export function KazouCeremony({ revealed, size = 76 }: { revealed: boolean; size?: number }) {
  return (
    <div className="w-full max-w-md flex items-end justify-between px-2" aria-hidden="true">
      <Actor who="kaz" mood={revealed ? "champion" : "buzz"} size={size} inner={revealed ? "kz-cheer" : "kz-drum"} />
      <span className="flex items-end">
        <Actor who="zou" mood={revealed ? "champion" : "joie"} size={size * 0.86} inner={revealed ? "kz-cheer kz-d1" : "kz-lean"} />
        <Actor who="zazou" mood={revealed ? "champion" : "joie"} size={size * 0.86} inner={revealed ? "kz-cheer kz-d2" : "kz-lean kz-d1"} />
      </span>
    </div>
  );
}

/**
 * Petite mascotte à côté du résultat, sur le téléphone de chaque joueur :
 * 1er → Zazou en champion ; dernier → Zou triste qui finit par tirer la
 * langue ; sinon → Kaz qui sautille. Volontairement petite, en marge : ce
 * n'est pas le joueur.
 */
export function KazouRankBadge({ first, last, size = 54 }: { first: boolean; last: boolean; size?: number }) {
  const who: KazouKey = first ? "zazou" : last ? "zou" : "kaz";
  const [cheeredUp, setCheeredUp] = useState(() => who !== "zou" || prefersReducedMotion());

  useEffect(() => {
    if (cheeredUp) return;
    const t = setTimeout(() => setCheeredUp(true), 1900);
    return () => clearTimeout(t);
  }, [cheeredUp]);

  const mood: KazouMood = who === "zazou" ? "champion" : who === "zou" && !cheeredUp ? "triste" : "joie";
  const inner = who === "zazou" ? "kz-cheer kz-late" : who === "kaz" ? "kz-hop" : cheeredUp ? "kz-hop kz-now" : "kz-sag";
  return <Actor who={who} mood={mood} size={size} outer="kz-pop" inner={inner} />;
}

/* ------------------------------------------------------------------------ */
/* Pendant la partie (lot 2)                                                */
/* ------------------------------------------------------------------------ */

/**
 * Règle du lot 2 : l'écran du jeu ne les attend JAMAIS. Le jeu change d'état
 * comme avant ; la mascotte passe en même temps, en petit, depuis un bord
 * de l'écran (calque fixe, pointer-events: none), puis repart. Rien ne
 * dépend de la fin d'une animation.
 */
export type CameoKind = "round" | "last" | "joker" | "correct" | "late" | "wrong" | "nobody" | "streak" | "lockout";

type Side = "left" | "right" | "bottom-left" | "bottom-right" | "bottom";
type CameoDef = {
  cast: { who: KazouKey; mood: KazouMood; x?: string; delayMs?: number }[];
  side: Side;
  /** Hauteur (bords gauche/droit), en % de l'écran. */
  top?: string;
  /** Geste joué une fois la tête sortie (classe sur le dessin). */
  act: string;
  size: number;
  ms: number;
  extra?: "x2" | "drop";
};

const CAMEOS: Record<CameoKind, CameoDef> = {
  round: { cast: [{ who: "kaz", mood: "joie" }], side: "bottom-left", act: "kz-act-nod", size: 66, ms: 1500 },
  last: { cast: [{ who: "kaz", mood: "buzz" }], side: "bottom-left", act: "kz-act-hop", size: 66, ms: 1500 },
  joker: { cast: [{ who: "zou", mood: "joie" }], side: "right", top: "26%", act: "kz-act-wiggle", size: 70, ms: 1600, extra: "x2" },
  correct: { cast: [{ who: "zazou", mood: "joie" }], side: "bottom-right", act: "kz-act-twirl", size: 68, ms: 1500 },
  late: { cast: [{ who: "zou", mood: "triste" }], side: "left", top: "38%", act: "kz-act-sag", size: 68, ms: 1800, extra: "drop" },
  wrong: { cast: [{ who: "zou", mood: "triste" }], side: "left", top: "38%", act: "kz-act-sag", size: 68, ms: 1800, extra: "drop" },
  nobody: {
    cast: [
      { who: "kaz", mood: "triste", x: "calc(50% - 92px)" },
      { who: "zou", mood: "triste", x: "calc(50% - 28px)", delayMs: 120 },
      { who: "zazou", mood: "triste", x: "calc(50% + 36px)", delayMs: 240 },
    ],
    side: "bottom",
    act: "kz-act-sigh",
    size: 56,
    ms: 2000,
  },
  streak: { cast: [{ who: "zazou", mood: "champion" }], side: "right", top: "16%", act: "kz-act-vibe", size: 64, ms: 1500 },
  lockout: { cast: [{ who: "zou", mood: "joie" }], side: "right", top: "40%", act: "kz-act-nono", size: 70, ms: 1700 },
};

/**
 * File des apparitions : une à la fois, deux en attente au plus (les
 * suivantes sont ignorées plutôt que d'arriver en retard). `replace`
 * interrompt l'apparition en cours (malus série, qui doit coller au délai).
 */
export function useKazouCameos() {
  const [current, setCurrent] = useState<{ id: number; kind: CameoKind } | null>(null);
  const queue = useRef<CameoKind[]>([]);
  const nextId = useRef(1);
  const busy = useRef(false);

  const push = useCallback((kind: CameoKind, opts?: { replace?: boolean }) => {
    if (prefersReducedMotion()) return;
    const item = { id: nextId.current++, kind };
    if (!busy.current || opts?.replace) {
      busy.current = true;
      if (opts?.replace) queue.current = [];
      setCurrent(item);
    } else if (queue.current.length < 2 && !queue.current.includes(kind)) {
      queue.current.push(kind);
    }
  }, []);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      const next = queue.current.shift();
      if (next) {
        setCurrent({ id: nextId.current++, kind: next });
      } else {
        busy.current = false;
        setCurrent(null);
      }
    }, CAMEOS[current.kind].ms + 60);
    return () => clearTimeout(t);
  }, [current]);

  const node = current ? <KazouCameo key={current.id} kind={current.kind} /> : null;
  return { push, node };
}

function KazouCameo({ kind }: { kind: CameoKind }) {
  const def = CAMEOS[kind];
  return (
    <div aria-hidden="true" className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {def.cast.map((c) => (
        <span
          key={c.who}
          className={`kz-peek kz-peek-${def.side}`}
          style={
            {
              "--kz-ms": `${def.ms}ms`,
              animationDelay: `${c.delayMs ?? 0}ms`,
              ...(def.top ? { top: def.top } : {}),
              ...(c.x ? { left: c.x } : {}),
            } as CSSProperties
          }
        >
          {def.extra === "x2" && (
            <span className="kz-extra-x2 absolute -top-7 left-1">
              <svg width="30" height="30" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="17" fill="#FFE14D" stroke="#111111" strokeWidth="3.5" />
                <g transform="translate(8 8)" fill="none" stroke="#111111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l6 6M9 9l-6 6" />
                  <path d="M13.5 9.5a3.5 3.5 0 0 1 7 0c0 2.6-7 4.6-7 8.5h7" />
                </g>
              </svg>
            </span>
          )}
          {def.extra === "drop" && (
            <span className="kz-extra-drop absolute" style={{ left: "62%", top: "14%" }}>
              <svg width="11" height="15" viewBox="0 0 12 16">
                <path d="M6 1 C10 7 10 11 6 13.5 C2 11 2 7 6 1Z" fill="#A8DCFF" stroke="#111111" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
          )}
          <Actor who={c.who} mood={c.mood} size={def.size} inner={def.act} innerStyle={{ animationDelay: `${300 + (c.delayMs ?? 0)}ms` }} />
        </span>
      ))}
    </div>
  );
}

/**
 * Le Kazou du thème, posé au bord du buzzer : il s'écrase en même temps que
 * le bouton (`pressKey` change à chaque appui) et garde l'humeur « buzz »
 * tant que `pressed`. Positionné en absolu : ne décale rien.
 */
export function KazouBuzzBuddy({ pressed, pressKey, size = 58 }: { pressed: boolean; pressKey: number; size?: number }) {
  return (
    <span aria-hidden="true" className="absolute -right-11 -top-3 pointer-events-none -rotate-12">
      {KAZOUS.map((k) => (
        <span key={k.key} className={`kazou-fond kazou-fond-${k.theme}`}>
          <Actor key={pressKey} who={k.key} mood={pressed ? "buzz" : "joie"} size={size} inner={pressKey > 0 ? "kz-squash" : ""} />
        </span>
      ))}
    </span>
  );
}
