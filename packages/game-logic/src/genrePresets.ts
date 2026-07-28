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
    "Serge Gainsbourg", "Dalida", "Louane", "Amir", "Michel Polnareff",
    "Véronique Sanson", "Alain Souchon", "Laurent Voulzy", "Julien Clerc",
    "Florent Pagny", "Pascal Obispo", "Garou", "Kendji Girac",
    "Christophe Willem", "Slimane", "Grand Corps Malade", "M. Pokora",
    "Vitaa", "Zazie", "Jenifer", "Chimène Badi", "Hoshi", "Angèle",
    "Clara Luciani", "Camille", "Bénabar", "Nolwenn Leroy", "Patricia Kaas",
    "Mireille Mathieu", "Sylvie Vartan", "Claude François", "Joe Dassin",
    "Michel Berger", "Gilbert Bécaud", "Barbara", "Jacques Brel",
    "Georges Brassens",
  ],
  "Rap français": [
    "Booba", "Nekfeu", "PNL", "Damso", "Ninho", "IAM", "Orelsan",
    "Bigflo & Oli", "Jul", "SCH", "Kaaris", "Alonzo", "Vald", "Lomepal",
    "Soprano", "Maître Gims", "Dadju", "MHD", "Niska", "Gazo",
    "Kalash Criminel", "Freeze Corleone", "Ziak", "Naps", "Werenoi",
    "Tiakola", "Josman", "Laylow", "Hamza", "Dinos", "Rim'K", "La Fouine",
    "Sexion d'Assaut", "Rohff", "Kery James", "MC Solaar", "Fianso",
    "Sofiane", "Diam's", "Youssoupha", "Sniper", "113", "Suprême NTM",
    "Doc Gynéco", "Kalash", "Koba LaD", "Timal", "Heuss L'Enfoiré",
  ],
  "Disco / Funk": [
    "Bee Gees", "Donna Summer", "ABBA", "Boney M.", "Sister Sledge",
    "Earth, Wind & Fire", "Chic", "KC and the Sunshine Band", "Gloria Gaynor",
    "The Jacksons", "Diana Ross", "Kool & The Gang", "Village People",
    "Barry White", "Chaka Khan", "Michael Jackson", "James Brown",
    "Parliament", "Rick James", "Sly and the Family Stone",
    "Average White Band", "Amii Stewart", "Tavares", "The Trammps",
    "Rose Royce", "Cameo", "The Pointer Sisters", "Lipps Inc.",
    "Gap Band", "Cerrone", "Patrick Hernandez", "Anita Ward",
    "Evelyn \"Champagne\" King", "Odyssey", "A Taste of Honey",
    "Instant Funk", "George McCrae", "Thelma Houston",
  ],
  "Pop / Rock": [
    "Coldplay", "Muse", "The Killers", "Maroon 5", "Rihanna", "Katy Perry",
    "Lady Gaga", "Beyoncé", "Adele", "Bruno Mars", "OneRepublic",
    "Imagine Dragons", "Ed Sheeran", "Sia", "Pink", "Kings of Leon",
    "Amy Winehouse", "Lana Del Rey", "Taylor Swift", "Justin Bieber",
    "Ariana Grande", "Dua Lipa", "Billie Eilish", "Shawn Mendes",
    "Selena Gomez", "Miley Cyrus", "Christina Aguilera", "Britney Spears",
    "John Mayer", "Train", "Panic! At The Disco", "Fall Out Boy",
    "Paramore", "Linkin Park", "Green Day", "Foo Fighters",
    "Red Hot Chili Peppers", "The 1975", "Arctic Monkeys",
    "Florence and the Machine", "Lorde", "Halsey", "Camila Cabello",
    "Harry Styles", "Sam Smith", "Charlie Puth",
  ],
  "Dance / Électro": [
    "David Guetta", "Daft Punk", "Justice", "Martin Garrix", "Avicii",
    "Calvin Harris", "Swedish House Mafia", "Deadmau5", "Cassius",
    "Bob Sinclar", "Kungs", "Ofenbach", "Petit Biscuit", "Stromae",
    "Zedd", "Kygo", "Marshmello", "Alan Walker", "The Chainsmokers",
    "Tiësto", "Armin van Buuren", "Skrillex", "Diplo", "Major Lazer",
    "Fisher", "Duke Dumont", "Robin Schulz", "Alesso", "Nicky Romero",
    "DJ Snake", "Gesaffelstein", "Vitalic", "Etienne de Crécy",
    "Breakbot", "Chromeo", "Klingande", "Feder", "Jonas Blue",
    "Sam Feldt", "Disclosure",
  ],
  "Rock": [
    "The Rolling Stones", "Queen", "Led Zeppelin", "Pink Floyd", "AC/DC",
    "U2", "Dire Straits", "Nirvana", "Guns N' Roses", "The Beatles",
    "Fleetwood Mac", "Eagles", "Deep Purple", "The Who", "Metallica",
    "Bon Jovi", "Aerosmith", "Van Halen", "Journey", "Bruce Springsteen",
    "David Bowie", "Elton John", "The Cure", "The Police", "Genesis",
    "Yes", "Rush", "Black Sabbath", "Iron Maiden", "Def Leppard",
    "Scorpions", "ZZ Top", "Creedence Clearwater Revival", "The Doors",
    "Jimi Hendrix", "Eric Clapton", "Santana", "Simple Minds", "INXS",
    "R.E.M.", "Pearl Jam", "Soundgarden", "Radiohead", "Oasis", "Blur",
  ],
  "R&B / Soul": [
    "Whitney Houston", "Stevie Wonder", "Marvin Gaye", "Alicia Keys",
    "Aretha Franklin", "Usher", "Sam Cooke", "Al Green", "John Legend",
    "Erykah Badu", "D'Angelo", "The Weeknd", "SZA", "Frank Ocean",
    "Mary J. Blige", "Chris Brown", "Ne-Yo", "Trey Songz", "Boyz II Men",
    "TLC", "Destiny's Child", "En Vogue", "Toni Braxton", "Brandy",
    "Monica", "Jill Scott", "Anderson .Paak", "H.E.R.", "Lauryn Hill",
    "Musiq Soulchild", "Miguel", "Bryson Tiller", "Khalid", "Jhené Aiko",
    "Solange", "Ella Mai",
  ],
  "Rap US": [
    "Eminem", "Jay-Z", "Kanye West", "Drake", "50 Cent", "Snoop Dogg",
    "Kendrick Lamar", "Dr. Dre", "Nas", "Travis Scott", "Cardi B",
    "Kid Cudi", "Post Malone", "2Pac", "The Notorious B.I.G.",
    "Lil Wayne", "Nicki Minaj", "J. Cole", "Future", "Lil Baby",
    "DaBaby", "21 Savage", "Megan Thee Stallion", "Missy Elliott",
    "Ludacris", "T.I.", "Rick Ross", "Wiz Khalifa", "Big Sean",
    "Chance the Rapper", "A$AP Rocky", "Migos", "Playboi Carti",
    "Doja Cat", "Ice Cube", "LL Cool J", "Run-DMC", "Public Enemy",
    "OutKast",
  ],
  "Reggaeton / Latino": [
    "Shakira", "Manu Chao", "Ricky Martin", "Bad Bunny", "J Balvin",
    "Enrique Iglesias", "Daddy Yankee", "Ozuna", "Karol G", "Rosalía",
    "Luis Fonsi", "Maluma", "Anuel AA", "Nicky Jam", "Wisin & Yandel",
    "Don Omar", "Farruko", "Sech", "Rauw Alejandro", "Myke Towers",
    "Feid", "Camilo", "Sebastián Yatra", "Marc Anthony", "Romeo Santos",
    "Prince Royce", "Thalía", "Paulina Rubio", "Jesse & Joy", "Juanes",
    "Carlos Vives",
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
