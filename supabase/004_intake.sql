BEGIN;
-- Bindings are provisioned by the project administrator after provider authorization.
-- A Beam user cannot claim another Slack team or Microsoft tenant through a client RPC.
create table if not exists public.beam_intake_connections (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.beam_workspaces on delete cascade,
 provider text not null check(provider in ('slack','teams')),
 external_id text not null,
 channels text[] not null check(cardinality(channels)>0),
 enabled boolean not null default true,
 last_received_at timestamptz,
 unique(provider,external_id)
);
create table if not exists public.beam_intake_receipts (
 connection_id uuid not null references public.beam_intake_connections on delete cascade,
 event_id text not null, demand_id uuid not null, received_at timestamptz not null default now(),
 primary key(connection_id,event_id)
);
alter table public.beam_intake_connections enable row level security;
alter table public.beam_intake_receipts enable row level security;
do $$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='beam_intake_connections' and policyname='intake_members') then
 create policy intake_members on public.beam_intake_connections for select to authenticated using(public.beam_is_member(workspace_id));
end if; end $$;
revoke all on public.beam_intake_connections,public.beam_intake_receipts from public,anon,authenticated;
grant select on public.beam_intake_connections to authenticated;
grant all on public.beam_intake_connections,public.beam_intake_receipts to service_role;
create or replace function public.beam_receive_intake(p_provider text,p_external text,p_channel text,p_event text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare connection public.beam_intake_connections; result uuid; demand uuid := gen_random_uuid();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Provider access only'; end if;
 select * into connection from public.beam_intake_connections where provider=p_provider and external_id=p_external and enabled and p_channel=any(channels) for update;
 -- An authenticated but unconfigured channel is acknowledged and ignored.
 if connection.id is null then return null; end if;
 if length(coalesce(p_event,'')) not between 1 and 512 or jsonb_typeof(p_payload)<>'object'
 or coalesce(jsonb_typeof(p_payload->'quote'),'null')<>'string' or length(trim(coalesce(p_payload->>'quote',''))) not between 1 and 5000
 or coalesce(jsonb_typeof(p_payload->'title'),'null')<>'string' or length(trim(coalesce(p_payload->>'title',''))) not between 1 and 140 then raise exception 'Invalid message'; end if;
 insert into public.beam_intake_receipts(connection_id,event_id,demand_id) values(connection.id,p_event,demand) on conflict do nothing returning demand_id into result;
 if result is null then select demand_id into result from public.beam_intake_receipts where connection_id=connection.id and event_id=p_event; return result; end if;
 insert into public.beam_demands(workspace_id,id,data) values(connection.workspace_id,demand,jsonb_build_object(
 'title',p_payload->>'title','description',p_payload->>'quote','state','review','kind','request','priority','unrated',
 'sources',jsonb_build_array(jsonb_build_object('kind',p_provider,'title',case when p_provider='slack' then 'Mention Slack' else 'Mention Teams' end,
 'quote',p_payload->>'quote','url',p_payload->>'url','url_kind',p_payload->>'url_kind','author',left(p_payload->>'author',160),'thread',p_payload->>'thread','at',now())),
 'history',jsonb_build_array(jsonb_build_object('at',now(),'actor',null,'state','review','reason','Conversation reçue via '||p_provider))));
 update public.beam_intake_connections set last_received_at=now() where id=connection.id;
 return demand;
end; $$;
revoke all on function public.beam_receive_intake(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.beam_receive_intake(text,text,text,text,jsonb) to service_role;
COMMIT;
