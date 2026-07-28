/**
 * Listes d'artistes connus par genre, curées à la main — pas une donnée
 * Spotify. Sert de base à la génération de playlist par genre + époque
 * (voir host/page.tsx, handleGenerateGenrePlaylist) : Spotify a retiré le
 * champ `popularity` de son API (changelog février 2026), donc impossible
 * de trier une recherche par "morceau connu" ; et le filtre `genre:` de
 * l'API Search tague les ARTISTES avec des micro-genres très précis (ex.
 * "disco house", "chanson française") qui collent mal à des catégories
 * larges comme "variétés" ou "disco" telles qu'on les pense pour une
 * soirée. Partir d'artistes qu'on sait nous-mêmes représentatifs d'un genre
 * garantit des morceaux reconnaissables, contrairement à une recherche
 * `genre:variétés` livrée au hasard.
 *
 * Volontairement une liste de départ généraliste "soirée entre potes" —
 * facile à étendre : ajouter une clé/un artiste ne demande aucun autre
 * changement de code.
 */
export const GENRE_PRESETS: Record<string, string[]> = {
  "Variétés françaises": [
    "Johnny Hallyday", "France Gall", "Michel Sardou", "Mylène Farmer",
    "Jean-Jacques Goldman", "Patrick Bruel", "Francis Cabrel", "Céline Dion",
    "Zaz", "Vanessa Paradis", "Christophe Maé", "Calogero", "Julien Doré",
    "Renaud", "Indochine", "Téléphone", "Étienne Daho", "Charles Aznavour",
    "Serge Gainsbourg", "Dalida", "Louane", "Amir",
  ],
  "Rap français": [
    "Booba", "Nekfeu", "PNL", "Damso", "Ninho", "IAM", "Orelsan",
    "Bigflo & Oli", "Jul", "SCH", "Kaaris", "Alonzo", "Vald", "Lomepal",
    "Soprano", "Maître Gims", "Dadju", "MHD", "Niska", "Gazo",
  ],
  "Disco / Funk": [
    "Bee Gees", "Donna Summer", "ABBA", "Boney M.", "Sister Sledge",
    "Earth, Wind & Fire", "Chic", "KC and the Sunshine Band", "Gloria Gaynor",
    "The Jacksons", "Diana Ross", "Kool & The Gang", "Village People",
    "Barry White", "Chaka Khan",
  ],
  "Pop/Rock 2000-2010s": [
    "Coldplay", "Muse", "The Killers", "Maroon 5", "Rihanna", "Katy Perry",
    "Lady Gaga", "Beyoncé", "Adele", "Bruno Mars", "OneRepublic",
    "Imagine Dragons", "Ed Sheeran", "Sia", "Pink", "Kings of Leon",
    "Amy Winehouse", "Lana Del Rey",
  ],
  "Dance / Électro": [
    "David Guetta", "Daft Punk", "Justice", "Martin Garrix", "Avicii",
    "Calvin Harris", "Swedish House Mafia", "Deadmau5", "Cassius",
    "Bob Sinclar", "Kungs", "Ofenbach", "Petit Biscuit", "Stromae",
  ],
};

export type GenreKey = keyof typeof GENRE_PRESETS;

export const ALL_GENRES_KEY = "Tous les genres";

/**
 * Pool d'artistes pour une clé de genre donnée, ou l'ensemble de tous les
 * artistes connus (toutes listes confondues) si genreKey vaut
 * ALL_GENRES_KEY — utilisé quand l'hôte choisit "tout genre" plutôt qu'un
 * genre précis.
 */
export function getArtistPool(genreKey: string): string[] {
  if (genreKey === ALL_GENRES_KEY) {
    return Object.values(GENRE_PRESETS).flat();
  }
  return GENRE_PRESETS[genreKey] ?? [];
}
