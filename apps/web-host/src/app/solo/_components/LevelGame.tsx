"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Play, X } from "lucide-react";
import { Kazou } from "../../../lib/kazou";
import { getDeezerPreview } from "../../../lib/deezer";
import { getWorld, clipLabel, type LevelDef, type WorldDef } from "../../../lib/solo/worlds";
import {
  BOSS_HEARTS,
  BOSS_HP,
  bossDamage,
  bossStars,
  choicesFor,
  drawTracks,
  starGoals,
  starsFor,
  trackPoints,
  type Choice,
  type PoolTrack,
} from "../../../lib/solo/engine";
import { artistMatches, cleanTitle, titleMatches } from "../../../lib/solo/match";
import { emptyProgress, isUnlocked, loadProgress, recordResult, saveProgress, spendBooster, type BoosterKey, type SoloProgress } from "../../../lib/solo/progress";
import { BossSprite } from "./BossSprite";
import { IconBulb, IconClock, IconReplay, IconSkip, StarIcon, StarRow } from "./SoloIcons";

const StarIconSmall = () => <StarIcon size={18} />;
import { AnswerInput } from "./AnswerInput";
import { useClipPlayer } from "./useClipPlayer";

type Phase = "loading" | "ready" | "playing" | "reveal" | "done" | "error" | "locked";
type Outcome = { track: PoolTrack; found: boolean; points: number };

const REVEAL_MS = 1800;

/** Ajoute aux artistes connus ceux que Deezer renvoie pour le morceau (sans doublon). */
function mergeArtists(known: string, fromDeezer: string | null): string {
  const names = [...known.split(","), ...(fromDeezer ?? "").split(",")].map((n) => n.trim()).filter(Boolean);
  const seen = new Set<string>();
  return names.filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true))).join(", ");
}

export function LevelGame({ worldId, levelIndex }: { worldId: string; levelIndex: number }) {
  // « Rejouer » remonte le jeu sans recharger la page (le son reste débloqué).
  const [attempt, setAttempt] = useState(0);
  const world = getWorld(worldId);
  const level = world?.levels.find((l) => l.index === levelIndex);
  if (!world || !level || !world.playable) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-page p-6 text-center">
        <p className="font-display text-2xl">Ce niveau n&apos;existe pas (encore).</p>
        <Link href="/solo" className="bg-inkSurface border-[3px] border-fg rounded-xl shadow-sticker-sm px-5 py-3 font-display">
          Retour à la carte
        </Link>
      </main>
    );
  }
  return <Game key={`${level.id}-${attempt}`} world={world} level={level} onReplay={() => setAttempt((a) => a + 1)} />;
}

