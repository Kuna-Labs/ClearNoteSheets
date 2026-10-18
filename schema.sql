-- ClearNote Sheets: incoming requests
-- Run once in the Supabase SQL editor (or `supabase db push` if you use the CLI).

create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) <= 120),
  email       text not null check (char_length(email) <= 200),
  piece       text not null check (char_length(piece) <= 200),
  instrument  text not null check (char_length(instrument) <= 120),
  deadline    date,
  notes       text check (char_length(notes) <= 4000),
  file_key    text,               -- object key in the R2 uploads bucket
  file_name   text,
  status      text not null default 'new'
              check (status in ('new', 'quoted', 'in_progress', 'delivered', 'cancelled'))
);

create index if not exists requests_created_at_idx on public.requests (created_at desc);
create index if not exists requests_status_idx on public.requests (status);

-- Lock the table down. The Pages Function writes with the secret key, which bypasses RLS.
-- With RLS on and no policies, the public anon key can't read or write anything here.
alter table public.requests enable row level security;
