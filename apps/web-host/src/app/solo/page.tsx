"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Kazou, type KazouKey } from "../../lib/kazou";
import { DIFFICULTY_LABEL, WORLDS, clipLabel, levelDifficulty, type Difficulty, type LevelDef, type WorldDef } from "../../lib/solo/worlds";
import { starGoals } from "../../lib/solo/engine";
import { currentLevel, emptyProgress, isUnlocked, isWorldUnlocked, loadProgress, totalStars, type SoloProgress } from "../../lib/solo/progress";
import { BossSprite } from "./_components/BossSprite";
import { SoloNav } from "./_components/SoloNav";
import { WorldDecor } from "./_components/WorldDecor";
import { primeAudio } from "./_components/useClipPlayer";
import { IconLock, StarIcon, StarRow } from "./_components/SoloIcons";

// Zigzag des niveaux sur la carte (en % de la largeur), du bas vers le haut.
const XS = [58, 28, 62, 76, 38, 20, 52, 74];
const STEP = 118; // écart vertical entre deux niveaux
const BOSS_Y = 86;

/** Kazou qui accompagne le joueur : jamais de la couleur du fond. */
function guideFor(color: string): KazouKey {
  if (color === "#FFE14D") return "zou";
  if (color === "#C9B6FF") return "kaz";
  return "zazou";
}

/** Position d'un niveau sur la carte (x en %, y en px depuis le haut du chemin). */
function nodePos(world: WorldDef, level: LevelDef) {
  const count = world.levels.filter((l) => !l.boss).length;
  const height = count * STEP + 210;
  if (level.boss) return { x: 50, y: BOSS_Y, height };
  const i = level.index - 1;
  return { x: XS[i % XS.length], y: height - 64 - i * STEP, height };
}

