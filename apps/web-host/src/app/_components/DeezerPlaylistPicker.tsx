"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Plus, Search } from "lucide-react";
import {
  getDeezerPlayableCount,
  getDeezerPlaylistInfo,
  getDeezerPlaylistTracks,
  playlistIdFromLink,
  searchDeezerPlaylists,
  type DeezerPlaylistSummary,
  type QueueTrack,
  withAnswerMode,
} from "../../lib/deezer";
import { THEMES, THEME_BY_ID, answerModeHint } from "../../lib/themes";
import type { AnswerMode } from "../../lib/answers";

/** Nos playlists proposées, sous la forme des résultats de recherche. */
const THEME_SUMMARIES: DeezerPlaylistSummary[] = THEMES.map((t) => ({
  id: t.id,
  title: t.title,
  trackCount: 0,
  pictureUrl: `https://api.deezer.com/playlist/${t.id}/image`,
  creator: null,
}));
const THEMES_LABEL = "Nos playlists";

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

/**
 * Recherche et import de playlists Deezer publiques (source "Deezer",
 * extraits de 30 s, sans compte). Affiche nos playlists thématiques au
 * départ (lib/themes.ts, type de réponse déjà réglé) ; une playlist trouvée
 * par la recherche ou par un lien collé demande, à l'import, ce qu'il faut
 * trouver : « Titre + artiste » ou « Film / série ».
 */
export function DeezerPlaylistPicker({
  onImport,
  importedCounts,
  disabled = false,
}: {
  onImport: (tracks: QueueTrack[], playlist: DeezerPlaylistSummary) => void;
  // Morceaux encore à venir dans la file, par playlist Deezer (id brut) :
  // calculé par l'hôte à partir de la file elle-même, pour que le badge
  // "x ajoutés" disparaisse dès que ces morceaux en sont retirés.
  importedCounts: Record<string, number>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DeezerPlaylistSummary[] | null>(THEME_SUMMARIES);
  const [label, setLabel] = useState(THEMES_LABEL);
  // Playlist (hors thèmes) dont on demande le type de réponse avant l'import.
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
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

  const importPlaylist = async (p: DeezerPlaylistSummary, mode: AnswerMode) => {
    setChoosingId(null);
    setImportingId(p.id);
    setError(null);
    try {
      const tracks = await getDeezerPlaylistTracks(p.id);
      setCounts((c) => ({ ...c, [p.id]: tracks.length }));
      if (tracks.length === 0) {
        setError("Aucun morceau de cette playlist n’a d’extrait disponible.");
        return;
      }
      onImport(withAnswerMode(tracks, mode), p);
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

      {label !== THEMES_LABEL && (
        <button
          type="button"
          onClick={() => {
            setResults(THEME_SUMMARIES);
            setLabel(THEMES_LABEL);
            setQuery("");
            setChoosingId(null);
          }}
          className="self-start text-xs font-bold underline text-inkMuted hover:text-fg"
        >
          ← Revenir à nos playlists
        </button>
      )}

      {error && <p className="text-sm text-danger font-bold">{error}</p>}

      <p className="text-xs font-extrabold uppercase tracking-wide text-inkMuted">{label}</p>
      {results === null ? (
        <p className="text-sm text-inkMuted animate-pulse">Chargement…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-inkMuted">Aucune playlist trouvée.</p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto pr-1">
          {results.map((p) => {
            const done = importedCounts[p.id];
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
                  {THEME_BY_ID[p.id] && answerModeHint(THEME_BY_ID[p.id].answerMode) && (
                    <span className="block text-xs font-bold text-fg">{answerModeHint(THEME_BY_ID[p.id].answerMode)}</span>
                  )}
                </span>
                {choosingId === p.id ? (
                  <span className="shrink-0 flex flex-col gap-1">
                    <span className="text-[11px] font-extrabold text-inkMuted text-center">À trouver :</span>
                    <button
                      type="button"
                      onClick={() => importPlaylist(p, "classic")}
                      className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap"
                    >
                      Titre + artiste
                    </button>
                    <button
                      type="button"
                      onClick={() => importPlaylist(p, "work")}
                      className="bg-inkSurface border-2 border-fg shadow-sticker-sm rounded-lg px-2 py-1 text-xs font-bold whitespace-nowrap"
                    >
                      Film / série
                    </button>
                  </span>
                ) : (
                <button
                  type="button"
                  onClick={() => {
                    const theme = THEME_BY_ID[p.id];
                    if (theme) importPlaylist(p, theme.answerMode);
                    else setChoosingId(p.id);
                  }}
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
                )}
              </VisibleRow>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-inkMuted">Musique fournie par Deezer · extraits de 30 secondes.</p>
    </div>
  );
}
