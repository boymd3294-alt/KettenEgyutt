-- KETTEN – ADATBÁZIS ÉS BIZTONSÁGI BEÁLLÍTÁSOK

create extension if not exists pgcrypto;

-- 1. KÖZÖS OLDALAK

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  created_at timestamptz not null default now()
);

-- 2. PÁRTAGOK

create table if not exists public.couple_members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id),
  unique (couple_id, user_id)
);

create index if not exists couple_members_couple_idx
on public.couple_members(couple_id);

-- 3. MEGHÍVÓKÓDOK

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_by uuid references auth.users(id),
  used_at timestamptz
);

create index if not exists couple_invites_code_idx
on public.couple_invites(code);

-- 4. ÜZENETEK

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists messages_couple_created_idx
on public.messages(couple_id, created_at);

-- 5. KÖZÖS EMLÉKEK

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  memory_date date,
  created_at timestamptz not null default now()
);

create index if not exists memories_couple_date_idx
on public.memories(couple_id, memory_date);

-- 6. BIZTONSÁGI SEGÉDFÜGGVÉNY

create or replace function public.is_couple_member(p_couple_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members cm
    where cm.couple_id = p_couple_id
      and cm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_couple_member(uuid) from public;
grant execute on function public.is_couple_member(uuid) to authenticated;

-- 7. KÖZÖS OLDAL LÉTREHOZÁSA

create or replace function public.create_couple(
  p_name text,
  p_start_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_couple_id uuid;
  v_code text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Bejelentkezés szükséges.';
  end if;

  if exists (
    select 1
    from public.couple_members
    where user_id = v_user_id
  ) then
    raise exception 'Már tagja vagy egy közös oldalnak.';
  end if;

  if p_name is null or char_length(trim(p_name)) < 1
     or char_length(trim(p_name)) > 100 then
    raise exception 'Adj meg egy 1–100 karakteres nevet.';
  end if;

  if p_start_date is null then
    raise exception 'Add meg a kapcsolat kezdetének dátumát.';
  end if;

  insert into public.couples(name, start_date)
  values (trim(p_name), p_start_date)
  returning id into v_couple_id;

  insert into public.couple_members(couple_id, user_id)
  values (v_couple_id, v_user_id);

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.couple_invites(couple_id, code, created_by)
  values (v_couple_id, v_code, v_user_id);

  return v_couple_id;
end;
$$;

-- 8. CSATLAKOZÁS MEGHÍVÓKÓDDAL

create or replace function public.join_couple(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_couple_id uuid;
  v_invite_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Bejelentkezés szükséges.';
  end if;

  if exists (
    select 1
    from public.couple_members
    where user_id = v_user_id
  ) then
    raise exception 'Már tagja vagy egy közös oldalnak.';
  end if;

  select ci.id, ci.couple_id
  into v_invite_id, v_couple_id
  from public.couple_invites ci
  where ci.code = upper(trim(p_invite_code))
    and ci.used_at is null
    and ci.expires_at > now()
  for update;

  if v_invite_id is null then
    raise exception 'Érvénytelen vagy lejárt meghívókód.';
  end if;

  if (
    select count(*)
    from public.couple_members
    where couple_id = v_couple_id
  ) >= 2 then
    raise exception 'Ez a közös oldal már megtelt.';
  end if;

  insert into public.couple_members(couple_id, user_id)
  values (v_couple_id, v_user_id);

  update public.couple_invites
  set used_by = v_user_id,
      used_at = now()
  where id = v_invite_id;

  return v_couple_id;
end;
$$;

-- 9. MEGHÍVÓKÓD LEKÉRÉSE ÉS ÚJ GENERÁLÁSA

create or replace function public.get_my_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_couple_id uuid;
  v_code text;
begin
  select cm.couple_id
  into v_couple_id
  from public.couple_members cm
  where cm.user_id = auth.uid();

  if v_couple_id is null then
    raise exception 'Nem vagy tagja közös oldalnak.';
  end if;

  if (
    select count(*)
    from public.couple_members
    where couple_id = v_couple_id
  ) >= 2 then
    return 'A párosítás már teljes.';
  end if;

  select ci.code
  into v_code
  from public.couple_invites ci
  where ci.couple_id = v_couple_id
    and ci.used_at is null
    and ci.expires_at > now()
  order by ci.created_at desc
  limit 1;

  if v_code is null then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.couple_invites(couple_id, code, created_by)
    values (v_couple_id, v_code, auth.uid());
  end if;

  return v_code;
end;
$$;

-- 10. RPC JOGOSULTSÁGOK

revoke all on function public.create_couple(text, date) from public;
revoke all on function public.join_couple(text) from public;
revoke all on function public.get_my_invite_code() from public;

grant execute on function public.create_couple(text, date) to authenticated;
grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.get_my_invite_code() to authenticated;

-- 11. RLS BEKAPCSOLÁSA

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;

-- 12. KÖZÖS OLDALAK SZABÁLYAI

drop policy if exists "Members can view their couple" on public.couples;

create policy "Members can view their couple"
on public.couples
for select
to authenticated
using (public.is_couple_member(id));

-- 13. TAGSÁGI SZABÁLYOK

drop policy if exists "Users can view their own membership" on public.couple_members;

create policy "Users can view their own membership"
on public.couple_members
for select
to authenticated
using (user_id = (select auth.uid()));

-- A tagságokat kizárólag a biztonságos RPC-függvények kezelik.

-- 14. MEGHÍVÓK SZABÁLYAI

-- A meghívókódokhoz közvetlen táblalekérdezés nem engedélyezett.
-- A kódokat a get_my_invite_code és join_couple RPC kezeli.

-- 15. ÜZENETEK SZABÁLYAI

drop policy if exists "Members can read messages" on public.messages;
drop policy if exists "Members can send messages" on public.messages;

create policy "Members can read messages"
on public.messages
for select
to authenticated
using (public.is_couple_member(couple_id));

create policy "Members can send messages"
on public.messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_couple_member(couple_id)
);

-- 16. EMLÉKEK SZABÁLYAI

drop policy if exists "Members can read memories" on public.memories;
drop policy if exists "Members can create memories" on public.memories;

create policy "Members can read memories"
on public.memories
for select
to authenticated
using (public.is_couple_member(couple_id));

create policy "Members can create memories"
on public.memories
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_couple_member(couple_id)
);

-- 17. PRIVÁT KÉPTÁROLÓ

insert into storage.buckets (id, name, public)
values ('ketten-kepek', 'ketten-kepek', false)
on conflict (id) do update
set public = false;

drop policy if exists "Couple members can view photos" on storage.objects;
drop policy if exists "Members can upload their photos" on storage.objects;
drop policy if exists "Users can delete their own photos" on storage.objects;

create policy "Couple members can view photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ketten-kepek'
  and public.is_couple_member(
    nullif(split_part(name, '/', 1), '')::uuid
  )
);

create policy "Members can upload their photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ketten-kepek'
  and public.is_couple_member(
    nullif(split_part(name, '/', 1), '')::uuid
  )
  and split_part(name, '/', 2) = (select auth.uid())::text
);

create policy "Users can delete their own photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ketten-kepek'
  and public.is_couple_member(
    nullif(split_part(name, '/', 1), '')::uuid
  )
  and split_part(name, '/', 2) = (select auth.uid())::text
);

-- 18. ÜZENETEK REALTIME FRISSÍTÉSE

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;