function Game({ world, level, onReplay }: { world: WorldDef; level: LevelDef; onReplay: () => void }) {
  const boss = level.boss;
  const player = useClipPlayer();
  const [progress, setProgress] = useState<SoloProgress>(emptyProgress);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<PoolTrack[]>([]);
  const [tracks, setTracks] = useState<PoolTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [timeLeft, setTimeLeft] = useState(level.answerSeconds);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [titleOk, setTitleOk] = useState(false);
  const [artistOk, setArtistOk] = useState(false);
  const [hint, setHint] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set()); // 50/50 des niveaux à choix
  const [picked, setPicked] = useState<number | null>(null);
  const [hp, setHp] = useState(BOSS_HP);
  const [hearts, setHearts] = useState(BOSS_HEARTS);
  const [bossBoosterUsed, setBossBoosterUsed] = useState(false);
  const [hit, setHit] = useState(false);
  const [gained, setGained] = useState<BoosterKey[]>([]);
  const [result, setResult] = useState<{ stars: 0 | 1 | 2 | 3; points: number; won: boolean } | null>(null);
  const urlCache = useRef<Map<string, { preview: string; artist: string | null }>>(new Map());
  const deadline = useRef<number>(0);
  const hpRef = useRef(BOSS_HP);
  const currentUrl = useRef<{ url: string; clip: typeof level.clip } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const advanceRef = useRef<(() => void) | null>(null);
  const [waiting, setWaiting] = useState(false);
  const finishing = useRef(false);

  const phase2 = !!boss && hp <= BOSS_HP / 2;
  const clip = boss && phase2 ? boss.phase2Clip : level.clip;
  const answerSeconds = boss && phase2 ? boss.phase2AnswerSeconds : level.answerSeconds;
  const track = tracks[index];
  const points = outcomes.reduce((s, o) => s + o.points, 0);

  // ------------------------------------------------------------ chargement
  useEffect(() => {
    // Progression lue après l'hydratation (localStorage), comme ailleurs dans l'app.
    const p = loadProgress();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProgress(p);
    if (!isUnlocked(p, level)) {
      setPhase("locked");
      return;
    }
    let cancelled = false;
    fetch(`/api/solo/pool/${world.id}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { tracks?: PoolTrack[]; error?: string };
        if (!res.ok || !data.tracks) throw new Error(data.error ?? "La tournée ne répond pas, réessaie.");
        return data.tracks;
      })
      .then((t) => {
        if (cancelled) return;
        setPool(t);
        setTracks(drawTracks(t, level, new Set(p.recent[level.id] ?? []), new Set(p.found[world.id] ?? [])));
        setPhase("ready");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [level, world.id]);

  // URL fraîche de l'extrait + TOUS les artistes du morceau (featurings,
  // duos : la liste d'une playlist Deezer ne donne que l'artiste principal).
  const previewFor = useCallback(async (t: PoolTrack) => {
    const cached = urlCache.current.get(t.id);
    if (cached) return cached;
    const data = await getDeezerPreview(`deezer:${t.id}`);
    urlCache.current.set(t.id, data);
    return data;
  }, []);

  // ------------------------------------------------------------- un morceau
  const startTrack = useCallback(
    async (i: number, list: PoolTrack[]) => {
      if (!list[i]) return;
      // Phase 2 du boss : extrait et temps raccourcis dès le morceau suivant.
      const inPhase2 = !!boss && hpRef.current <= BOSS_HP / 2;
      const c = boss && inPhase2 ? boss.phase2Clip : level.clip;
      const secs = boss && inPhase2 ? boss.phase2AnswerSeconds : level.answerSeconds;
      finishing.current = false;
      setWaiting(false);
      setTitle("");
      setArtist("");
      setTitleOk(false);
      setArtistOk(false);
      setHint(false);
      setHidden(new Set());
      setPicked(null);
      // Extrait indisponible (droits selon le pays…) : on le remplace par un
      // autre morceau de la réserve, jusqu'à 3 fois.
      let list2 = list;
      let url: string | null = null;
      for (let attempt = 0; attempt < 3 && !url; attempt++) {
        try {
          const data = await previewFor(list2[i]);
          url = data.preview;
          const merged = mergeArtists(list2[i].artist, data.artist);
          if (merged !== list2[i].artist) list2 = list2.map((x, k) => (k === i ? { ...x, artist: merged } : x));
        } catch {
          const used = new Set(list2.map((x) => x.id));
          const spare = pool.find((x) => !used.has(x.id) && level.tiers.includes(x.tier)) ?? pool.find((x) => !used.has(x.id));
          if (!spare) break;
          list2 = list2.map((x, k) => (k === i ? spare : x));
        }
      }
      if (list2 !== list) setTracks(list2);
      setTimeLeft(secs);
      deadline.current = Date.now() + secs * 1000;
      setPhase("playing");
      if (url) {
        currentUrl.current = { url, clip: c };
        // Navigateur qui bloque le son sans geste (Safari après un rechargement) :
        // le bouton lecture le relance, sans consommer de bonus.
        player.playClip(url, c).then(
          () => setBlocked(false),
          () => setBlocked(true)
        );
      }
      // Préchargement du morceau suivant.
      const n = list2[i + 1];
      if (n) previewFor(n).catch(() => {});
    },
    [boss, level.answerSeconds, level.clip, level.tiers, player, pool, previewFor]
  );

  // Lancement direct dès que les morceaux sont prêts (le clic sur « Jouer »
  // de la carte a déjà débloqué le son, voir useClipPlayer.primeAudio).
  const started = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || started.current) return;
    started.current = true;
    const t = setTimeout(() => void startTrack(0, tracks), 0);
    return () => clearTimeout(t);
  }, [phase, startTrack, tracks]);

  const unblock = () => {
    const cur = currentUrl.current;
    if (!cur) return;
    player.prime();
    player.playClip(cur.url, cur.clip).then(
      () => setBlocked(false),
      () => setBlocked(true)
    );
  };

  // ------------------------------------------------------------- fin d'un morceau
  const finishTrack = useCallback(
    // `partial` (boss seulement) : titre OU artiste trouvé → demi-dégâts, aucun cœur perdu.
    (found: boolean, skipped = false, partial = false) => {
      if (!track || finishing.current) return;
      finishing.current = true;
      player.stop();
      const left = Math.max(0, (deadline.current - Date.now()) / 1000);
      const pts = trackPoints(found, left, answerSeconds);
      const nextOutcomes = [...outcomes, { track, found, points: pts }];
      setOutcomes(nextOutcomes);
      let nextHp = hp;
      let nextHearts = hearts;
      if (boss) {
        if (found || partial) {
          const dmg = bossDamage(left, answerSeconds);
          nextHp = Math.max(0, hp - (found ? dmg : Math.round(dmg / 2)));
          hpRef.current = nextHp;
          setHp(nextHp);
          setHit(true);
          setTimeout(() => setHit(false), 350);
        } else if (!skipped) {
          nextHearts = hearts - 1;
          setHearts(nextHearts);
        }
      }
      setPhase("reveal");
      const advance = () => {
        advanceRef.current = null;
        player.stop();
        // Boss : pas de limite de morceaux, le combat dure jusqu'au K.-O. ou
        // jusqu'au dernier cœur perdu.
        const last = !boss && index + 1 >= tracks.length;
        const bossOver = !!boss && (nextHp <= 0 || nextHearts <= 0);
        if (last || bossOver) {
          const foundIds = nextOutcomes.filter((o) => o.found).map((o) => o.track.id);
          const total = nextOutcomes.reduce((s, o) => s + o.points, 0);
          const won = boss ? nextHp <= 0 : true;
          const stars = boss ? (won ? bossStars(nextHearts) : 0) : starsFor(foundIds.length, total, tracks.length);
          const current = loadProgress();
          const rec = recordResult(current, level, { stars, points: total, played: tracks.map((t) => t.id), found: foundIds });
          saveProgress(rec.progress);
          setProgress(rec.progress);
          setGained(rec.gained);
          setResult({ stars, points: total, won: boss ? won : stars > 0 });
          setPhase("done");
          return;
        }
        let list = tracks;
        if (boss && index + 1 >= tracks.length) {
          // Plus de morceaux tirés : on en reprend dans la réserve, sans redite.
          const used = new Set(tracks.map((t) => t.id));
          let more = drawTracks(pool, level, used, new Set());
          more = more.filter((t) => !used.has(t.id));
          if (more.length === 0) more = drawTracks(pool, level, new Set(), new Set());
          list = [...tracks, ...more];
          setTracks(list);
        }
        setIndex(index + 1);
        void startTrack(index + 1, list);
      };
      if (found) {
        // Bonne réponse : on enchaîne tout seul pour garder le rythme.
        setTimeout(advance, REVEAL_MS);
      } else {
        // Raté : on laisse le temps de lire la bonne réponse (bouton « Morceau
        // suivant ») et le morceau rejoue pendant ce temps.
        advanceRef.current = advance;
        setWaiting(true);
        const cur = currentUrl.current;
        if (cur) player.playClip(cur.url, { start: "intro", seconds: 30 }).catch(() => {});
      }
    },
    [answerSeconds, boss, hearts, hp, index, level, outcomes, player, pool, startTrack, track, tracks]
  );

  // ------------------------------------------------------------- chrono
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) finishTrack(false);
    }, 250);
    return () => clearInterval(id);
  }, [phase, finishTrack]);

  // ------------------------------------------------------------- réponses
  // Valider passe TOUJOURS au morceau suivant : trouvé seulement si titre ET
  // artiste sont justes ; sinon (vide, faux ou à moitié juste) c'est raté.
  const submitTyped = () => {
    if (!track || phase !== "playing") return;
    const tOk = titleMatches(title, track.title);
    const aOk = artistMatches(artist, track.artist);
    setTitleOk(tOk);
    setArtistOk(aOk);
    finishTrack(tOk && aOk, false, !!boss && tOk !== aOk);
  };

  const choices: Choice[] = track && level.answer === "choice" ? choicesFor(track, pool, level.decoys) : [];
  const pickChoice = (i: number) => {
    if (phase !== "playing" || picked !== null) return;
    setPicked(i);
    finishTrack(choices[i]?.correct ?? false);
  };

  // ------------------------------------------------------------- bonus
  const canUse = (k: BoosterKey) => phase === "playing" && progress.boosters[k] > 0 && !(boss && bossBoosterUsed);
  const use = (k: BoosterKey) => {
    if (!canUse(k) || !track) return;
    const p = spendBooster(progress, k);
    setProgress(p);
    saveProgress(p);
    if (boss) setBossBoosterUsed(true);
    if (k === "time") {
      deadline.current += 5000;
      setTimeLeft((t) => t + 5);
    } else if (k === "hint") {
      if (level.answer === "choice") {
        const wrong = choices.map((c, i) => (c.correct ? -1 : i)).filter((i) => i >= 0);
        setHidden(new Set(wrong.slice(0, 2)));
      } else {
        setHint(true);
      }
    } else if (k === "replay") {
      previewFor(track)
        .then((d) => player.playClip(d.preview, clip))
        .catch(() => {});
    } else if (k === "skip") {
      finishTrack(false, true);
    }
  };

  // ------------------------------------------------------------- rendu
  const bg = boss ? (boss.color === "#2B2B33" ? "#2B2B33" : world.color) : world.color;
  const dark = bg === "#2B2B33";
  const textOn = dark ? "text-white" : "text-fg";

  if (phase === "locked" || phase === "error") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: world.color }}>
        <Kazou who="zou" mood="triste" size={110} />
        <p className="font-display text-2xl max-w-xs">
          {phase === "locked" ? "Termine d'abord le niveau précédent !" : error}
        </p>
        <Link href="/solo" className="bg-inkSurface border-[3px] border-fg rounded-xl shadow-sticker-sm px-5 py-3 font-display">
          Retour à la carte
        </Link>
      </main>
    );
  }

  if (phase === "done" && result) {
    return <EndScreen world={world} level={level} result={result} outcomes={outcomes} gained={gained} onReplay={onReplay} />;
  }

  const timerPct = Math.max(0, Math.min(100, (timeLeft / answerSeconds) * 100));
  const shown = phase === "reveal" && track;
  const lastOutcome = outcomes[outcomes.length - 1];

  return (
    <main className={`min-h-dvh flex flex-col items-center ${textOn}`} style={{ background: bg }}>
      <div className="w-full max-w-md flex flex-col flex-1 px-4 pt-5 pb-8 relative">
        <header className="flex items-center justify-between gap-2">
          <Link
            href="/solo"
            aria-label="Quitter le niveau"
            className="bg-inkSurface text-fg border-[3px] border-fg rounded-full shadow-sticker-sm w-11 h-11 flex items-center justify-center"
          >
            <X className="w-5 h-5" strokeWidth={3} />
          </Link>
          <div className="text-center min-w-0">
            <p className="text-[11px] font-extrabold tracking-[0.15em] uppercase truncate">
              {boss ? `Boss · Monde ${world.number}` : `Monde ${world.number} · ${world.name}`}
            </p>
            <h1 className="font-display text-2xl leading-tight truncate">{boss ? boss.name : `Niveau ${level.index}`}</h1>
          </div>
          <div
            className="w-12 h-12 rounded-full border-4 border-fg flex items-center justify-center shrink-0"
            style={{ background: `conic-gradient(#FF6FB5 0 ${timerPct}%, #fff 0)` }}
            aria-label={`${timeLeft} secondes`}
          >
            <span className="bg-white text-fg rounded-full w-8 h-8 flex items-center justify-center font-display text-sm">{timeLeft}</span>
          </div>
        </header>

        {boss ? (
          <>
            <div className="flex items-center justify-between mt-3">
              <span className="bg-inkSurface text-fg border-[3px] border-fg rounded-full shadow-sticker-sm px-3 py-1 text-sm" aria-label={`${hearts} cœurs`}>
                {"❤️".repeat(hearts)}
                {"🤍".repeat(BOSS_HEARTS - hearts)}
              </span>
              {phase2 && <span className="bg-[#FFE14D] text-fg border-[3px] border-fg rounded-full shadow-sticker-sm px-3 py-1 font-extrabold text-xs rotate-3">PHASE 2 !</span>}
            </div>
            <div className="mt-2 bg-white border-4 border-fg rounded-full h-7 overflow-hidden relative" aria-label={`Vie du boss : ${hp} %`}>
              <div className="h-full bg-gradient-to-b from-[#FF6F6F] to-[#E84A4A] border-r-4 border-fg transition-all duration-500" style={{ width: `${hp}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-fg font-extrabold text-xs">{hp} %</span>
            </div>
            <div className="relative flex justify-center mt-1">
              <BossSprite boss={boss} size={150} phase2={phase2} hit={hit} />
              <span className="absolute left-0 top-10 bg-inkSurface text-fg border-[3px] border-fg rounded-full shadow-sticker-sm px-2.5 py-1 font-extrabold text-[11px] -rotate-6">
                {boss.taunts[index % boss.taunts.length]}
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-center gap-1.5 mt-3" aria-label={`Morceau ${index + 1} sur ${tracks.length}`}>
            {tracks.map((t, i) => {
              const o = outcomes[i];
              const cls = o ? (o.found ? "bg-good" : "bg-[#FF6F6F]") : i === index ? "bg-fg" : "bg-white";
              return <span key={t.id + i} className={`w-6 h-2.5 rounded-full border-[2.5px] border-fg ${cls}`} />;
            })}
          </div>
        )}
        {!boss && tracks.length > 0 && (
          <p className="text-center text-xs font-extrabold mt-1.5">
            {outcomes.filter((o) => o.found).length} trouvé{outcomes.filter((o) => o.found).length > 1 ? "s" : ""} · objectif {starGoals(tracks.length).need} sur {tracks.length}
          </p>
        )}

        {/* Lecteur */}
        <div className="mt-4 bg-inkSurface text-fg border-4 border-fg rounded-[28px] shadow-sticker p-4 flex items-center gap-4">
          <button
            type="button"
            onClick={blocked ? unblock : () => use("replay")}
            disabled={!blocked && !canUse("replay")}
            aria-label={blocked ? "Lancer le son" : "Réécouter (bonus)"}
            className={`w-16 h-16 rounded-full bg-[#FFE14D] border-4 border-fg flex items-center justify-center shrink-0 disabled:opacity-60 ${blocked ? "animate-pulse" : ""}`}
          >
            <Play className="w-7 h-7 fill-fg" strokeWidth={2.5} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <b className="text-sm">{phase === "loading" || phase === "ready" ? "Chargement…" : blocked ? "Touche ▶ pour le son" : boss ? `Morceau ${index + 1}` : `Morceau ${index + 1} / ${tracks.length}`}</b>
              <span className="font-display text-xs bg-logo border-[3px] border-fg rounded-full px-2 py-0.5">{clipLabel(clip)}</span>
            </div>
            <div className="flex items-center gap-1 h-10" aria-hidden>
              {[18, 30, 44, 26, 38, 50, 22, 34, 46, 28, 40, 20, 32, 44].map((h, i) => (
                <i
                  key={i}
                  className={`w-1.5 rounded-full bg-fg ${player.playing ? "animate-pulse" : "opacity-25"}`}
                  style={{ height: `${h * 0.8}%`, animationDelay: `${i * 70}ms` }}
                />
              ))}
            </div>
          </div>
        </div>

        {shown && lastOutcome && (
          <div className={`mt-4 border-4 border-fg rounded-2xl p-4 text-fg ${lastOutcome.found ? "bg-[#E6F8EC]" : "bg-[#FFE3E3]"}`} role="status">
            <p className="font-display text-lg">
              {lastOutcome.found ? `Bien joué ! +${lastOutcome.points}` : level.answer === "typed" && (titleOk || artistOk) ? "Presque !" : "Raté !"}
            </p>
            {!lastOutcome.found && level.answer === "typed" && (titleOk || artistOk) && (
              <p className="text-sm font-bold">
                Titre {titleOk ? "✅" : "❌"} · Artiste {artistOk ? "✅" : "❌"}
                {boss ? " : demi-coup porté, aucun cœur perdu." : " : il faut les deux."}
              </p>
            )}
            <p className="font-bold">
              {cleanTitle(track.title)} — {track.artist}
            </p>
            {waiting && !lastOutcome.found && (
              <button
                type="button"
                onClick={() => advanceRef.current?.()}
                className="mt-3 w-full bg-fg text-white font-display text-lg rounded-xl py-3"
                autoFocus
              >
                Morceau suivant →
              </button>
            )}
          </div>
        )}

        {phase === "playing" && level.answer === "choice" && (
          <div className="mt-4 flex flex-col gap-2.5">
            {choices.map((c, i) =>
              hidden.has(i) ? (
                <div key={i} className="h-[54px] rounded-2xl border-[3px] border-dashed border-fg/40" />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickChoice(i)}
                  className="bg-inkSurface text-fg border-4 border-fg rounded-2xl shadow-sticker-sm px-4 py-3 text-left font-bold leading-snug active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  {c.label}
                </button>
              )
            )}
          </div>
        )}

        {phase === "playing" && level.answer === "typed" && track && (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <AnswerInput
              label="Titre"
              value={title}
              onChange={setTitle}
              ok={titleOk}
              dark={dark}
              placeholder={hint ? `${cleanTitle(track.title).charAt(0).toUpperCase()}…` : "Titre…"}
            />
            <AnswerInput
              label="Artiste"
              value={artist}
              onChange={setArtist}
              ok={artistOk}
              dark={dark}
              placeholder={hint ? `${track.artist.charAt(0).toUpperCase()}…` : "Artiste…"}
            />
            <Boosters progress={progress} canUse={canUse} use={use} bossLock={!!boss && bossBoosterUsed} dark={dark} />
            <button type="submit" className={`font-display text-xl rounded-2xl py-4 border-4 border-fg ${boss ? "bg-[#FFE14D] text-fg" : "bg-fg text-white"}`}>
              {boss ? "Frapper ! 🥊" : "Valider"}
            </button>
          </form>
        )}

        {phase === "playing" && level.answer === "choice" && (
          <div className="mt-4">
            <Boosters progress={progress} canUse={canUse} use={use} bossLock={false} dark={dark} choiceMode />
          </div>
        )}

        <div className="pointer-events-none absolute right-0 bottom-2 opacity-90 hidden sm:block">
          <Kazou who={world.color === "#A8DCFF" ? "zazou" : "zou"} mood={lastOutcome && phase === "reveal" ? (lastOutcome.found ? "champion" : "triste") : "joie"} size={72} />
        </div>
      </div>
    </main>
  );
}

function Boosters({
  progress,
  canUse,
  use,
  bossLock,
  dark,
  choiceMode = false,
}: {
  progress: SoloProgress;
  canUse: (k: BoosterKey) => boolean;
  use: (k: BoosterKey) => void;
  bossLock: boolean;
  dark: boolean;
  choiceMode?: boolean;
}) {
  const items: { key: BoosterKey; label: string; icon: ReactNode }[] = [
    { key: "time", label: "+5 s", icon: <IconClock /> },
    { key: "hint", label: choiceMode ? "50/50" : "Indice", icon: <IconBulb /> },
    { key: "replay", label: "Réécouter", icon: <IconReplay /> },
    { key: "skip", label: "Passer", icon: <IconSkip /> },
  ];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex justify-center gap-3">
        {items.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => use(b.key)}
            disabled={!canUse(b.key)}
            className="relative w-[70px] h-[72px] bg-inkSurface text-fg border-[3.5px] border-fg rounded-[20px] shadow-sticker-sm flex flex-col items-center justify-center gap-0.5 disabled:opacity-45"
          >
            {b.icon}
            <small className="text-[10px] font-extrabold">{b.label}</small>
            <em className="absolute -top-2.5 -right-2.5 not-italic bg-logo text-fg border-[2.5px] border-fg rounded-full text-[11px] font-extrabold px-1.5">
              {progress.boosters[b.key]}
            </em>
          </button>
        ))}
      </div>
      {bossLock && <p className={`text-xs font-extrabold ${dark ? "text-white" : ""}`}>Aide déjà utilisée pour ce combat</p>}
    </div>
  );
}

function EndScreen({
  world,
  level,
  result,
  outcomes,
  gained,
  onReplay,
}: {
  world: WorldDef;
  level: LevelDef;
  result: { stars: 0 | 1 | 2 | 3; points: number; won: boolean };
  outcomes: Outcome[];
  gained: BoosterKey[];
  onReplay: () => void;
}) {
  const next = world.levels.find((l) => l.index === level.index + 1);
  const label: Record<BoosterKey, string> = { time: "+5 s", hint: "Indice", replay: "Réécouter", skip: "Passer" };
  return (
    <main className="min-h-dvh flex flex-col items-center" style={{ background: world.color }}>
      <div className="w-full max-w-md px-4 pt-8 pb-10 flex flex-col items-center text-center">
        <Kazou who={result.won ? "kaz" : "zou"} mood={result.won ? "champion" : "triste"} size={120} />
        <h1 className="font-display text-3xl mt-2">
          {level.boss ? (result.won ? `${level.boss.name} est K.-O. !` : `${level.boss.name} t'a mis dehors…`) : result.won ? "Niveau réussi !" : "Presque !"}
        </h1>
        <p className="mt-3">
          <StarRow count={result.stars} size={52} gap={4} />
        </p>
        <p className="font-display text-xl mt-1">{result.points} points</p>
        {gained.length > 0 && (
          <p className="mt-2 bg-inkSurface border-[3px] border-fg rounded-full shadow-sticker-sm px-4 py-1.5 font-extrabold text-sm">
            🎁 Nouveau bonus : {gained.map((g) => label[g]).join(", ")} {level.boss ? "(boss battu)" : "(3 étoiles pour la première fois)"}
          </p>
        )}
        {!level.boss && (
          <div className="mt-4 w-full">
            <Goals level={level} trackCount={outcomes.length} found={outcomes.filter((o) => o.found).length} points={result.points} />
          </div>
        )}
        {level.boss && !result.won && <p className="mt-2 font-bold">Mets-le K.-O. avant de perdre tes 3 cœurs : chaque bonne réponse lui retire de la vie, plus vite tu réponds, plus ça fait mal.</p>}

        <ul className="mt-5 w-full bg-inkSurface border-4 border-fg rounded-3xl shadow-sticker divide-y-2 divide-dashed divide-fg/20 text-left">
          {outcomes.map((o, i) => (
            <li key={o.track.id + i} className="px-4 py-2.5 flex items-center gap-3">
              <span className="text-lg">{o.found ? "✅" : "❌"}</span>
              <span className="flex-1 min-w-0">
                <b className="block truncate">{cleanTitle(o.track.title)}</b>
                <span className="text-sm text-inkMuted truncate block">{o.track.artist}</span>
              </span>
              {o.found && <span className="font-display text-sm">+{o.points}</span>}
            </li>
          ))}
        </ul>

        <div className="mt-6 w-full flex flex-col gap-3">
          {result.won && (
            <Link href={`/solo?from=${level.id}`} className="bg-fg text-white font-display text-xl rounded-2xl py-4">
              {next ? "Continuer la tournée" : "Retour à la carte"}
            </Link>
          )}
          <button type="button" onClick={onReplay} className="bg-inkSurface border-4 border-fg rounded-2xl shadow-sticker-sm font-display text-lg py-3">
            Rejouer (nouveaux morceaux)
          </button>
          {!result.won && (
            <Link href="/solo" className="font-extrabold underline underline-offset-4">
              Retour à la carte
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Objectifs du niveau, en clair : combien de morceaux trouver pour réussir,
 * quels scores pour 2 et 3 étoiles. Sur l'écran de fin, les objectifs
 * atteints sont cochés.
 */
function Goals({
  level,
  trackCount,
  found,
  points,
  dark = false,
}: {
  level: LevelDef;
  trackCount: number;
  found?: number;
  points?: number;
  dark?: boolean;
}) {
  const ended = found !== undefined && points !== undefined;
  const rows: { stars: number; text: string; done: boolean }[] = level.boss
    ? [
        { stars: 1, text: `Mets ${level.boss.name} K.-O. avant de perdre tes 3 cœurs`, done: false },
        { stars: 2, text: "Gagne en gardant 2 cœurs", done: false },
        { stars: 3, text: "Gagne sans perdre un seul cœur", done: false },
      ]
    : (() => {
        const g = starGoals(trackCount);
        return [
          { stars: 1, text: `Trouve ${g.need} morceaux sur ${trackCount}${ended ? ` (tu en as trouvé ${found})` : ""}`, done: ended && found >= g.need },
          { stars: 2, text: `Fais ${g.two} points`, done: ended && found >= g.need && points >= g.two },
          { stars: 3, text: `Fais ${g.three} points`, done: ended && found >= g.need && points >= g.three },
        ];
      })();
  return (
    <div className="mt-5 bg-inkSurface text-fg border-4 border-fg rounded-3xl shadow-sticker px-4 py-3 text-left">
      <p className="text-xs font-extrabold tracking-[0.15em] uppercase mb-1.5">Objectifs</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.stars} className="flex items-center gap-2.5 font-bold">
            <span className="w-16 shrink-0 flex">
              {Array.from({ length: r.stars }, (_, i) => (
                <StarIconSmall key={i} />
              ))}
            </span>
            <span className="flex-1">{r.text}</span>
            {ended && <span aria-label={r.done ? "atteint" : "pas atteint"}>{r.done ? "✅" : "▫️"}</span>}
          </li>
        ))}
      </ul>
      {!level.boss && (
        <p className={`text-xs font-semibold mt-2 ${dark ? "" : "text-inkMuted"}`}>
          Chaque morceau trouvé rapporte 100 points, et jusqu&apos;à 50 de plus si tu réponds vite.
        </p>
      )}
    </div>
  );
}
