  -- À exécuter une seule fois dans Supabase > SQL Editor.
  create table if not exists public.film_marks (
    user_id uuid not null references auth.users(id) on delete cascade,
    film_id text not null,
    favorite boolean not null default false,
    watched boolean not null default false,
    user_rating integer check (user_rating between 1 and 5),
    watched_at date,
    updated_at timestamptz not null default now(),
    primary key (user_id, film_id)
  );

  -- Migration pour les bases existantes : ajouter les colonnes si elles n'existent pas.
  alter table public.film_marks add column if not exists user_rating integer check (user_rating between 1 and 5);
  alter table public.film_marks add column if not exists watched_at date;

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

  -- Musiques favorites : morceaux de BO (identifiant Deezer) rattachés au film.
  -- Bloc ré-exécutable seul sur une base existante.
  create table if not exists public.music_favorites (
    user_id uuid not null references auth.users(id) on delete cascade,
    film_id text not null,
    deezer_id text not null,
    title text not null,
    artist text not null default '',
    link text,
    film_title text not null default '',
    film_year integer,
    created_at timestamptz not null default now(),
    primary key (user_id, film_id, deezer_id)
  );

  alter table public.music_favorites enable row level security;

  drop policy if exists "Users can read their own music favorites" on public.music_favorites;
  create policy "Users can read their own music favorites"
  on public.music_favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

  drop policy if exists "Users can insert their own music favorites" on public.music_favorites;
  create policy "Users can insert their own music favorites"
  on public.music_favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

  drop policy if exists "Users can update their own music favorites" on public.music_favorites;
  create policy "Users can update their own music favorites"
  on public.music_favorites for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

  drop policy if exists "Users can delete their own music favorites" on public.music_favorites;
  create policy "Users can delete their own music favorites"
  on public.music_favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

  -- Écoutes des extraits de BO, pour le classement des morceaux les plus écoutés.
  -- Bloc ré-exécutable seul sur une base existante.
  create table if not exists public.music_plays (
    user_id uuid not null references auth.users(id) on delete cascade,
    film_id text not null,
    deezer_id text not null,
    title text not null,
    artist text not null default '',
    link text,
    film_title text not null default '',
    film_year integer,
    play_count integer not null default 0 check (play_count >= 0),
    last_played_at timestamptz not null default now(),
    primary key (user_id, film_id, deezer_id)
  );

  alter table public.music_plays enable row level security;

  drop policy if exists "Users can read their own music plays" on public.music_plays;
  create policy "Users can read their own music plays"
  on public.music_plays for select
  to authenticated
  using ((select auth.uid()) = user_id);

  drop policy if exists "Users can insert their own music plays" on public.music_plays;
  create policy "Users can insert their own music plays"
  on public.music_plays for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

  drop policy if exists "Users can update their own music plays" on public.music_plays;
  create policy "Users can update their own music plays"
  on public.music_plays for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

  -- Incréments atomiques : deux appareils additionnent leurs écoutes au lieu de s'écraser.
  -- security invoker : les règles RLS ci-dessus s'appliquent.
  create or replace function public.add_music_plays(plays jsonb)
  returns void
  language sql
  security invoker
  set search_path = ''
  as $$
    insert into public.music_plays as m
      (user_id, film_id, deezer_id, title, artist, link, film_title, film_year, play_count, last_played_at)
    select (select auth.uid()), p->>'film_id', p->>'deezer_id', p->>'title', coalesce(p->>'artist', ''),
      p->>'link', coalesce(p->>'film_title', ''), (p->>'film_year')::integer,
      (p->>'count')::integer, coalesce((p->>'last_played_at')::timestamptz, now())
    from jsonb_array_elements(plays) as p
    where (p->>'count')::integer > 0
    on conflict (user_id, film_id, deezer_id) do update set
      play_count = m.play_count + excluded.play_count,
      last_played_at = greatest(m.last_played_at, excluded.last_played_at),
      title = excluded.title,
      artist = excluded.artist,
      link = excluded.link,
      film_title = excluded.film_title,
      film_year = excluded.film_year;
  $$;

  revoke execute on function public.add_music_plays(jsonb) from public, anon;
  grant execute on function public.add_music_plays(jsonb) to authenticated;
