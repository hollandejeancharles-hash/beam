-- Transactional integration test: every test user and workspace is rolled back.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','owner@beam-test.invalid'),
 ('22222222-2222-4222-8222-222222222222','editor@beam-test.invalid'),
 ('33333333-3333-4333-8333-333333333333','outsider@beam-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select set_config('beam.test.workspace',public.beam_create_workspace('Beam transactional test','[]')::text,true);
select set_config('beam.test.invite',public.beam_invite(current_setting('beam.test.workspace')::uuid,'editor'),true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select public.beam_join(current_setting('beam.test.invite'));
select public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,0,'[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","title":"Test change"}]');
do $$ begin
 begin
 perform public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,0,'[]');
 raise exception 'STALE_WRITE_WAS_ACCEPTED';
 exception when others then
 if sqlerrm<>'BEAM_CONFLICT' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.beam_roadmaps where workspace_id=current_setting('beam.test.workspace')::uuid) then raise exception 'OUTSIDER_CAN_READ'; end if;
 begin
 perform public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,1,'[]');
 raise exception 'OUTSIDER_CAN_WRITE';
 exception when others then
 if sqlerrm<>'Editing denied' then raise; end if;
 end;
end $$;
rollback;
select 'PASS: invite + editor write + stale conflict + outsider isolation; test data rolled back' as result;
