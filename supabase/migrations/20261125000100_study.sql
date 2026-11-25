create schema if not exists tmu_private;
revoke all on schema tmu_private from public, anon, authenticated;

create table tmu_private.github_owners (
  github_id text primary key check (github_id ~ '^[1-9][0-9]{0,29}$')
);

-- Read the provider identity, which cannot be overwritten by updating profile metadata.
create function public.is_study_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.identities as identity
    join tmu_private.github_owners as owner on owner.github_id = identity.provider_id
    where identity.user_id = auth.uid() and identity.provider = 'github'
  )
$$;

revoke all on function public.is_study_owner() from public, anon, authenticated;
grant execute on function public.is_study_owner() to authenticated;

create table public.study_catalog (
  id integer primary key check (id = 1),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

create table public.study_packs (
  course_id text primary key check (course_id ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object')
);

-- Presence in this table means that the current owner can read a confirmed R2 object.
create table public.study_documents (
  document_id text primary key check (document_id ~ '^[0-9a-f]{64}$'),
  object_key text not null unique
    check (object_key ~ '^[A-Za-z0-9_/-]+[.]pdf$' and char_length(object_key) <= 240)
);

create table public.study_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null references public.study_packs(course_id),
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create index study_attempts_user_updated_idx on public.study_attempts (user_id, updated_at desc);

alter table public.study_catalog enable row level security;
alter table public.study_packs enable row level security;
alter table public.study_documents enable row level security;
alter table public.study_attempts enable row level security;

revoke all on table public.study_catalog, public.study_packs,
  public.study_documents, public.study_attempts from public, anon, authenticated;
grant select on table public.study_catalog, public.study_packs, public.study_attempts
  to authenticated;
grant select (document_id) on table public.study_documents to authenticated;
grant select, insert, update, delete on table public.study_catalog, public.study_packs,
  public.study_documents, public.study_attempts to service_role;

create policy "Owner reads catalog" on public.study_catalog
  for select to authenticated using ((select public.is_study_owner()));

create policy "Owner reads study packs" on public.study_packs
  for select to authenticated using ((select public.is_study_owner()));

create policy "Owner reads document status" on public.study_documents
  for select to authenticated using ((select public.is_study_owner()));

create policy "Owner reads their attempts" on public.study_attempts
  for select to authenticated using (
    user_id = (select auth.uid()) and (select public.is_study_owner())
  );

create function public.study_document_key(p_document_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select object_key
  from public.study_documents
  where document_id = p_document_id and (select public.is_study_owner())
$$;

revoke all on function public.study_document_key(text) from public, anon, authenticated;
grant execute on function public.study_document_key(text) to authenticated;

create function public.save_study_attempt(
  p_id uuid,
  p_course_id text,
  p_revision integer,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  attempt public.study_attempts%rowtype;
begin
  if not public.is_study_owner() then
    raise exception 'Study owner access required' using errcode = '42501';
  end if;

  if p_id is null or p_course_id is null or p_revision is null or p_revision < 0
    or jsonb_typeof(p_data) is distinct from 'object'
    or octet_length(p_data::text) > 196608
    or coalesce(p_data ->> 'status', '') not in ('draft', 'submitted')
    or jsonb_typeof(p_data -> 'answers') is distinct from 'object'
  then
    raise exception 'Invalid study attempt' using errcode = '22023';
  end if;

  if p_revision = 0 then
    insert into public.study_attempts (id, user_id, course_id, data)
    values (p_id, current_user_id, p_course_id, p_data)
    on conflict (id) do nothing
    returning * into attempt;
  else
    update public.study_attempts
    set data = p_data, revision = revision + 1, updated_at = clock_timestamp()
    where id = p_id
      and user_id = current_user_id
      and course_id = p_course_id
      and revision = p_revision
      and data ->> 'status' = 'draft'
      and data is distinct from p_data
    returning * into attempt;
  end if;

  if found then
    return jsonb_build_object('applied', true, 'attempt', to_jsonb(attempt));
  end if;

  select * into attempt
  from public.study_attempts
  where id = p_id and user_id = current_user_id and course_id = p_course_id;

  if not found then
    raise exception 'Study attempt not found' using errcode = '22023';
  end if;

  return jsonb_build_object('applied', attempt.data = p_data, 'attempt', to_jsonb(attempt));
end;
$$;

revoke all on function public.save_study_attempt(uuid, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_study_attempt(uuid, text, integer, jsonb) to authenticated;

create table tmu_private.tutor_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  calls integer not null
);

create function public.consume_tutor_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_at timestamptz := clock_timestamp();
begin
  if not public.is_study_owner() then
    return false;
  end if;

  insert into tmu_private.tutor_quota as quota (user_id, window_start, calls)
  values (auth.uid(), requested_at, 1)
  on conflict (user_id) do update
  set window_start = case
    when quota.window_start <= requested_at - interval '1 hour' then requested_at
    else quota.window_start
  end,
  calls = case
    when quota.window_start <= requested_at - interval '1 hour' then 1
    else quota.calls + 1
  end
  where quota.window_start <= requested_at - interval '1 hour' or quota.calls < 20;

  return found;
end;
$$;

revoke all on function public.consume_tutor_quota() from public, anon, authenticated;
grant execute on function public.consume_tutor_quota() to authenticated;
