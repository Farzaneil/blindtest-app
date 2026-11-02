"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, ImagePlus, Lightbulb, MessageCircle, X } from "lucide-react";
import { Kazou } from "../../lib/kazou";
import { usePlayerAccount } from "../../lib/usePlayerAccount";
import { getFeedbackGameContext, getRecentErrors, installErrorCapture } from "../../lib/feedbackContext";
import {
  FEEDBACK_KINDS,
  FEEDBACK_SEVERITIES,
  FEEDBACK_TOPICS,
  type FeedbackKind,
  type FeedbackSeverity,
} from "../../lib/feedback";

/**
 * Retours de la bêta : une bulle rose « ! » toujours visible (en bas à
 * gauche, petite, pour ne rien cacher), qui ouvre un formulaire court. Le
 * message part à contact@kazouband.fr avec un objet trié ([Bêta] type ·
 * sujet · gravité), le contexte technique et la capture éventuelle (voir
 * app/api/feedback/route.ts). Ouvrir le formulaire ne met pas la partie en
 * pause.
 */

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;
// Capture réduite et recompressée dans le navigateur avant l'envoi.
const SCREENSHOT_MAX_SIDE = 1600;

const KIND_ICONS = { bug: Bug, idee: Lightbulb, avis: MessageCircle } as const;
const KIND_ACTIVE = { bug: "bg-[#FFD2DA]", idee: "bg-[#C9B6FF]", avis: "bg-[#FFE14D]" } as const;
const SEVERITY_ACTIVE = { bloquant: "bg-[#FFB3BF]", genant: "bg-amber", detail: "bg-[#E8E4D6]" } as const;
const MESSAGE_HELP: Record<FeedbackKind, { label: string; placeholder: string }> = {
  bug: { label: "Qu’est-ce qui s’est passé ?", placeholder: "Ex. : j’ai buzzé mais mon nom ne s’est pas affiché chez l’hôte." },
  idee: { label: "Ton idée", placeholder: "Ex. : pouvoir choisir la durée des extraits." },
  avis: { label: "Ton avis", placeholder: "Ce que tu as adoré, ce qui t’a fait décrocher…" },
};

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Image illisible."));
      i.src = url;
    });
    const scale = Math.min(1, SCREENSHOT_MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image illisible.");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function FeedbackWidget() {
  const pathname = usePathname();
  const { account } = usePlayerAccount();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [topic, setTopic] = useState<string | null>(null);
  const [severity, setSeverity] = useState<FeedbackSeverity>("genant");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    installErrorCapture();
  }, []);

  const attach = useCallback((file: File) => {
    setScreenshotError(null);
    if (!file.type.startsWith("image/")) {
      setScreenshotError("Choisis une image (capture d’écran).");
      return;
    }
    compressImage(file)
      .then(setScreenshot)
      .catch(() => setScreenshotError("Impossible de lire cette image."));
  }, []);

  // Échap ferme ; Cmd/Ctrl+V colle une capture d'écran.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        attach(file);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, attach]);

  const reset = () => {
    setKind("bug");
    setTopic(null);
    setSeverity("genant");
    setMessage("");
    setScreenshot(null);
    setScreenshotError(null);
    setError(null);
    setSent(false);
  };

  const close = () => {
    setOpen(false);
    if (sent) reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < MIN_LENGTH || sending) return;
    setSending(true);
    setError(null);
    const game = getFeedbackGameContext();
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          topic: topic ?? "autre",
          severity: kind === "bug" ? severity : null,
          message: message.trim(),
          email: email.trim() || null,
          screenshot,
          context: {
            page: pathname,
            roomCode: game.roomCode ?? null,
            role: game.role ?? (account ? "joueur connecté" : null),
            round: game.round ?? null,
            mode: game.mode ?? null,
            viewport: `${window.innerWidth} × ${window.innerHeight}`,
            errors: getRecentErrors(),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "L’envoi a échoué, réessaie dans un instant.");
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "L’envoi a échoué, réessaie dans un instant.");
    } finally {
      setSending(false);
    }
  };

  const help = MESSAGE_HELP[kind];
  const canSend = message.trim().length >= MIN_LENGTH && !sending;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Un bug ou un avis à déclarer ?"
        className="group fixed z-40 left-3 bottom-3 w-10 h-10 rounded-full bg-[#FF6FB5] text-fg border-[3px] border-fg shadow-sticker-sm flex items-center justify-center font-display text-lg leading-none transition-transform hover:-translate-y-0.5 print:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        !
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full ml-2 whitespace-nowrap bg-inkSurface text-fg text-xs font-bold border-2 border-fg rounded-lg px-2 py-1 shadow-sticker-sm opacity-0 translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100"
        >
          Un bug ou un avis à déclarer ?
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-inkSurface text-fg border-[3px] border-fg rounded-3xl shadow-sticker p-5 outline-none"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="w-12 h-12 shrink-0 rounded-full bg-[#A8DCFF] border-2 border-fg flex items-center justify-center">
                <Kazou who="zou" size={40} className="kazou-centre" />
              </span>
              <div className="min-w-0">
                <h2 id="feedback-title" className="font-display text-lg leading-tight">
                  Un souci, une idée ?
                </h2>
                <p className="text-xs text-inkMuted">Kazou Band est en bêta : tout nous aide.</p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="ml-auto self-start w-8 h-8 shrink-0 rounded-full border-2 border-fg flex items-center justify-center hover:bg-page transition"
              >
                <X className="w-4 h-4" strokeWidth={3} />
              </button>
            </div>

            {sent ? (
              <div className="flex flex-col items-center text-center gap-3 py-4">
                <Kazou who="kaz" mood="champion" size={120} />
                <p className="font-display text-xl">Merci, Kaz a tout noté !</p>
                <p className="text-sm text-inkMuted">
                  Ton message est bien parti. On lit tout{email.trim() || account ? ", et on te répondra" : ""}.
                </p>
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={reset} className="bg-inkSurface border-2 border-fg rounded-xl px-4 py-2 text-sm font-bold">
                    Envoyer autre chose
                  </button>
                  <button type="button" onClick={close} className="bg-sage border-2 border-fg shadow-sticker-sm rounded-xl px-4 py-2 text-sm font-bold">
                    Retour au jeu
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-xs font-extrabold uppercase tracking-wide text-inkMuted mb-2">C’est…</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {FEEDBACK_KINDS.map((k) => {
                      const Icon = KIND_ICONS[k.id];
                      const active = kind === k.id;
                      return (
                        <button
                          key={k.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setKind(k.id)}
                          className={`flex flex-col items-center gap-1 border-2 border-fg rounded-2xl py-2 text-sm font-extrabold transition ${
                            active ? `${KIND_ACTIVE[k.id]} shadow-sticker-sm -translate-y-px` : "bg-inkSurface"
                          }`}
                        >
                          <Icon className="w-5 h-5" aria-hidden />
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-extrabold uppercase tracking-wide text-inkMuted mb-2">Ça concerne</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {FEEDBACK_TOPICS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={topic === t.id}
                        onClick={() => setTopic((cur) => (cur === t.id ? null : t.id))}
                        className={`border-2 border-fg rounded-full px-3 py-1 text-xs font-bold transition ${
                          topic === t.id ? "bg-[#A8DCFF] shadow-sticker-sm" : "bg-inkSurface"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {kind === "bug" && (
                  <fieldset>
                    <legend className="text-xs font-extrabold uppercase tracking-wide text-inkMuted mb-2">Gravité</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {FEEDBACK_SEVERITIES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={severity === s.id}
                          onClick={() => setSeverity(s.id)}
                          className={`border-2 border-fg rounded-full px-3 py-1 text-xs font-bold transition ${
                            severity === s.id ? `${SEVERITY_ACTIVE[s.id]} shadow-sticker-sm` : "bg-inkSurface"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">{help.label}</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                    placeholder={help.placeholder}
                    rows={4}
                    className="w-full border-2 border-fg rounded-2xl px-3 py-2 text-sm bg-inkSurface resize-y"
                  />
                  <span className="self-end text-[11px] text-inkMuted">
                    {message.length} / {MAX_LENGTH}
                  </span>
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">
                    Capture d’écran {kind === "bug" ? "(conseillée)" : "(facultative)"}
                  </span>
                  {screenshot ? (
                    <div className="relative self-start">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={screenshot} alt="Capture jointe" className="max-h-40 rounded-xl border-2 border-fg" />
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        aria-label="Retirer la capture"
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-inkSurface border-2 border-fg flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="self-start inline-flex items-center gap-2 border-2 border-dashed border-fg rounded-xl px-3 py-2 text-sm font-bold bg-page/40"
                    >
                      <ImagePlus className="w-4 h-4" aria-hidden />
                      Joindre une capture
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) attach(file);
                      e.target.value = "";
                    }}
                  />
                  {!screenshot && (
                    <span className="text-[11px] text-inkMuted">
                      Fais une capture de ton écran, puis ajoute-la ici (sur ordi, tu peux aussi la coller avec Ctrl/Cmd + V).
                    </span>
                  )}
                  {screenshotError && <span className="text-xs font-bold text-danger">{screenshotError}</span>}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">
                    Ton e-mail, pour te répondre (facultatif)
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={account ? "Vide = l’adresse de ton compte" : "toi@exemple.fr"}
                    autoComplete="email"
                    className="w-full border-2 border-fg rounded-2xl px-3 py-2 text-sm bg-inkSurface"
                  />
                </label>

                <details className="text-xs bg-page/40 rounded-xl px-3 py-2">
                  <summary className="cursor-pointer font-bold">Infos jointes automatiquement</summary>
                  <p className="mt-1 text-inkMuted">
                    La page, la partie en cours (code, manche, ton rôle), ton appareil et ton navigateur, la version du
                    site et les dernières erreurs techniques de la page. Rien d’autre.
                  </p>
                </details>

                {error && <p className="text-sm font-bold text-danger">{error}</p>}

                <button
                  type="submit"
                  disabled={!canSend}
                  className="bg-[#FF6FB5] text-fg border-[3px] border-fg rounded-2xl shadow-sticker-sm py-3 font-display text-base disabled:opacity-45 transition-transform enabled:hover:-translate-y-0.5"
                >
                  {sending ? "Envoi…" : "Envoyer"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
