-- Transactional integration test: every test user and workspace is rolled back.
begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','owner@beam-test.invalid'),
 ('22222222-2222-4222-8222-222222222222','editor@beam-test.invalid'),
 ('33333333-3333-4333-8333-333333333333','outsider@beam-test.invalid'),
 ('44444444-4444-4444-8444-444444444444','viewer@beam-test.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select set_config('beam.test.workspace',public.beam_create_workspace('Beam transactional test','[]')::text,true);
select set_config('beam.test.invite',public.beam_invite(current_setting('beam.test.workspace')::uuid,'editor'),true);
select public.beam_team_profile(current_setting('beam.test.workspace')::uuid,'Owner',null);
select set_config('beam.test.viewer',public.beam_invite(current_setting('beam.test.workspace')::uuid,'viewer'),true);
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select public.beam_join(current_setting('beam.test.invite'));
select public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,0,'[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","title":"Test change"}]');
select public.beam_comment(current_setting('beam.test.workspace')::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Question produit');
select public.beam_team_profile(current_setting('beam.test.workspace')::uuid,'Editor',null);
do $$ begin
 if (select count(*) from public.beam_activity where workspace_id=current_setting('beam.test.workspace')::uuid)<>1 then raise exception 'AUDIT_MISSING'; end if;
 if not public.beam_presence_member('beam:'||current_setting('beam.test.workspace')) then raise exception 'MEMBER_PRESENCE_DENIED'; end if;
 begin
 perform public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,0,'[]');
 raise exception 'STALE_WRITE_WAS_ACCEPTED';
 exception when others then
 if sqlerrm<>'BEAM_CONFLICT' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select public.beam_join(current_setting('beam.test.viewer'));
do $$ begin
 if not exists(select 1 from public.beam_comments where workspace_id=current_setting('beam.test.workspace')::uuid) then raise exception 'VIEWER_CANNOT_READ'; end if;
 begin
 perform public.beam_comment(current_setting('beam.test.workspace')::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forbidden');
 raise exception 'VIEWER_CAN_COMMENT';
 exception when others then if sqlerrm<>'Editing denied' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.beam_profiles where workspace_id=current_setting('beam.test.workspace')::uuid) or exists(select 1 from public.beam_comments where workspace_id=current_setting('beam.test.workspace')::uuid) or exists(select 1 from public.beam_activity where workspace_id=current_setting('beam.test.workspace')::uuid) or public.beam_presence_member('beam:'||current_setting('beam.test.workspace')) then raise exception 'TEAM_DATA_EXPOSED'; end if;
 if exists(select 1 from public.beam_roadmaps where workspace_id=current_setting('beam.test.workspace')::uuid) then raise exception 'OUTSIDER_CAN_READ'; end if;
 begin
 perform public.beam_save_roadmap(current_setting('beam.test.workspace')::uuid,1,'[]');
 raise exception 'OUTSIDER_CAN_WRITE';
 exception when others then
 if sqlerrm<>'Editing denied' then raise; end if;
 end;
end $$;
rollback;
select 'PASS: team profile, comments, audit, viewer permissions, presence membership, conflicts and outsider isolation; all test data rolled back' as result;
