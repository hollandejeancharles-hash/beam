BEGIN;
create table if not exists public.beam_demands (
 workspace_id uuid not null references public.beam_workspaces on delete cascade,
 id uuid not null, data jsonb not null, revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(workspace_id,id), check(jsonb_typeof(data)='object')
);
alter table public.beam_demands enable row level security;
do $$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='beam_demands' and policyname='demand_members') then create policy demand_members on public.beam_demands for select to authenticated using(public.beam_is_member(workspace_id)); end if; end $$;
revoke all on public.beam_demands from anon,authenticated;
grant select on public.beam_demands to authenticated;
create or replace function public.beam_save_demand(p_workspace uuid,p_id uuid,p_revision bigint,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.beam_demands; result public.beam_demands; event jsonb;
begin
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role in ('owner','editor')) then raise exception 'Editing denied'; end if;
 if jsonb_typeof(p_data)<>'object' or coalesce(jsonb_typeof(p_data->'title'),'null')<>'string' or coalesce(jsonb_typeof(p_data->'description'),'null')<>'string' or length((p_data-'history')::text)>24000 or length(trim(coalesce(p_data->>'title',''))) not between 1 and 140 or length(coalesce(p_data->>'description',''))>5000 or coalesce(p_data->>'state','') not in ('review','clarify','accepted','deferred','rejected','merged') then raise exception 'Invalid demand'; end if;
 if coalesce(p_data->>'kind','request') not in ('request','bug','improvement') or coalesce(p_data->>'priority','unrated') not in ('unrated','high','medium','low') then raise exception 'Invalid classification'; end if;
 if p_data->>'reviewer' is not null and p_data->>'reviewer'<>'' and not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id::text=p_data->>'reviewer') then raise exception 'Reviewer missing'; end if;
 if p_data->>'item_id' is not null and p_data->>'item_id'<>'' and not exists(select 1 from public.beam_roadmaps r,jsonb_array_elements(r.items) i where r.workspace_id=p_workspace and i->>'id'=p_data->>'item_id') then raise exception 'Item missing'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text||p_id::text,0));
 select * into previous from public.beam_demands where workspace_id=p_workspace and id=p_id for update;
 if previous.id is null then
  if p_revision<>-1 then raise exception 'BEAM_CONFLICT'; end if;
  if jsonb_typeof(coalesce(p_data->'sources','[]'::jsonb))<>'array' then raise exception 'Invalid sources'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_data->'sources','[]'::jsonb)) s where jsonb_typeof(s)<>'object' or coalesce(s->>'kind','') not in ('public','note','demand','manual') or coalesce(jsonb_typeof(s->'title'),'null')<>'string' or coalesce(jsonb_typeof(s->'quote'),'null')<>'string' or length(s->>'quote')>5000) then raise exception 'Invalid sources'; end if;
  p_data:=p_data-'history';
 else
  if previous.revision<>p_revision then raise exception 'BEAM_CONFLICT'; end if;
  -- Sources and actor history are immutable provenance, never supplied by an update.
  p_data:=p_data||jsonb_build_object('sources',previous.data->'sources');
 end if;
 event:=jsonb_build_object('at',now(),'actor',auth.uid(),'state',p_data->>'state','before',previous.data->>'state','reason',p_data->>'reason','title',p_data->>'title','reviewer',p_data->>'reviewer','item_id',p_data->>'item_id');
 p_data:=p_data||jsonb_build_object('history',coalesce(previous.data->'history','[]'::jsonb)||jsonb_build_array(event));
 insert into public.beam_demands(workspace_id,id,data) values(p_workspace,p_id,p_data)
 on conflict(workspace_id,id) do update set data=excluded.data,revision=public.beam_demands.revision+1,updated_at=now() returning * into result;
 return to_jsonb(result);
end; $$;
revoke all on function public.beam_save_demand(uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.beam_save_demand(uuid,uuid,bigint,jsonb) to authenticated;
-- Atomic conversion: both revisions must match before any roadmap change survives.
create or replace function public.beam_create_from_demand(p_workspace uuid,p_revision bigint,p_items jsonb,p_demand uuid,p_demand_revision bigint,p_item uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare request public.beam_demands; next_revision bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text||p_demand::text,0));
 select * into request from public.beam_demands where workspace_id=p_workspace and id=p_demand for update;
 if request.id is null or request.revision<>p_demand_revision or request.data->>'item_id' is not null or request.data->>'state' not in ('review','clarify') then raise exception 'BEAM_CONFLICT'; end if;
 if not exists(select 1 from jsonb_array_elements(p_items) i where i->>'id'=p_item::text) or exists(select 1 from public.beam_roadmaps r,jsonb_array_elements(r.items) i where r.workspace_id=p_workspace and i->>'id'=p_item::text) then raise exception 'New item missing'; end if;
 next_revision:=public.beam_save_roadmap(p_workspace,p_revision,p_items);
 perform public.beam_save_demand(p_workspace,p_demand,p_demand_revision,request.data||jsonb_build_object('state','accepted','item_id',p_item,'reason','Feature créée depuis cette demande'));
 return next_revision;
end; $$;
revoke all on function public.beam_create_from_demand(uuid,bigint,jsonb,uuid,bigint,uuid) from public,anon;
grant execute on function public.beam_create_from_demand(uuid,bigint,jsonb,uuid,bigint,uuid) to authenticated;
create or replace function public.beam_merge_demands(p_workspace uuid,p_id uuid,p_revision bigint,p_target uuid,p_target_revision bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source public.beam_demands; target public.beam_demands; merged_sources jsonb;
begin
 if p_id=p_target or length(trim(coalesce(p_reason,'')))=0 then raise exception 'Invalid merge'; end if;
 -- Stable lock order prevents competing merges from deadlocking.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text||least(p_id,p_target)::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text||greatest(p_id,p_target)::text,0));
 select * into source from public.beam_demands where workspace_id=p_workspace and id=p_id for update;
 select * into target from public.beam_demands where workspace_id=p_workspace and id=p_target for update;
 if source.id is null or target.id is null or source.revision<>p_revision or target.revision<>p_target_revision or source.data->>'state'='merged' or target.data->>'state'='merged' or source.data->>'item_id' is not null then raise exception 'BEAM_CONFLICT'; end if;
 -- Permission checks and history generation use the same guarded write function.
 perform public.beam_save_demand(p_workspace,p_target,p_target_revision,target.data||jsonb_build_object('reason',left(p_reason,1000)));
 select jsonb_agg(distinct value) into merged_sources from jsonb_array_elements(coalesce(source.data->'sources','[]')||coalesce(target.data->'sources','[]')||jsonb_build_array(jsonb_build_object('kind','demand','title',source.data->>'title','quote',source.data->>'description','at',source.created_at,'demand_id',source.id)));
 update public.beam_demands set data=data||jsonb_build_object('sources',merged_sources) where workspace_id=p_workspace and id=p_target;
 perform public.beam_save_demand(p_workspace,p_id,p_revision,source.data||jsonb_build_object('state','merged','merged_into',p_target,'reason',left(p_reason,1000)));
end; $$;
revoke all on function public.beam_merge_demands(uuid,uuid,bigint,uuid,bigint,text) from public,anon;
grant execute on function public.beam_merge_demands(uuid,uuid,bigint,uuid,bigint,text) to authenticated;

do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='beam_demands') then alter publication supabase_realtime add table public.beam_demands; end if; end $$;
COMMIT;
