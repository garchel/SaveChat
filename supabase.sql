-- NoteThread — Supabase schema (free tier)
-- Rodar no SQL Editor do Supabase. Ativa Realtime e RLS por usuário (auth.uid()).

-- 1. Tabelas
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  created_at timestamptz default now()
);

-- Chaves E2E: a senha nunca chega ao servidor. A DEK só existe embrulhada
-- pela senha (wrapped_dek) e pelo código de recuperação (recovery_wrapped_dek).
create table if not exists user_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  salt text not null,
  kdf text not null default 'PBKDF2-SHA256',
  kdf_iterations integer not null default 600000,
  wrapped_dek jsonb not null,
  recovery_wrapped_dek jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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
  -- AUDIO (v1.13.7): mensagem de voz. Guarda a URL do bucket note-audio,
  -- a duracao em segundos e o waveform (picos normalizados) para o player
  -- desenhar as barrinhas sem ter que decodificar o audio de novo.
  audio jsonb,
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

-- Fase 1 (E2E): colunas de ciphertext convivem com as antigas durante a
-- migração. O cliente lê a cifrada quando existir e limpa a clara ao salvar.
alter table notes add column if not exists text_enc jsonb;
alter table notes add column if not exists enc_version integer;
alter table threads add column if not exists name_enc jsonb;
alter table threads add column if not exists last_preview_enc jsonb;

-- 2. RLS
alter table profiles enable row level security;
alter table user_keys enable row level security;
alter table folders enable row level security;
alter table threads enable row level security;
alter table notes enable row level security;

drop policy if exists "own profiles" on profiles;
create policy "own profiles" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own keys" on user_keys;
create policy "own keys" on user_keys for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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

-- 5. Storage para imagens (substitui base64 — R6.7). Bucket privado: o app
-- resolve o path em URL assinada de curta duracao; sem token, nao ha leitura.
insert into storage.buckets (id, name, public)
  values ('note-images', 'note-images', false)
  on conflict (id) do update set public = false;

do $$ begin
  create policy "own images" on storage.objects for all
    using (bucket_id = 'note-images' and auth.uid() = owner)
    with check (bucket_id = 'note-images' and auth.uid() = owner);
exception when duplicate_object then null; end $$;

drop policy if exists "public read images" on storage.objects;

-- 5b. Storage de audio das mensagens de voz (v1.13.7). Privado pelo mesmo
-- motivo: player e transcricao usam URL assinada/path, nunca link publico.
do $$ begin
  alter table notes add column if not exists audio jsonb;
exception when duplicate_column then null; end $$;

insert into storage.buckets (id, name, public, file_size_limit)
  values ('note-audio', 'note-audio', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

do $$ begin
  create policy "own audio" on storage.objects for all
    using (bucket_id = 'note-audio' and auth.uid() = owner)
    with check (bucket_id = 'note-audio' and auth.uid() = owner);
exception when duplicate_object then null; end $$;

drop policy if exists "public read audio" on storage.objects;

-- 6. Hardening (v1.4.0): o event trigger de auto-RLS não precisa ser
-- executável via PostgREST/RPC — revoga acesso público (advisors Supabase).
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- 7. Corte da Fase 1 (1c): rejeita texto claro DEPOIS que o backfill de todos
-- os usuários terminar. A flag nasce desligada de propósito — ligar antes da
-- hora faz clientes antigos perderem gravações.
create table if not exists app_config (
  id boolean primary key default true,
  encryption_enforced boolean not null default false,
  min_client_version text,
  updated_at timestamptz default now(),
  constraint app_config_singleton check (id)
);

insert into app_config (id) values (true) on conflict (id) do nothing;

alter table app_config enable row level security;

-- leitura pública: o cliente precisa saber que o corte está ligado e qual a
-- versão mínima. Escrita NÃO tem policy — só service_role/dashboard altera.
drop policy if exists "config read" on app_config;
create policy "config read" on app_config for select using (true);

create or replace function public.notethread_reject_plaintext() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((select encryption_enforced from app_config where id), false) then
    if tg_table_name = 'notes' and new.text is not null then
      raise exception 'notethread: plaintext rejected (encryption enforced)'
        using errcode = 'P0001', hint = 'Grave o conteúdo em text_enc e deixe text nulo.';
    end if;
    if tg_table_name = 'threads' and coalesce(new.last_preview, '') <> '' then
      raise exception 'notethread: plaintext rejected (encryption enforced)'
        using errcode = 'P0001', hint = 'Grave a prévia em last_preview_enc e deixe last_preview vazio.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists notes_no_plaintext on notes;
create trigger notes_no_plaintext
  before insert or update on notes
  for each row execute function public.notethread_reject_plaintext();

drop trigger if exists threads_no_plaintext on threads;
create trigger threads_no_plaintext
  before insert or update on threads
  for each row execute function public.notethread_reject_plaintext();

revoke execute on function public.notethread_reject_plaintext() from anon, authenticated, public;

-- Ligar o corte (só quando o backfill do usuário tiver terminado):
--   update app_config set encryption_enforced = true, min_client_version = '1.27.0' where id;
-- Desligar (emergência):
--   update app_config set encryption_enforced = false where id;
