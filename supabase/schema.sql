-- Logique : table de sauvegarde de la progression.
-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.
--
-- Une ligne par utilisateur ; chacun ne peut lire et écrire QUE sa propre ligne
-- (sécurité au niveau des lignes, RLS). La clé publique de l'application ne permet rien d'autre.

create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  -- Garde-fou : une progression pèse quelques dizaines de Ko ; on refuse au-delà de 1 Mo.
  constraint progress_taille check (pg_column_size(data) < 1000000)
);

alter table public.progress enable row level security;

drop policy if exists "progress_select_own" on public.progress;
drop policy if exists "progress_insert_own" on public.progress;
drop policy if exists "progress_update_own" on public.progress;
drop policy if exists "progress_delete_own" on public.progress;

create policy "progress_select_own" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "progress_insert_own" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "progress_update_own" on public.progress
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "progress_delete_own" on public.progress
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Les visiteurs non connectés n'ont aucun accès.
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;
