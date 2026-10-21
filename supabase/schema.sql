-- ClearNote Sheets: database setup
-- Run once in Supabase: SQL Editor > New query > paste this file > Run.
-- Safe to run again; it updates what is already there.

-- 1) Sheets --------------------------------------------------------------
create table if not exists public.sheets (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[^/?#[:space:]]+$'),
  title           text not null check (length(btrim(title)) > 0),
  artist          text not null check (length(btrim(artist)) > 0),
  album           text,
  price           numeric(8,2) not null check (price >= 0),
  musical_key     text,
  bpm             integer check (bpm between 20 and 400),
  time_signature  text,
  release_date    date,
  cover_path      text,
  preview_path    text,
  payhip_key      text not null check (payhip_key ~ '^[A-Za-z0-9]+$'),
  is_new_release  boolean not null default false,
  published       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sheets_published_created_idx on public.sheets (published, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists sheets_touch_updated_at on public.sheets;
create trigger sheets_touch_updated_at before update on public.sheets
  for each row execute function public.touch_updated_at();

-- 2) Admins --------------------------------------------------------------
-- The email addresses allowed to manage the store.
-- To add someone: Table Editor > admins > Insert row > type their email. No code needed.
create table if not exists public.admins (
  email     text primary key,
  added_at  timestamptz not null default now()
);

-- Upgrade from the first version of this file, which listed admins by user id.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'admins' and column_name = 'user_id') then
    alter table public.admins add column if not exists email text;
    update public.admins a set email = lower(u.email) from auth.users u where u.id = a.user_id and a.email is null;
    delete from public.admins where email is null;
    alter table public.admins drop constraint if exists admins_pkey;
    alter table public.admins drop column user_id;
    alter table public.admins alter column email set not null;
    alter table public.admins add primary key (email);
  end if;
end $$;

-- Emails are stored lower-case, however they're typed in.
create or replace function public.admins_clean_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email = lower(btrim(new.email));
  return new;
end $$;
drop trigger if exists admins_clean_email on public.admins;
create trigger admins_clean_email before insert or update on public.admins
  for each row execute function public.admins_clean_email();

alter table public.admins enable row level security;   -- no policies: not readable through the API

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 3) Who can see and change sheets ---------------------------------------
alter table public.sheets enable row level security;

drop policy if exists "Anyone can read published sheets" on public.sheets;
create policy "Anyone can read published sheets" on public.sheets
  for select to anon, authenticated using (published or (select public.is_admin()));

drop policy if exists "Admins can add sheets" on public.sheets;
create policy "Admins can add sheets" on public.sheets
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "Admins can edit sheets" on public.sheets;
create policy "Admins can edit sheets" on public.sheets
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins can delete sheets" on public.sheets;
create policy "Admins can delete sheets" on public.sheets
  for delete to authenticated using ((select public.is_admin()));

grant select on public.sheets to anon, authenticated;
grant insert, update, delete on public.sheets to authenticated;

-- 4) Cover and preview images --------------------------------------------
-- Public bucket: anyone can view the images; only admins can upload or remove them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheet-images', 'sheet-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can list sheet images" on storage.objects;
create policy "Admins can list sheet images" on storage.objects
  for select to authenticated using (bucket_id = 'sheet-images' and (select public.is_admin()));

drop policy if exists "Admins can upload sheet images" on storage.objects;
create policy "Admins can upload sheet images" on storage.objects
  for insert to authenticated with check (bucket_id = 'sheet-images' and (select public.is_admin()));

drop policy if exists "Admins can replace sheet images" on storage.objects;
create policy "Admins can replace sheet images" on storage.objects
  for update to authenticated using (bucket_id = 'sheet-images' and (select public.is_admin()))
  with check (bucket_id = 'sheet-images' and (select public.is_admin()));

drop policy if exists "Admins can delete sheet images" on storage.objects;
create policy "Admins can delete sheet images" on storage.objects
  for delete to authenticated using (bucket_id = 'sheet-images' and (select public.is_admin()));

-- 5) Add the store owner -------------------------------------------------
-- Easiest: Table Editor > admins > Insert row > email.
-- Or uncomment this line with their email and run it:
-- insert into public.admins (email) values ('friend@example.com') on conflict do nothing;
