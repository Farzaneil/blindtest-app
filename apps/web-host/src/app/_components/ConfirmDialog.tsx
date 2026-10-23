"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Boîte de confirmation dans la DA "Arcade autocollants", à la place du
 * window.confirm() natif (gris, hors charte). Usage, depuis n'importe quel
 * composant client :
 *
 *   if (!(await confirmDialog({ title: "…", message: "…" }))) return;
 *
 * <ConfirmDialogHost /> est monté une seule fois dans app/layout.tsx.
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton de confirmation en rouge. */
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let openDialog: ((p: Pending) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Hôte pas encore monté (ne devrait pas arriver) : repli natif.
    if (!openDialog) {
      resolve(window.confirm([options.title, options.message].filter(Boolean).join("\n\n")));
      return;
    }
    openDialog({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openDialog = (p) => setPending(p);
    return () => {
      openDialog = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        pending.resolve(false);
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[rgb(17_17_17/0.45)]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={pending.message ? "confirm-dialog-message" : undefined}
        className="w-full max-w-md bg-inkSurface border-[3px] border-fg rounded-2xl shadow-sticker-lg p-6 flex flex-col gap-4 text-left animate-[confirmPop_0.16s_ease-out]"
      >
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 w-11 h-11 rounded-full border-[3px] border-fg shadow-sticker-sm flex items-center justify-center -rotate-6 ${
              pending.danger ? "bg-danger text-white" : "bg-info text-fg"
            }`}
          >
            <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="font-display text-xl leading-tight">
              {pending.title}
            </h2>
            {pending.message && (
              <p id="confirm-dialog-message" className="text-sm font-medium text-inkMuted mt-1.5">
                {pending.message}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-1">
          <button
            type="button"
            onClick={() => close(false)}
            className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-xl px-5 py-2.5 font-bold transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {pending.cancelLabel ?? "Annuler"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => close(true)}
            className={`border-[3px] border-fg shadow-sticker-sm rounded-xl px-5 py-2.5 font-display transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
              pending.danger ? "bg-danger text-white" : "bg-sage text-fg"
            }`}
          >
            {pending.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
