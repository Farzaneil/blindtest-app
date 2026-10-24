"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Mail, MailCheck } from "lucide-react";
import { useForceLoopbackHost } from "../../lib/useForceLoopbackHost";

/**
 * Écran de connexion joueur : lien magique par e-mail (voir
 * api/player-auth/email et api/player-auth/confirm). Plus de connexion via
 * un compte de musique (Spotify limitait le nombre de comptes autorisés).
 *
 * `next` (où revenir une fois connecté, ou en cliquant "Continuer en
 * invité") est repris du point d'entrée qui a mené ici (voir
 * PlayerAccountCorner) et transmis dans le lien envoyé par e-mail.
 *
 * Contenu dans ConnexionForm sous <Suspense> : useSearchParams() l'exige
 * au build (`next build`).
 */
export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionForm />
    </Suspense>
  );
}

function ConnexionForm() {
  // Les cookies posés sur "localhost" sont invisibles depuis "127.0.0.1" :
  // même hôte partout (voir useForceLoopbackHost) pour que la session
  // ouverte par le lien soit bien relue ensuite.
  useForceLoopbackHost();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(urlError);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/player-auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Envoi impossible, réessaie.");
      setSentTo(email.trim());
    } catch (e: any) {
      setError(e?.message ?? "Envoi impossible, réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 bg-page">
      <div className="relative w-full max-w-sm bg-inkSurface border-[3px] border-fg rounded-2xl p-7 flex flex-col gap-4 shadow-sticker">
        <div className="text-center">
          <p className="text-2xl font-display text-fg">Connecte-toi</p>
          <p className="text-sm text-inkMuted mt-1">
            Sauvegarde tes stats, débloque des badges, grimpe au classement.
          </p>
        </div>

        {error && (
          <p className="text-danger text-sm font-bold text-center bg-inkSurface border-2 border-danger rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {sentTo ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="w-14 h-14 rounded-full bg-good border-[3px] border-fg shadow-sticker-sm flex items-center justify-center -rotate-6">
              <MailCheck className="w-7 h-7" strokeWidth={2.5} />
            </span>
            <p className="font-display text-lg">Regarde tes e-mails !</p>
            <p className="text-sm text-inkMuted">
              Un lien de connexion a été envoyé à <span className="font-bold text-fg">{sentTo}</span>. Ouvre-le
              <span className="font-bold text-fg"> sur cet appareil</span> pour te connecter ici.
            </p>
            <p className="text-xs text-inkMuted">Rien reçu ? Regarde dans les spams, ou</p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="text-sm font-bold underline hover:text-fg transition"
            >
              renvoyer un lien
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="flex items-center gap-2 bg-inkSurface border-2 border-fg rounded-xl px-3 py-3">
              <Mail className="w-5 h-5 text-inkMuted shrink-0" />
              <span className="sr-only">Adresse e-mail</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.fr"
                className="flex-1 min-w-0 bg-transparent outline-none font-medium"
              />
            </label>
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="bg-sage text-fg border-[3px] border-fg shadow-sticker rounded-xl py-3 font-display text-lg transition-transform hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
            >
              {sending ? "Envoi…" : "Recevoir mon lien de connexion"}
            </button>
            <p className="text-xs text-inkMuted text-center">
              Pas de mot de passe : on t’envoie un lien, un clic et c’est bon. Premier passage ? Ton compte est créé
              automatiquement.
            </p>
          </form>
        )}

        <Link href={next} className="text-sm text-inkMuted hover:text-fg underline transition self-center mt-1">
          Continuer en invité
        </Link>
        <Link
          href="/"
          className="text-xs text-inkMuted hover:text-fg underline transition inline-flex items-center gap-1 self-center"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Accueil
        </Link>
      </div>
    </main>
  );
}
