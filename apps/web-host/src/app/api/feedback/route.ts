import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { COOKIE_PLAYER_SESSION, verifySessionCookieValue } from "../../../lib/playerAuth";
import { clientIp, rateLimit, tooManyRequests } from "../../../lib/rateLimit";
import { CONTACT_EMAIL } from "../../../lib/legal";
import { FEEDBACK_KINDS, FEEDBACK_SEVERITIES, FEEDBACK_TOPICS } from "../../../lib/feedback";

/**
 * Retours de la bêta (formulaire du bouton « ! », voir
 * app/_components/FeedbackWidget.tsx) :
 * 1. valide et nettoie le formulaire ;
 * 2. l'enregistre dans la table feedback (migration 0036), sans la capture ;
 * 3. l'envoie à CONTACT_EMAIL via l'API Brevo (BREVO_API_KEY), avec un objet
 *    trié « [Bêta] Bug · Buzzer · gênant — … », le contexte technique et la
 *    capture en pièce jointe. « Répondre » écrit directement au testeur.
 * Réussite si au moins l'un des deux (base ou mail) a fonctionné.
 * Limité à 5 envois par heure et par IP.
 */

const MAX_SCREENSHOT_BASE64 = 3_000_000; // ~2,2 Mo d'image
const SENDER_EMAIL = process.env.FEEDBACK_SENDER_EMAIL || "connexion@kazouband.fr";

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

export async function POST(request: NextRequest) {
  if (!(await rateLimit(`feedback:ip:${clientIp(request)}`, 5, 3600))) {
    return tooManyRequests("Tu as déjà envoyé plusieurs messages, réessaie dans un moment. Merci !");
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Formulaire illisible." }, { status: 400 });
  }

  const kind = FEEDBACK_KINDS.find((k) => k.id === body?.kind);
  const topic = FEEDBACK_TOPICS.find((t) => t.id === body?.topic) ?? FEEDBACK_TOPICS.find((t) => t.id === "autre")!;
  const severity = kind?.id === "bug" ? FEEDBACK_SEVERITIES.find((s) => s.id === body?.severity) ?? null : null;
  const message = clip(body?.message, 2000);
  if (!kind || !message || message.length < 10) {
    return Response.json({ ok: false, error: "Écris au moins quelques mots (10 caractères)." }, { status: 400 });
  }

  let email = clip(body?.email, 254);
  if (email && !isEmail(email)) {
    return Response.json({ ok: false, error: "Cette adresse e-mail ne semble pas valide." }, { status: 400 });
  }

  // Capture : uniquement une image JPEG/PNG encodée en data URL, taille bornée.
  let screenshot: { content: string; ext: string } | null = null;
  if (typeof body?.screenshot === "string" && body.screenshot) {
    const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(body.screenshot);
    if (!m || m[2].length > MAX_SCREENSHOT_BASE64) {
      return Response.json({ ok: false, error: "Capture trop lourde ou illisible : essaie sans, ou avec une autre image." }, { status: 400 });
    }
    screenshot = { content: m[2], ext: m[1] === "png" ? "png" : "jpg" };
  }

  const ctx = body?.context ?? {};
  const context = {
    page: clip(ctx.page, 200),
    roomCode: clip(ctx.roomCode, 12),
    role: clip(ctx.role, 40),
    round: Number.isInteger(ctx.round) ? (ctx.round as number) : null,
    mode: clip(ctx.mode, 60),
    viewport: clip(ctx.viewport, 40),
    errors: Array.isArray(ctx.errors) ? ctx.errors.slice(-20).map((e: unknown) => clip(e, 300)).filter(Boolean) : [],
  };
  const userAgent = clip(request.headers.get("user-agent"), 300);
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

  // Compte joueur connecté : rattachement + adresse de réponse par défaut.
  const accountId = verifySessionCookieValue(request.cookies.get(COOKIE_PLAYER_SESSION)?.value);
  let pseudo: string | null = null;
  if (accountId) {
    const { data } = await supabaseAdmin.from("player_accounts").select("pseudo, email").eq("id", accountId).maybeSingle();
    pseudo = data?.pseudo ?? null;
    if (!email && data?.email) email = data.email;
  }

  // Objet trié pour les filtres de la boîte mail.
  const parts = [kind.subject, topic.subject, ...(severity ? [severity.subject] : [])];
  const excerpt = message.replace(/\s+/g, " ").slice(0, 50);
  const subject = `[Bêta] ${parts.join(" · ")} — « ${excerpt}${message.length > 50 ? "…" : ""} »`;

  // 1. Base de données.
  const { data: row, error: dbError } = await supabaseAdmin
    .from("feedback")
    .insert({
      kind: kind.id,
      topic: topic.id,
      severity: severity?.id ?? null,
      message,
      email,
      account_id: accountId,
      room_code: context.roomCode,
      role: context.role,
      page: context.page,
      user_agent: userAgent,
      viewport: context.viewport,
      app_version: version,
      client_errors: context.errors,
      has_screenshot: !!screenshot,
    })
    .select("id")
    .maybeSingle();

  // 2. Mail.
  let mailSent = false;
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey && CONTACT_EMAIL) {
    const rows: [string, string][] = [
      ["Type", parts.join(" · ")],
      ["Partie", context.roomCode ? `${context.roomCode}${context.round ? ` · manche ${context.round}` : ""}${context.mode ? ` · ${context.mode}` : ""}` : "aucune"],
      ["Rôle", context.role ?? "inconnu"],
      ["Compte", accountId ? `${pseudo ?? "?"} (${accountId})` : "invité"],
      ["Réponse à", email ?? "pas d’adresse laissée"],
      ["Page", context.page ?? "?"],
      ["Appareil", `${userAgent ?? "?"} · ${context.viewport ?? "?"}`],
      ["Version", version],
      ["Erreurs", context.errors.length ? context.errors.join("\n") : "aucune"],
      ["Capture", screenshot ? "en pièce jointe" : "aucune"],
    ];
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
<p style="white-space:pre-wrap;font-size:15px;border-left:4px solid #FF6FB5;padding:4px 12px">${escapeHtml(message)}</p>
<table style="border-collapse:collapse;font-size:13px">${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 10px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(v)}</td></tr>`
      )
      .join("")}</table></div>`;
    const text = `${message}\n\n${rows.map(([k, v]) => `${k} : ${v}`).join("\n")}`;
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "Kazou Band bêta", email: SENDER_EMAIL },
          to: [{ email: CONTACT_EMAIL }],
          ...(email ? { replyTo: { email } } : {}),
          subject,
          htmlContent: html,
          textContent: text,
          ...(screenshot ? { attachment: [{ name: `capture.${screenshot.ext}`, content: screenshot.content }] } : {}),
        }),
      });
      mailSent = res.ok;
      if (!res.ok) console.error("feedback: Brevo a refusé l'envoi", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error("feedback: envoi Brevo impossible", e);
    }
  } else {
    console.error("feedback: BREVO_API_KEY ou CONTACT_EMAIL manquant, mail non envoyé");
  }

  if (row?.id && mailSent) {
    await supabaseAdmin.from("feedback").update({ mail_sent: true }).eq("id", row.id).then(
      () => undefined,
      () => undefined
    );
  }
  if (dbError) console.error("feedback: enregistrement impossible", dbError.message);

  if (!row && !mailSent) {
    return Response.json({ ok: false, error: "L’envoi a échoué, réessaie dans un instant." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
