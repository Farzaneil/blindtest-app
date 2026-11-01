/**
 * Listes du formulaire de retours de la bêta, partagées par le widget
 * (app/_components/FeedbackWidget.tsx) et la route qui valide et envoie
 * (app/api/feedback/route.ts). Ajouter un sujet = une ligne ici.
 */

export type FeedbackKind = "bug" | "idee" | "avis";
export type FeedbackSeverity = "bloquant" | "genant" | "detail";

export const FEEDBACK_KINDS: { id: FeedbackKind; label: string; subject: string }[] = [
  { id: "bug", label: "Un bug", subject: "Bug" },
  { id: "idee", label: "Une idée", subject: "Idée" },
  { id: "avis", label: "Un avis", subject: "Avis" },
];

export const FEEDBACK_TOPICS: { id: string; label: string; subject: string }[] = [
  { id: "buzzer", label: "Le buzzer", subject: "Buzzer" },
  { id: "musique", label: "La musique", subject: "Musique" },
  { id: "playlists", label: "Les playlists", subject: "Playlists" },
  { id: "scores", label: "Scores & règles", subject: "Scores" },
  { id: "affichage", label: "L’affichage", subject: "Affichage" },
  { id: "compte", label: "Compte & profil", subject: "Compte" },
  { id: "autre", label: "Autre", subject: "Autre" },
];

export const FEEDBACK_SEVERITIES: { id: FeedbackSeverity; label: string; subject: string }[] = [
  { id: "bloquant", label: "Ça bloque la partie", subject: "BLOQUANT" },
  { id: "genant", label: "C’est gênant", subject: "gênant" },
  { id: "detail", label: "Un détail", subject: "détail" },
];