export default function SoloMapPage() {
  const [progress, setProgress] = useState<SoloProgress>(emptyProgress);
  const [worldIndex, setWorldIndex] = useState(0);
  // Animation d'arrivée après un niveau réussi : le Kazou part du niveau
  // terminé (`from`) et avance jusqu'au suivant.
  const [from, setFrom] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Fiche du niveau touché sur la carte (null = fermée).
  const [selected, setSelected] = useState<LevelDef | null>(null);

  useEffect(() => {
    // Progression lue après l'hydratation (localStorage), comme ailleurs dans l'app.
    const p = loadProgress();
    const fromId = new URLSearchParams(window.location.search).get("from");
    const fromLevel = WORLDS.flatMap((w) => w.levels).find((l) => l.id === fromId);
    let index = 0;
    WORLDS.forEach((w, i) => {
      if (isWorldUnlocked(p, w)) index = i;
    });
    if (fromLevel && !fromLevel.boss) index = WORLDS.findIndex((w) => w.id === fromLevel.worldId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(p);
    setWorldIndex(index);
    if (fromLevel && !fromLevel.boss) setFrom(fromLevel.id);
    setLoaded(true);
    if (fromId) window.history.replaceState(null, "", "/solo");
  }, []);

  const world = WORLDS[worldIndex];
  const current = world.playable && isWorldUnlocked(progress, world) ? currentLevel(progress, world) : undefined;

  return (
    <main className="min-h-dvh flex flex-col items-center" style={{ background: world.color }}>
      <div className="w-full max-w-md flex flex-col flex-1 px-4 pt-5 pb-28">
        <header className="flex items-center justify-between gap-2">
          <Link
            href="/"
            aria-label="Retour à l'accueil"
            className="bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm w-11 h-11 flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={3} />
          </Link>
          <div className="flex gap-2">
            <span className="bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm pl-2 pr-3 py-1 font-extrabold text-sm flex items-center gap-1.5">
              <StarIcon size={20} /> {totalStars(progress, world)} / {world.levels.length * 3}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 mt-4">
          <button
            type="button"
            aria-label="Monde précédent"
            disabled={worldIndex === 0}
            onClick={() => {
              setFrom(null);
              setWorldIndex((i) => Math.max(0, i - 1));
            }}
            className="bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm w-10 h-10 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={3} />
          </button>
          <div className="text-center min-w-0 h-[76px] flex flex-col items-center justify-center">
            <p className="text-xs font-extrabold tracking-[0.15em]">MONDE {world.number}</p>
            <h1 className={`font-display leading-[1.05] text-balance ${world.name.length > 16 ? "text-2xl" : "text-3xl"}`}>{world.name}</h1>
          </div>
          <button
            type="button"
            aria-label="Monde suivant"
            disabled={worldIndex === WORLDS.length - 1}
            onClick={() => {
              setFrom(null);
              setWorldIndex((i) => Math.min(WORLDS.length - 1, i + 1));
            }}
            className="bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm w-10 h-10 flex items-center justify-center disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" strokeWidth={3} />
          </button>
        </div>

        {!loaded ? null : world.playable ? (
          <WorldPath key={world.id} world={world} progress={progress} current={current} from={from} onSelect={setSelected} />
        ) : (
          <div className="mt-10 mx-auto bg-inkSurface border-[3px] border-fg rounded-3xl shadow-sticker px-6 py-8 text-center max-w-xs flex flex-col items-center">
            <IconLock size={48} />
            <p className="font-display text-xl mt-3">Bientôt sur la tournée</p>
            <p className="text-sm font-semibold text-inkMuted mt-1">Ce monde arrive dans une prochaine mise à jour.</p>
          </div>
        )}
      </div>

      {selected && <LevelSheet world={world} level={selected} stars={progress.stars[selected.id] ?? 0} best={progress.best[selected.id]} onClose={() => setSelected(null)} />}
      <SoloNav active="tour" />
    </main>
  );
}

function WorldPath({
  world,
  progress,
  current,
  from,
  onSelect,
}: {
  world: WorldDef;
  progress: SoloProgress;
  current?: LevelDef;
  from: string | null;
  onSelect: (l: LevelDef) => void;
}) {
  const levels = world.levels.filter((l) => !l.boss);
  const boss = world.levels.find((l) => l.boss);
  const unlockedWorld = isWorldUnlocked(progress, world);
  const height = levels.length * STEP + 210;
  const guide = guideFor(world.color);
  const fromLevel = from ? world.levels.find((l) => l.id === from) : undefined;

  // Le Kazou démarre sur le niveau terminé puis glisse jusqu'au niveau en cours.
  const [arrived, setArrived] = useState(!fromLevel);
  useEffect(() => {
    if (arrived) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setArrived(true), reduce ? 0 : 450);
    return () => clearTimeout(t);
  }, [arrived]);

  // 15 niveaux : la carte est longue, on la fait défiler jusqu'au niveau en
  // cours (ou jusqu'au niveau terminé, d'où part l'animation).
  const focusId = (fromLevel ?? current)?.id;
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`lvl-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const guideLevel = !arrived && fromLevel ? fromLevel : current;
  const guidePos = guideLevel ? nodePos(world, guideLevel) : null;
  // Le chemin s'arrête sous le médaillon du boss (sans le traverser).
  const points = [...levels.map((l) => nodePos(world, l)), { x: 50, y: BOSS_Y + 60 }];

  return (
    <div className="relative mt-4 w-full" style={{ height }}>
      {!unlockedWorld && (
        <p className="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit bg-inkSurface border-[3px] border-fg rounded-2xl shadow-sticker px-4 py-2 font-extrabold text-sm text-center">
          Bats le boss du monde précédent pour entrer ici.
        </p>
      )}
      <WorldDecor worldId={world.id} nodes={levels.map((l) => nodePos(world, l))} bossY={BOSS_Y} />
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#fff"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray="1 22"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {levels.map((level) => {
        const { x, y } = nodePos(world, level);
        const open = isUnlocked(progress, level);
        const stars = progress.stars[level.id] ?? 0;
        const isCurrent = open && current?.id === level.id;
        const justOpened = isCurrent && !!fromLevel;
        const size = isCurrent ? 76 : 64;
        const node = (
          <span
            className={`relative flex items-center justify-center rounded-full border-4 font-display shadow-sticker ${
              isCurrent ? "text-3xl bg-[#FFE14D] border-fg ring-8 ring-white/60" : open ? "text-2xl bg-white border-fg" : "text-2xl bg-[#E3DDF5] border-[#7F7896] text-[#9B93B5]"
            } ${justOpened && arrived ? "animate-[stickerPop_0.5s_ease-out]" : ""}`}
            style={{ width: size, height: size }}
          >
            {level.index}
            {open && stars > 0 && (
              <span className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                <StarRow count={stars} size={20} />
              </span>
            )}
          </span>
        );
        return (
          <div key={level.id} id={`lvl-${level.id}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: y }}>
            {open ? (
              <button type="button" onClick={() => onSelect(level)} aria-label={`Niveau ${level.index}`} className="block hover:-translate-y-0.5 transition-transform">
                {node}
              </button>
            ) : (
              node
            )}
          </div>
        );
      })}

      {guidePos && (
        <span
          className="absolute pointer-events-none -translate-y-1/2 transition-[left,top] duration-[900ms] ease-in-out"
          style={{ left: `calc(${guidePos.x}% + ${guidePos.x > 60 ? -128 : 42}px)`, top: guidePos.y - 6 }}
          aria-hidden
        >
          <Kazou who={guide} mood={arrived ? "joie" : "buzz"} size={74} />
        </span>
      )}

      {boss?.boss && (
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ top: BOSS_Y }}>
          {(() => {
            const open = isUnlocked(progress, boss);
            const stars = progress.stars[boss.id] ?? 0;
            const inner = (
              <span
                className={`relative flex items-center justify-center w-28 h-28 rounded-full border-[5px] border-fg shadow-sticker ${open ? "" : "grayscale"}`}
                style={{ background: "#fff" }}
              >
                <span className="overflow-hidden rounded-full w-full h-full flex items-center justify-center">
                  <BossSprite boss={boss.boss} size={100} />
                </span>
                {stars > 0 && (
                  <span className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                    <StarRow count={stars} size={22} />
                  </span>
                )}
              </span>
            );
            return (
              <>
                {open ? (
                  <button type="button" onClick={() => onSelect(boss)} aria-label={`Boss : ${boss.boss.name}`}>
                    {inner}
                  </button>
                ) : (
                  inner
                )}
                <span className="mt-4 bg-logo border-[3px] border-fg rounded-full shadow-sticker-sm px-3 py-1 font-extrabold text-xs whitespace-nowrap">
                  BOSS · {boss.boss.name}
                </span>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

const DIFF_COLOR: Record<Difficulty, string> = { 1: "#39D98A", 2: "#FFE14D", 3: "#FF6FB5" };

/** Difficulté en trois barres + libellé (Facile, Moyen, Difficile). */
function DifficultyBadge({ level }: { level: LevelDef }) {
  const d = levelDifficulty(level);
  return (
    <span className="inline-flex items-center gap-2 font-extrabold text-sm">
      <span className="inline-flex items-end gap-[3px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[7px] rounded-sm border-2 border-fg"
            style={{ height: 6 + i * 5, background: i <= d ? DIFF_COLOR[d] : "#fff" }}
          />
        ))}
      </span>
      {DIFFICULTY_LABEL[d]}
    </span>
  );
}

/**
 * Fiche d'un niveau, ouverte en touchant le niveau sur la carte : étoiles
 * (ou « pas encore joué »), difficulté, nombre d'extraits, règles, objectif,
 * et le bouton pour lancer le niveau.
 */
function LevelSheet({
  world,
  level,
  stars,
  best,
  onClose,
}: {
  world: WorldDef;
  level: LevelDef;
  stars: number;
  best?: number;
  onClose: () => void;
}) {
  const goals = starGoals(level.tracks);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={level.boss ? `Boss : ${level.boss.name}` : `Niveau ${level.index}`}>
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-fg/40" />
      <section className="relative w-full max-w-md mx-4 mb-[92px] bg-inkSurface border-4 border-fg rounded-3xl shadow-sticker p-5 animate-[stickerPop_0.25s_ease-out]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="absolute top-3 right-3 w-9 h-9 rounded-full border-[3px] border-fg flex items-center justify-center bg-white"
        >
          <X className="w-4 h-4" strokeWidth={3} />
        </button>
        <p className="text-xs font-extrabold tracking-[0.15em] uppercase">
          Monde {world.number} · {world.name}
        </p>
        <h2 className="font-display text-3xl leading-tight mt-0.5">{level.boss ? `Boss : ${level.boss.name}` : `Niveau ${level.index}`}</h2>

        <div className="mt-3 flex items-center gap-3">
          {stars > 0 ? <StarRow count={stars} size={30} gap={2} /> : <span className="font-bold text-inkMuted">Pas encore joué</span>}
          {stars > 0 && best !== undefined && <span className="font-extrabold text-sm">Record : {best} pts</span>}
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-2">
          <li className="bg-inkSurface3 border-[3px] border-fg rounded-2xl px-3 py-2">
            <p className="text-[11px] font-extrabold tracking-wider uppercase">Difficulté</p>
            <DifficultyBadge level={level} />
          </li>
          <li className="bg-inkSurface3 border-[3px] border-fg rounded-2xl px-3 py-2">
            <p className="text-[11px] font-extrabold tracking-wider uppercase">Extraits</p>
            <p className="font-display text-lg leading-tight">{level.boss ? "Jusqu'au K.-O." : `${level.tracks} à trouver`}</p>
          </li>
          <li className="bg-inkSurface3 border-[3px] border-fg rounded-2xl px-3 py-2">
            <p className="text-[11px] font-extrabold tracking-wider uppercase">Réponse</p>
            <p className="font-extrabold text-sm leading-snug">{level.answer === "choice" ? "4 propositions au choix" : "Titre + artiste à taper"}</p>
          </li>
          <li className="bg-inkSurface3 border-[3px] border-fg rounded-2xl px-3 py-2">
            <p className="text-[11px] font-extrabold tracking-wider uppercase">Écoute</p>
            <p className="font-extrabold text-sm leading-snug">{clipLabel(level.clip)}</p>
          </li>
        </ul>

        <p className="mt-3 text-sm font-bold">
          {level.boss
            ? "Mets-le K.-O. avant de perdre tes 3 cœurs. Une seule aide pour tout le combat."
            : `Objectif : trouver ${goals.need} extraits sur ${level.tracks}.`}
        </p>

        <Link
          href={`/solo/${world.id}/${level.index}`}
          onClick={() => primeAudio()}
          className="mt-4 block text-center bg-fg text-white font-display text-xl rounded-2xl py-3.5 border-4 border-fg active:translate-y-0.5"
        >
          {stars > 0 ? "Rejouer" : level.boss ? "Affronter le boss" : "Jouer"}
        </Link>
      </section>
    </div>
  );
}
