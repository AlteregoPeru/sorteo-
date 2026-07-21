-- EJECUTA TODO ESTE ARCHIVO EN SUPABASE > SQL EDITOR.
create extension if not exists pgcrypto;
create sequence if not exists public.participant_number_seq start 1;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  participant_number text unique not null default ('AE-' || lpad(nextval('public.participant_number_seq')::text, 6, '0')),
  first_name text not null check (char_length(trim(first_name)) between 2 and 80),
  last_name text not null check (char_length(trim(last_name)) between 2 and 80),
  document_type text not null check (document_type in ('DNI','CE','PASAPORTE')),
  document_number text unique not null,
  phone text unique not null,
  email text unique not null,
  instagram text unique,
  follows_instagram boolean not null default false,
  shared_with text,
  consent boolean not null default false,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);


-- Migración para instalaciones anteriores: el documento vuelve a ser obligatorio.
alter table public.participants add column if not exists document_type text;
alter table public.participants add column if not exists document_number text;
-- Si existen registros antiguos sin documento, complétalos antes de ejecutar estas dos líneas.
alter table public.participants alter column document_type set not null;
alter table public.participants alter column document_number set not null;
alter table public.participants add column if not exists instagram text;
-- Normaliza valores existentes y evita cadenas vacías.
update public.participants set instagram = null where instagram is not null and btrim(instagram) = '';

alter table public.participants add column if not exists follows_instagram boolean not null default false;
alter table public.participants add column if not exists shared_with text;
create unique index if not exists participants_document_unique
  on public.participants (document_type, upper(document_number));
create unique index if not exists participants_instagram_unique
  on public.participants (lower(instagram)) where instagram is not null;

-- Si la tabla ya existía, agrega el valor automático al número de participación.
alter table public.participants
  alter column participant_number set default ('AE-' || lpad(nextval('public.participant_number_seq')::text, 6, '0'));

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.winners (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id),
  selected_by uuid not null references auth.users(id),
  email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  unique(participant_id)
);

-- Administrador configurado por el usuario.
insert into public.admin_users (user_id)
values ('b457be5c-41aa-4bef-a06e-956b88bc2b55')
on conflict (user_id) do nothing;

alter table public.participants enable row level security;
alter table public.admin_users enable row level security;
alter table public.winners enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.admin_users where user_id=auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "admins read participants" on public.participants;
drop policy if exists "admins read own admin row" on public.admin_users;
drop policy if exists "admins read winners" on public.winners;

create policy "admins read participants" on public.participants
for select to authenticated using (public.is_admin());
create policy "admins read own admin row" on public.admin_users
for select to authenticated using (user_id=auth.uid());
create policy "admins read winners" on public.winners
for select to authenticated using (public.is_admin());

-- El público no puede leer ni insertar directamente. El registro entra por Edge Function.
grant usage on schema public to authenticated;
grant select on public.participants, public.winners, public.admin_users to authenticated;

-- Realtime opcional para pantallas de resultado.
do $$ begin
  alter publication supabase_realtime add table public.winners;
exception when duplicate_object then null; end $$;
