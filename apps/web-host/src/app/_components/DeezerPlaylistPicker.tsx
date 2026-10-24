"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  featuredDeezerPlaylists,
  getDeezerPlayableCount,
  getDeezerPlaylistInfo,
  getDeezerPlaylistTracks,
  playlistIdFromLink,
  searchDeezerPlaylists,
  type DeezerPlaylistSummary,
  type QueueTrack,
} from "../../lib/deezer";

// Recherches rapides proposées sans rien taper.
// Comptages "morceaux jouables" lancés en parallèle au maximum (l'API
// Deezer limite à ~50 requêtes / 5 s, une grosse playlist en coûte 5).
const MAX_CONCURRENT_COUNTS = 3;

/**
 * Ligne de playlist : signale quand elle devient visible (dans la liste
 * défilante), pour ne compter les morceaux jouables que des playlists
 * réellement affichées.
 */
function VisibleRow({ onVisible, children }: { onVisible: () => void; children: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onVisibleRef.current();
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <li ref={ref} className="flex items-center gap-3 bg-inkSurface border-2 border-fg rounded-xl p-2 pr-3">
      {children}
    </li>
  );
}

const QUICK_SEARCHES = [
  "Blind test",
  "Années 80",
  "Années 90",
  "Années 2000",
  "Rap français",
  "Variété française",
  "Disney",
  "Rock",
  "Dance",
  "Séries TV",
];

/**
 * Recherche et import de playlists Deezer publiques (source "Deezer",
 * extraits de 30 s, sans compte). Affiche les playlists du moment au
 * départ ; accepte aussi un lien de playlist Deezer collé dans la barre.
 */
export function DeezerPlaylistPicker({
  onImport,
  disabled = false,
}: {
  onImport: (tracks: QueueTrack[], playlist: DeezerPlaylistSummary) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeezerPlaylistSummary[] | null>(null);
  const [label, setLabel] = useState("Playlists du moment");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [imported, setImported] = useState<Record<string, number>>({});
  // Nombre de morceaux JOUABLES (avec extrait) par playlist : c'est le seul
  // chiffre affiché, pour qu'il corresponde exactement à ce qui arrive dans
  // la file à l'import. Calculé à la volée pour les lignes visibles (mis en
  // cache 1 h côté serveur, voir getPlayableTracks).
  const [counts, setCounts] = useState<Record<string, number | "error">>({});
  const requested = useRef(new Set<string>());
  const pending = useRef<string[]>([]);
  const active = useRef(0);

  const pump = () => {
    while (active.current < MAX_CONCURRENT_COUNTS && pending.current.length > 0) {
      const id = pending.current.shift()!;
      active.current += 1;
      getDeezerPlayableCount(id)
        .then((n) => setCounts((c) => ({ ...c, [id]: n })))
        .catch(() => {
          // Réessayé à la prochaine apparition de la ligne.
          requested.current.delete(id);
          setCounts((c) => ({ ...c, [id]: "error" }));
        })
        .finally(() => {
          active.current -= 1;
          pump();
        });
    }
  };

  const requestCount = (id: string) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    pending.current.push(id);
    pump();
  };

  useEffect(() => {
    let cancelled = false;
    featuredDeezerPlaylists()
      .then((p) => {
        if (!cancelled) setResults(p);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runSearch = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      const linkId = playlistIdFromLink(text);
      if (linkId) {
        setResults([await getDeezerPlaylistInfo(linkId)]);
        setLabel("Playlist du lien");
      } else {
        setResults(await searchDeezerPlaylists(text));
        setLabel(`Résultats pour « ${text} »`);
      }
    } catch (e: any) {
      setError(e?.message ?? "Recherche impossible.");
    } finally {
      setLoading(false);
    }
  };

  const importPlaylist = async (p: DeezerPlaylistSummary) => {
    setImportingId(p.id);
    setError(null);
    try {
      const tracks = await getDeezerPlaylistTracks(p.id);
      setCounts((c) => ({ ...c, [p.id]: tracks.length }));
      if (tracks.length === 0) {
        setError("Aucun morceau de cette playlist n’a d’extrait disponible.");
        return;
      }
      onImport(tracks, p);
      setImported((m) => ({ ...m, [p.id]: tracks.length }));
    } catch (e: any) {
      setError(e?.message ?? "Import impossible.");
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
      >
        <label className="flex-1 min-w-0 flex items-center gap-2 bg-inkSurface border-2 border-fg rounded-xl px-3 py-2">
          <Search className="w-4 h-4 shrink-0 text-inkMuted" />
          <span className="sr-only">Rechercher une playlist Deezer</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une playlist, ou coller un lien Deezer"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="bg-sage text-fg border-2 border-fg shadow-sticker-sm rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          {loading ? "…" : "Chercher"}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_SEARCHES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setQuery(q);
              runSearch(q);
            }}
            className="bg-inkSurface border-2 border-fg rounded-full px-3 py-1 text-xs font-bold transition-transform hover:-translate-y-0.5"
          >
            {q}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-danger font-bold">{error}</p>}

      <p className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">{label}</p>
      {results === null ? (
        <p className="text-sm text-inkMuted animate-pulse">Chargement…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-inkMuted">Aucune playlist trouvée.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {results.map((p) => {
            const done = imported[p.id];
            const count = counts[p.id];
            const empty = count === 0;
            return (
              <VisibleRow key={p.id} onVisible={() => requestCount(p.id)}>
                {p.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.pictureUrl} alt="" className="w-12 h-12 rounded-lg border-2 border-fg object-cover shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-lg border-2 border-fg bg-inkSurface3 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-bold leading-tight line-clamp-2 break-words" title={p.title}>
                    {p.title}
                  </span>
                  <span className="block mt-0.5 text-xs text-inkMuted truncate">
                    {count === undefined ? (
                      <span className="animate-pulse">… morceaux</span>
                    ) : count === "error" ? (
                      // Comptage impossible pour l'instant : total annoncé par Deezer.
                      `${p.trackCount} morceaux`
                    ) : empty ? (
                      "Aucun extrait disponible"
                    ) : (
                      `${count} morceau${count > 1 ? "x" : ""}`
                    )}
                    {p.creator ? ` · ${p.creator}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => importPlaylist(p)}
                  disabled={disabled || importingId !== null || empty}
                  aria-label={done ? `${p.title} : ${done} morceaux ajoutés` : `Importer ${p.title}`}
                  // Téléphone : bouton compact (icône seule) pour laisser la
                  // place au titre de la playlist ; libellé complet dès sm.
                  className={`shrink-0 inline-flex items-center justify-center gap-1 min-w-[40px] min-h-[40px] border-2 border-fg shadow-sticker-sm rounded-xl px-2 sm:px-3 py-1.5 text-sm font-bold whitespace-nowrap disabled:opacity-50 ${
                    done ? "bg-good" : "bg-inkSurface"
                  }`}
                >
                  {importingId === p.id ? (
                    <span className="animate-pulse">…</span>
                  ) : done ? (
                    <>
                      <Check className="w-4 h-4" strokeWidth={3} />
                      <span className="hidden sm:inline">{done} ajoutés</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={3} />
                      <span className="hidden sm:inline">Importer</span>
                    </>
                  )}
                </button>
              </VisibleRow>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-inkMuted">Musique fournie par Deezer · extraits de 30 secondes.</p>
    </div>
  );
}
