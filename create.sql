-- create.sql
-- Supabase schema for my-supabase-chat

create table if not exists public.rooms (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  username text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_created_at on public.messages (created_at desc);
create index if not exists idx_rooms_name on public.rooms (name);
