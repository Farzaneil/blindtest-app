"use client";

/**
 * Récap de fin de partie à partager (maquette « Le récap à partager ») :
 * une image au format story (1080 × 1920) fabriquée dans le navigateur
 * (canvas, rien n'est envoyé à un serveur), avec le podium ou le classement
 * des équipes, deux ou trois moments forts et un QR code « À vous de
 * jouer » vers kazouband.fr (?src=recap, suivi comme les stickers).
 *
 * Bouton « Partager le récap » → aperçu → « Envoyer » (partage natif du
 * téléphone : WhatsApp, Instagram, Messages…) ou « Enregistrer » (fichier).
 * Le Kazou Band reste en marge, en petit, jamais sur le podium.
 */

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Send, Share2, X } from "lucide-react";
import { AVATAR_BY_KEY } from "../../lib/avatars";
import { kazouSvgString } from "../../lib/kazou";
import type { Round } from "../../lib/rooms";

export type RecapAvatar = { key: string; color: string };
export type RecapData = {
  title: string;
  meta: string;
  podium?: { rank: number; names: string; score: number; avatar?: RecapAvatar }[];
  rest?: { rank: number; name: string; score: number }[];
  teams?: { rank: number; name: string; color: string; score: number }[];
  stats: { icon: string; label: string; value: string }[];
};

const RECAP_URL = "https://kazouband.fr/?src=recap";
const W = 1080;
const H = 1920;
const INK = "#111111";

/** Nom court d'une manche pour les moments forts (l'œuvre en « film / série »). */
export function roundShortName(r: Pick<Round, "title"> & { answer_mode?: string | null; work?: string | null }): string {
  return r.answer_mode === "work" ? r.work || r.title : r.title;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

/* ---------------------------------------------------------------- dessin */

function svgImage(svg: string): Promise<HTMLImageElement> {
  const withNs = svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
  });
}

function avatarSvg(a: RecapAvatar): string {
  const def = AVATAR_BY_KEY[a.key];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100" overflow="visible"><circle cx="50" cy="50" r="46" fill="${a.color}" stroke="${INK}" stroke-width="5"/><g>${def?.svg ?? ""}</g></svg>`;
}

function sticker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, shadow = 10) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x + shadow, y + shadow, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

/** Texte réduit jusqu'à tenir dans la largeur. */
function fitText(ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, size: number, maxW: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 18) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function fontFamilies() {
  const probe = document.createElement("span");
  probe.className = "font-display";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const display = getComputedStyle(probe).fontFamily || "Arial Black, sans-serif";
  probe.remove();
  const body = getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
  return { display, body };
}

function themeColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  return v ? `rgb(${v})` : "#FFE14D";
}

