-- Tests use an isolated workspace and roll back all changes.
BEGIN;
DO $$
declare actor uuid; w uuid; connection uuid; first uuid; repeated uuid; payload jsonb;
begin
 select owner_id into actor from public.beam_workspaces limit 1;
 if actor is null then raise exception 'Existing actor required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 w:=public.beam_create_workspace('Beam temporary connector verification','[]');
 insert into public.beam_intake_connections(workspace_id,provider,external_id,channels) values(w,'slack','T_TEMP_TEST',array['C_ALLOWED']) returning id into connection;
 payload:=jsonb_build_object('title','Export PDF','quote','Les clients demandent un export PDF','author','U_TEST','url','https://app.slack.com/archives/C_ALLOWED/p123456');
 perform set_config('request.jwt.claim.role','service_role',true);
 first:=public.beam_receive_intake('slack','T_TEMP_TEST','C_ALLOWED','Ev1',payload);
 repeated:=public.beam_receive_intake('slack','T_TEMP_TEST','C_ALLOWED','Ev1',payload);
 if first is null or first<>repeated or (select count(*) from public.beam_demands where workspace_id=w)<>1 then raise exception 'Idempotency failed'; end if;
 if not exists(select 1 from public.beam_demands where workspace_id=w and id=first and data->>'state'='review' and data->'sources'->0->>'kind'='slack') then raise exception 'Source lost'; end if;
 if public.beam_receive_intake('slack','T_TEMP_TEST','C_OTHER','Ev2',payload) is not null or public.beam_receive_intake('slack','T_OTHER','C_ALLOWED','Ev2',payload) is not null then raise exception 'Routing escaped allowlist'; end if;
 update public.beam_intake_connections set enabled=false where id=connection;
 if public.beam_receive_intake('slack','T_TEMP_TEST','C_ALLOWED','Ev3',payload) is not null then raise exception 'Disabled connection accepted'; end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin perform public.beam_receive_intake('slack','T_TEMP_TEST','C_ALLOWED','Ev4',payload); raise exception 'Client spoof accepted'; exception when others then if SQLERRM<>'Provider access only' then raise; end if; end;
 if has_function_privilege('anon','public.beam_receive_intake(text,text,text,text,jsonb)','execute') or has_function_privilege('authenticated','public.beam_receive_intake(text,text,text,text,jsonb)','execute') then raise exception 'Public RPC permission'; end if;
 if has_table_privilege('authenticated','public.beam_intake_connections','insert') or has_table_privilege('anon','public.beam_intake_connections','select') then raise exception 'Binding permission'; end if;
end; $$;
ROLLBACK;
select 'Provider ingestion, source, replay, tenant/channel isolation, disabled connection and client permissions passed; rolled back.' as verification;
