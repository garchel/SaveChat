-- NoteThread — Supabase schema (free tier)
-- Rodar no SQL Editor do Supabase. Ativa Realtime e RLS por usuário (auth.uid()).

-- 1. Tabelas
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz default now()
);

create table if not exists folders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id text,
  emoji text,
  color text,
  created_at timestamptz default now()
);

create table if not exists threads (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  folder_id text references folders(id) on delete set null,
  favorite boolean default false,
  pinned_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_preview text,
  ordering integer default 0
);

create table if not exists notes (
  client_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id text not null references threads(id) on delete cascade,
  text text,
  images jsonb default '[]'::jsonb,
  tags text[] default '{}',
  ts bigint not null,
  sort_order integer,
  edited boolean default false,
  edited_at bigint,
  rev integer default 0,
  remind_at bigint,
  remind_fired boolean default false,
  created_at timestamptz default now()
);

-- migração para bancos já criados antes de remind_at
alter table notes add column if not exists remind_at bigint;
alter table notes add column if not exists remind_fired boolean default false;
alter table threads add column if not exists color text;
alter table folders add column if not exists color text;

-- v1.8.0: reações por nota ({ "❤️": [userId, ...], ... }) — payloads antigos
-- sem a coluna não podem zerar as reações locais (merge só sobrescreve se o campo veio)
alter table notes add column if not exists reactions jsonb default '{}'::jsonb;

-- 2. RLS
alter table profiles enable row level security;
alter table folders enable row level security;
alter table threads enable row level security;
alter table notes enable row level security;

drop policy if exists "own profiles" on profiles;
create policy "own profiles" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own folders" on folders;
create policy "own folders" on folders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own threads" on threads;
create policy "own threads" on threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own notes" on notes;
create policy "own notes" on notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. Realtime (idempotente: ignora se a tabela já está na publicação)
do $$ begin
  alter publication supabase_realtime add table threads;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table notes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table folders;
exception when duplicate_object then null; end $$;

-- 4. Índices
create index if not exists notes_thread_ts on notes(thread_id, ts);
create index if not exists threads_user_updated on threads(user_id, updated_at desc);

-- 5. Storage para imagens (substitui base64 — R6.7)
insert into storage.buckets (id, name, public) values ('note-images', 'note-images', true) on conflict (id) do nothing;

do $$ begin
  create policy "own images" on storage.objects for all
    using (bucket_id = 'note-images' and auth.uid() = owner)
    with check (bucket_id = 'note-images' and auth.uid() = owner);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public read images" on storage.objects for select
    using (bucket_id = 'note-images');
exception when duplicate_object then null; end $$;

-- 6. Hardening (v1.4.0): o event trigger de auto-RLS não precisa ser
-- executável via PostgREST/RPC — revoga acesso público (advisors Supabase).
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