async function drawRecap(data: RecapData, qrSvg: string): Promise<Blob> {
  await document.fonts?.ready;
  const { display, body } = fontFamilies();
  await Promise.all([
    document.fonts?.load(`400 60px ${display}`),
    document.fonts?.load(`800 40px ${body}`),
  ]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "middle";

  ctx.fillStyle = themeColor();
  ctx.fillRect(0, 0, W, H);

  // En-tête : deux pastilles.
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).toUpperCase();
  const pills: [string, string][] = [
    [`BLIND TEST · ${date}`, "#FFFFFF"],
    [data.meta, "#FFE14D"],
  ];
  let px = 70;
  ctx.font = `800 30px ${body}`;
  for (const [label, fill] of pills) {
    const w = ctx.measureText(label).width + 56;
    sticker(ctx, px, 70, w, 64, 32, fill, 6);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(label, px + 28, 103);
    px += w + 20;
  }

  // Kaz en champion, en marge haute droite.
  const kaz = await svgImage(kazouSvgString("kaz", "champion", 240));
  ctx.save();
  ctx.translate(960, 150);
  ctx.rotate(-0.17);
  ctx.drawImage(kaz, -120, -120, 240, 240);
  ctx.restore();

  // Titre.
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  fitText(ctx, data.title, display, "400", 92, 900);
  ctx.fillText(data.title, W / 2, 300);

  let y = 400;
  if (data.podium && data.podium.length > 0) {
    const cols = [
      { rank: 2, x: 290, h: 250 },
      { rank: 1, x: 540, h: 340 },
      { rank: 3, x: 790, h: 190 },
    ];
    const baseY = 1060;
    const fills: Record<number, string> = { 1: "#FFE14D", 2: "#FFFFFF", 3: "#FF6FB5" };
    for (const c of cols) {
      const entry = data.podium.find((p) => p.rank === c.rank);
      if (!entry) continue;
      const top = baseY - c.h;
      // Marche.
      ctx.fillStyle = fills[c.rank];
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(c.x - 115, top, 230, c.h + 10, [24, 24, 0, 0]);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `400 80px ${display}`;
      ctx.fillText(String(c.rank), c.x, top + 70);
      // Score, nom, avatar au-dessus.
      ctx.font = `800 30px ${body}`;
      ctx.fillText(`${entry.score} pts`, c.x, top - 30);
      ctx.font = `800 34px ${body}`;
      const name = ellipsis(ctx, entry.names, 230);
      const nw = ctx.measureText(name).width + 36;
      sticker(ctx, c.x - nw / 2, top - 112, nw, 56, 14, "#FFFFFF", 5);
      ctx.fillStyle = INK;
      ctx.fillText(name, c.x, top - 84);
      const size = c.rank === 1 ? 170 : 140;
      if (entry.avatar) {
        const av = await svgImage(avatarSvg(entry.avatar));
        ctx.drawImage(av, c.x - size / 2, top - 130 - size, size, size);
      }
      if (c.rank === 1) {
        ctx.font = `64px ${body}`;
        ctx.fillText("👑", c.x, top - 130 - size - 30);
      }
    }
    y = baseY + 10;
    if (data.rest && data.rest.length > 0) {
      ctx.font = `700 30px ${body}`;
      const line = data.rest.map((r) => `${r.rank}. ${r.name} · ${r.score} pts`).join("   ");
      const lines: string[] = [];
      let cur = "";
      for (const part of line.split("   ")) {
        const next = cur ? `${cur}   ${part}` : part;
        if (ctx.measureText(next).width > 860 && cur) {
          lines.push(cur);
          cur = part;
        } else cur = next;
      }
      if (cur) lines.push(cur);
      const shown = lines.slice(0, 2);
      const h = 40 + shown.length * 44;
      sticker(ctx, 90, y, 900, h, 24, "#FFFFFF", 6);
      ctx.fillStyle = INK;
      shown.forEach((l, i) => ctx.fillText(l, W / 2, y + 42 + i * 44));
      y += h + 40;
    } else {
      y += 30;
    }
  } else if (data.teams) {
    for (const t of data.teams.slice(0, 4)) {
      const first = t.rank === 1;
      sticker(ctx, 90, y, 900, 120, 28, "#FFFFFF", 8);
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `400 52px ${display}`;
      ctx.fillText(String(t.rank), 130, y + 62);
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(215, y + 60, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `800 44px ${body}`;
      ctx.fillText(ellipsis(ctx, t.name, 520), 260, y + 62);
      ctx.textAlign = "right";
      ctx.font = `400 40px ${display}`;
      ctx.fillText(`${t.score} pts`, 950, y + 62);
      if (first) {
        ctx.textAlign = "center";
        ctx.font = `56px ${body}`;
        ctx.fillText("👑", 980, y - 4);
      }
      ctx.textAlign = "center";
      y += 150;
    }
    y += 20;
  }

  // Moments forts.
  for (const s of data.stats.slice(0, 3)) {
    sticker(ctx, 90, y, 900, 110, 24, "#FFFFFF", 6);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `50px ${body}`;
    ctx.fillText(s.icon, 120, y + 56);
    ctx.font = `800 32px ${body}`;
    ctx.fillText(ellipsis(ctx, s.label, 760), 200, y + 38);
    ctx.font = `500 32px ${body}`;
    ctx.fillText(ellipsis(ctx, s.value, 760), 200, y + 78);
    y += 130;
  }
  ctx.textAlign = "center";

  // Pied : QR code + invitation.
  const footY = H - 300;
  ctx.fillStyle = INK;
  ctx.fillRect(0, footY, W, 300);
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(70, footY + 40, 220, 220, 22);
  ctx.fill();
  const qr = await svgImage(qrSvg);
  ctx.drawImage(qr, 86, footY + 56, 188, 188);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `400 62px ${display}`;
  ctx.fillText("À vous de jouer !", 330, footY + 100);
  ctx.font = `800 46px ${body}`;
  ctx.fillText("kazouband.fr", 330, footY + 170);
  ctx.font = `500 32px ${body}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText("Un téléphone chacun, zéro appli.", 330, footY + 225);
  ctx.globalAlpha = 1;

  // Zazou, en marge basse droite.
  const zazou = await svgImage(kazouSvgString("zazou", "champion", 200));
  ctx.save();
  ctx.translate(990, footY - 40);
  ctx.rotate(-0.25);
  ctx.drawImage(zazou, -100, -100, 200, 200);
  ctx.restore();

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image impossible à créer."))), "image/png")
  );
}

/* ------------------------------------------------------------- composant */

export function ShareRecap({ data }: { data: RecapData }) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const svg = qrRef.current?.querySelector("svg")?.outerHTML ?? "";
      const b = await drawRecap(data, svg);
      setBlob(b);
      setUrl(URL.createObjectURL(b));
    } catch {
      setError("Impossible de créer l’image, réessaie.");
    } finally {
      setBusy(false);
    }
  };

  const file = () => new File([blob!], "kazou-band-recap.png", { type: "image/png" });

  const save = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "kazou-band-recap.png";
    a.click();
  };

  const send = async () => {
    if (!blob) return;
    const f = file();
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], text: `Notre blind test Kazou Band ! À vous de jouer : ${RECAP_URL}` });
      } catch {
        // Partage annulé par le joueur : rien à faire.
      }
    } else {
      save();
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div ref={qrRef} className="hidden" aria-hidden="true">
        <QRCodeSVG value={RECAP_URL} size={256} level="M" fgColor={INK} bgColor="#FFFFFF" marginSize={0} />
      </div>
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="bg-[#FF6FB5] text-fg border-[3px] border-fg shadow-sticker rounded-2xl px-5 py-3 font-extrabold inline-flex items-center gap-2 disabled:opacity-60"
      >
        <Share2 className="w-5 h-5" /> {busy ? "Création de l’image…" : "Partager le récap"}
      </button>
      <p className="text-xs font-bold text-inkMuted text-center">Une image pour ta story ou ton groupe WhatsApp</p>
      {error && <p className="text-sm font-bold text-danger">{error}</p>}

      {url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ton récap est prêt"
          className="fixed inset-0 z-[70] bg-black/85 flex flex-col items-center justify-center gap-4 p-4"
        >
          <div className="w-full max-w-sm flex items-center justify-between text-white">
            <p className="font-extrabold">Ton récap est prêt</p>
            <button type="button" onClick={() => setUrl(null)} aria-label="Fermer" className="p-1">
              <X className="w-6 h-6" />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Récap de la partie" className="max-h-[70vh] w-auto rounded-2xl border-[3px] border-white" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={send}
              className="bg-[#FF6FB5] text-fg border-[3px] border-fg rounded-xl px-5 py-2.5 font-extrabold inline-flex items-center gap-2"
            >
              <Send className="w-4 h-4" /> Envoyer
            </button>
            <button
              type="button"
              onClick={save}
              className="bg-white text-fg border-[3px] border-fg rounded-xl px-5 py-2.5 font-extrabold inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Enregistrer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------- données du récap */

type RankedLike = { id: string; rank: number; display_name: string; score: number };
type Highlights = { fastest: { name: string; seconds: number } | null; contested: { name: string; count: number } | null };

function highlightStats(h: Highlights): RecapData["stats"] {
  const stats: RecapData["stats"] = [];
  if (h.fastest) stats.push({ icon: "⚡", label: "Buzz le plus rapide", value: `${h.fastest.name} · ${h.fastest.seconds.toFixed(1).replace(".", ",")} s` });
  if (h.contested && h.contested.count > 1) stats.push({ icon: "🎵", label: "Manche la plus disputée", value: `${h.contested.name} · ${h.contested.count} buzz` });
  return stats;
}

export function buildSoloRecap(
  ranked: RankedLike[],
  avatarOf: (p: RankedLike) => RecapAvatar,
  roundsCount: number,
  h: Highlights
): RecapData {
  const podium = [1, 2, 3].flatMap((r) => {
    const group = ranked.filter((p) => p.rank === r);
    if (group.length === 0) return [];
    return [{ rank: r, names: group.map((p) => p.display_name).join(" & "), score: group[0].score, avatar: avatarOf(group[0]) }];
  });
  const winners = ranked.filter((p) => p.rank === 1);
  return {
    title: winners.length === 1 ? `${winners[0].display_name} gagne !` : "Égalité au sommet !",
    meta: `${plural(roundsCount, "manche", "manches")} · ${plural(ranked.length, "joueur", "joueurs")}`,
    podium,
    rest: ranked.filter((p) => p.rank > 3).slice(0, 6).map((p) => ({ rank: p.rank, name: p.display_name, score: p.score })),
    stats: highlightStats(h),
  };
}

export function buildTeamRecap<T extends { name: string }>(
  standings: { rank: number; score: number; team: T; players: { id: string; display_name: string; score: number }[]; mvpPlayerId: string | null }[],
  colorOf: (team: T) => string,
  roundsCount: number,
  playersCount: number,
  h: Highlights
): RecapData {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const winners = sorted.filter((s) => s.rank === 1);
  const winner = winners.length === 1 ? winners[0] : null;
  const mvp = winner?.players.find((p) => p.id === winner.mvpPlayerId);
  const verb = winner && /^les\s/i.test(winner.team.name) ? "gagnent" : "gagne";
  return {
    title: winner ? `${winner.team.name} ${verb} !` : "Égalité au sommet !",
    meta: `${plural(roundsCount, "manche", "manches")} · ${plural(playersCount, "joueur", "joueurs")}`,
    teams: sorted.map((s) => ({ rank: s.rank, name: s.team.name, color: colorOf(s.team), score: s.score })),
    stats: [
      ...(mvp && winner ? [{ icon: "⭐", label: "MVP", value: `${mvp.display_name} · ${mvp.score} pts pour ${winner.team.name}` }] : []),
      ...highlightStats(h),
    ],
  };
}
