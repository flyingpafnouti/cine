  -- À exécuter une seule fois dans Supabase > SQL Editor.
  create table if not exists public.film_marks (
    user_id uuid not null references auth.users(id) on delete cascade,
    film_id text not null,
    favorite boolean not null default false,
    watched boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (user_id, film_id)
  );

  alter table public.film_marks enable row level security;

  create policy "Users can read their own film marks"
  on public.film_marks for select
  to authenticated
  using ((select auth.uid()) = user_id);

  create policy "Users can insert their own film marks"
  on public.film_marks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

  create policy "Users can update their own film marks"
  on public.film_marks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

  create index if not exists film_marks_updated_at_idx
  on public.film_marks (user_id, updated_at desc);
