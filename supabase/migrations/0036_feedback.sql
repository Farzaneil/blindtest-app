-- 0036 — Retours de la bêta (bouton « ! » présent sur toutes les pages).
--
-- Chaque envoi du formulaire est gardé ici, en plus du mail envoyé à
-- contact@kazouband.fr (voir app/api/feedback/route.ts) : rien ne se perd si
-- un mail n'arrive pas, et on peut compter les retours par sujet.
-- La capture d'écran éventuelle n'est PAS stockée en base : elle part
-- seulement en pièce jointe du mail (has_screenshot le signale).
--
-- Écrite uniquement par la route serveur (clé service_role) : RLS activée,
-- aucun droit pour anon / authenticated (règle des grants explicites, 0034).

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('bug', 'idee', 'avis')),
  topic text not null,
  severity text check (severity in ('bloquant', 'genant', 'detail')),
  message text not null check (char_length(message) between 1 and 2000),
  email text,
  account_id uuid references public.player_accounts (id) on delete set null,
  room_code text,
  role text,
  page text,
  user_agent text,
  viewport text,
  app_version text,
  client_errors jsonb not null default '[]'::jsonb,
  has_screenshot boolean not null default false,
  mail_sent boolean not null default false
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant select, insert, update, delete on public.feedback to service_role;

-- Durée de conservation (voir 0035) : les retours sont supprimés au bout de
-- 12 mois, comme les parties.
create or replace function purge_old_data()
returns json as $$
declare
  v_accounts int;
  v_rooms int;
  v_feedback int;
begin
  with gone as (
    delete from player_accounts
    where last_seen_at < now() - interval '3 years'
    returning auth_user_id
  ),
  gone_auth as (
    delete from auth.users where id in (select auth_user_id from gone where auth_user_id is not null)
  )
  select count(*) into v_accounts from gone;

  delete from rooms where created_at < now() - interval '12 months';
  get diagnostics v_rooms = row_count;

  delete from feedback where created_at < now() - interval '12 months';
  get diagnostics v_feedback = row_count;

  delete from rate_limits where window_start < now() - interval '1 day';

  return json_build_object('accounts_deleted', v_accounts, 'rooms_deleted', v_rooms, 'feedback_deleted', v_feedback);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function purge_old_data() from public, anon, authenticated;
