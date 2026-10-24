"use client";

import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  featuredDeezerPlaylists,
  getDeezerPlaylistInfo,
  getDeezerPlaylistTracks,
  playlistIdFromLink,
  searchDeezerPlaylists,
  type DeezerPlaylistSummary,
  type QueueTrack,
} from "../../lib/deezer";

// Recherches rapides proposées sans rien taper.
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
  const [notice, setNotice] = useState<string | null>(null);

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
    setNotice(null);
    try {
      const { tracks, skipped } = await getDeezerPlaylistTracks(p.id);
      if (tracks.length === 0) {
        setError("Aucun morceau de cette playlist n’a d’extrait disponible.");
        return;
      }
      onImport(tracks, p);
      setImported((m) => ({ ...m, [p.id]: tracks.length }));
      if (skipped > 0) setNotice(`${tracks.length} morceaux ajoutés (${skipped} sans extrait ignorés).`);
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
      {notice && <p className="text-sm text-inkMuted font-bold">{notice}</p>}

      <p className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">{label}</p>
      {results === null ? (
        <p className="text-sm text-inkMuted animate-pulse">Chargement…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-inkMuted">Aucune playlist trouvée.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {results.map((p) => {
            const done = imported[p.id];
            return (
              <li key={p.id} className="flex items-center gap-3 bg-inkSurface border-2 border-fg rounded-xl p-2 pr-3">
                {p.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.pictureUrl} alt="" className="w-12 h-12 rounded-lg border-2 border-fg object-cover shrink-0" />
                ) : (
                  <span className="w-12 h-12 rounded-lg border-2 border-fg bg-inkSurface3 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{p.title}</span>
                  <span className="block text-xs text-inkMuted truncate">
                    {p.trackCount} morceaux{p.creator ? ` · ${p.creator}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => importPlaylist(p)}
                  disabled={disabled || importingId !== null}
                  className={`shrink-0 border-2 border-fg shadow-sticker-sm rounded-xl px-3 py-1.5 text-sm font-bold whitespace-nowrap disabled:opacity-50 ${
                    done ? "bg-good" : "bg-inkSurface"
                  }`}
                >
                  {importingId === p.id ? (
                    "Import…"
                  ) : done ? (
                    <span className="inline-flex items-center gap-1">
                      <Check className="w-4 h-4" /> {done} ajoutés
                    </span>
                  ) : (
                    "+ Importer"
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-inkMuted">Musique fournie par Deezer · extraits de 30 secondes.</p>
    </div>
  );
}
