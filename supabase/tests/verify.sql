-- Run against a local database with the app migration applied. Fixtures are rolled back.
begin;

insert into auth.users (id)
values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into auth.identities (user_id, provider_id, provider, identity_data)
values
  ('10000000-0000-4000-8000-000000000001', '875001', 'github', '{}'),
  ('10000000-0000-4000-8000-000000000002', '875002', 'github', '{}');
insert into tmu_private.github_owners (github_id) values ('875001');
insert into public.study_catalog (id, data) values (1, '{"courses":[],"documents":[]}');
insert into public.study_packs (course_id, data) values ('test-course', '{}');
insert into public.study_documents (document_id, object_key)
values (repeat('e', 64), 'pdf/test-file.pdf');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if public.is_study_owner()
    or exists (select 1 from public.study_catalog)
    or exists (select 1 from public.study_packs)
    or exists (select document_id from public.study_documents)
    or public.study_document_key(repeat('e', 64)) is not null
    or public.consume_tutor_quota()
  then
    raise exception 'An unapproved account can access owner data';
  end if;

  begin
    perform public.save_study_attempt(
      '10000000-0000-4000-8000-000000000003', 'test-course', 0, '{"status":"draft","answers":{}}'
    );
    raise exception 'An unapproved account can write an attempt';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
declare
  attempt_id uuid := '10000000-0000-4000-8000-000000000003';
  conflict_id uuid := '10000000-0000-4000-8000-000000000004';
  draft jsonb := '{"status":"draft","answers":{"q1":1}}';
  submission jsonb := '{"status":"submitted","answers":{"q1":2}}';
  result jsonb;
begin
  if not public.is_study_owner()
    or not exists (select 1 from public.study_catalog)
    or not exists (select 1 from public.study_packs)
    or not exists (select document_id from public.study_documents)
    or public.study_document_key(repeat('e', 64)) is distinct from 'pdf/test-file.pdf'
  then
    raise exception 'Owner cannot access expected data';
  end if;

  begin
    perform public.save_study_attempt(attempt_id, 'test-course', 0, '{"answers":{}}');
    raise exception 'Attempt status validation is missing';
  exception when invalid_parameter_value then null;
  end;

  result := public.save_study_attempt(attempt_id, 'test-course', 0, draft);
  if (result ->> 'applied')::boolean is distinct from true
    or (result #>> '{attempt,revision}')::integer is distinct from 1
  then
    raise exception 'First save must create revision 1';
  end if;

  if public.save_study_attempt(attempt_id, 'test-course', 0, draft) is distinct from result then
    raise exception 'Identical replay changed the draft';
  end if;

  result := public.save_study_attempt(attempt_id, 'test-course', 0, submission);
  if (result ->> 'applied')::boolean is distinct from false
    or result #> '{attempt,data}' is distinct from draft
  then
    raise exception 'A stale write overwrote the server draft';
  end if;

  result := public.save_study_attempt(conflict_id, 'test-course', 0, draft);
  if (result ->> 'applied')::boolean is distinct from true then
    raise exception 'A conflict copy could not be saved';
  end if;

  result := public.save_study_attempt(attempt_id, 'test-course', 1, submission);
  if (result ->> 'applied')::boolean is distinct from true
    or (result #>> '{attempt,revision}')::integer is distinct from 2
    or result #> '{attempt,data}' is distinct from submission
  then
    raise exception 'Owner cannot submit a synchronized draft';
  end if;

  result := public.save_study_attempt(attempt_id, 'test-course', 2, draft);
  if (result ->> 'applied')::boolean is distinct from false
    or result #> '{attempt,data}' is distinct from submission
  then
    raise exception 'Submitted attempt can be reverted to draft';
  end if;

  for request_index in 1..20 loop
    if not public.consume_tutor_quota() then
      raise exception 'Tutor quota stopped a request early';
    end if;
  end loop;
  if public.consume_tutor_quota() then
    raise exception 'Tutor quota did not stop the 21st request';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.study_attempts) then
    raise exception 'An unapproved account can read owner attempts';
  end if;
end;
$$;

rollback;
