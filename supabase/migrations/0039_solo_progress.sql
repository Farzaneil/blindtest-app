-- 0039 — Progression du mode solo « La Tournée », enregistrée sur le compte joueur.
--
-- Une ligne par compte : la progression entière en JSON (étoiles et record
-- par niveau, bonus en stock, morceaux déjà trouvés par monde ; voir
-- apps/web-host/src/lib/solo/progress.ts). Le mode solo exige d'être
-- connecté : on retrouve sa tournée sur n'importe quel appareil.
--
-- Lue et écrite uniquement par la route serveur /api/solo/progress (clé
-- service_role, identité tirée du cookie de session signé) : RLS activée,
-- aucun droit pour anon / authenticated (règle des grants explicites, 0034).
-- Supprimée avec le compte (on delete cascade), donc aussi par la purge des
-- comptes inactifs depuis 3 ans (0035).

create table if not exists public.solo_progress (
  account_id uuid primary key references public.player_accounts (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.solo_progress enable row level security;
revoke all on public.solo_progress from anon, authenticated;
grant select, insert, update, delete on public.solo_progress to service_role;
