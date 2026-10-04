-- Integration checks in an isolated workspace. Everything is rolled back.
-- Uses an existing account only as an authenticated actor; it changes no account or existing workspace.
BEGIN;
DO $$
declare actor uuid; w uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); item uuid:=gen_random_uuid(); payload jsonb; r bigint;
begin
 select owner_id into actor from public.beam_workspaces limit 1;
 if actor is null then raise exception 'An existing test actor is required'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 w:=public.beam_create_workspace('Beam temporary triage verification','[]');
 payload:=jsonb_build_object('title','Export','description','Export PDF','state','review','sources','[]'::jsonb);
 perform public.beam_save_demand(w,a,-1,payload);
 begin perform public.beam_save_demand(w,a,-1,payload); raise exception 'Duplicate write was accepted'; exception when others then if SQLERRM<>'BEAM_CONFLICT' then raise; end if; end;
 r:=public.beam_create_from_demand(w,0,jsonb_build_array(jsonb_build_object('id',item,'title','Export','visibility','private')),a,0,item);
 if r<>1 or not exists(select 1 from public.beam_demands where workspace_id=w and id=a and data->>'item_id'=item::text and data->>'state'='accepted') then raise exception 'Atomic conversion failed'; end if;
 begin perform public.beam_create_from_demand(w,1,'[]',a,0,item); raise exception 'Repeated conversion was accepted'; exception when others then if SQLERRM<>'BEAM_CONFLICT' then raise; end if; end;
 if (select jsonb_array_length(items) from public.beam_roadmaps where workspace_id=w)<>1 then raise exception 'Roadmap changed on failed conversion'; end if;
 perform public.beam_save_demand(w,b,-1,payload);
 perform public.beam_save_demand(w,c,-1,payload||jsonb_build_object('title','Export complet'));
 perform public.beam_merge_demands(w,b,0,c,0,'Same need, reviewed');
 if not exists(select 1 from public.beam_demands where workspace_id=w and id=b and data->>'state'='merged' and data->>'merged_into'=c::text) then raise exception 'Merge state missing'; end if;
 if not exists(select 1 from public.beam_demands where workspace_id=w and id=c and jsonb_array_length(data->'sources')=1) then raise exception 'Merge lost source'; end if;
 update public.beam_members set role='viewer' where workspace_id=w and user_id=actor;
 begin perform public.beam_save_demand(w,gen_random_uuid(),-1,payload); raise exception 'Viewer write was accepted'; exception when others then if SQLERRM<>'Editing denied' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.beam_save_demand(w,gen_random_uuid(),-1,payload); raise exception 'Anonymous write was accepted'; exception when others then if SQLERRM<>'Editing denied' then raise; end if; end;
end; $$;
ROLLBACK;
SELECT 'Atomic conversion, stale writes, source-preserving merge, viewer and anonymous guards passed; temporary workspace rolled back.' as verification;
