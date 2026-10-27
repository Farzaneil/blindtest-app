import { CONTACT_EMAIL } from "../../lib/legal";

/** Adresse de contact cliquable, ou texte d'attente si pas encore créée. */
export function ContactEmail() {
  if (!CONTACT_EMAIL) return <span className="font-bold">l’adresse de contact du site (bientôt disponible)</span>;
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline break-all">
      {CONTACT_EMAIL}
    </a>
  );
}
