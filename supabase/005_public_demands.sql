BEGIN;
create table if not exists public.beam_public_portals (
 workspace_id uuid primary key references public.beam_workspaces on delete cascade,
 id uuid not null unique default gen_random_uuid(), enabled boolean not null default true,
 origin text not null default 'https://hollandejeancharles-hash.github.io'
);
create table if not exists public.beam_public_receipts (
 portal uuid not null references public.beam_public_portals(id) on delete cascade,
 request uuid not null, visitor text not null, created_at timestamptz not null default now(),
 primary key(portal,request)
);
alter table public.beam_public_portals enable row level security;
alter table public.beam_public_receipts enable row level security;
revoke all on public.beam_public_portals,public.beam_public_receipts from anon,authenticated;
create index if not exists beam_public_rate on public.beam_public_receipts(portal,created_at);
create or replace function public.beam_public_portal(p_workspace uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare portal uuid;
begin
 if not public.beam_is_member(p_workspace) then raise exception 'Access denied'; end if;
 select id into portal from public.beam_public_portals where workspace_id=p_workspace and enabled;
 if portal is not null then return portal; end if;
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role='owner') then raise exception 'Owner required'; end if;
 insert into public.beam_public_portals(workspace_id) values(p_workspace) on conflict(workspace_id) do update set enabled=true returning id into portal;
 return portal;
end; $$;
revoke all on function public.beam_public_portal(uuid) from public,anon;
grant execute on function public.beam_public_portal(uuid) to authenticated;
create or replace function public.beam_receive_public(p_portal uuid,p_request uuid,p_title text,p_description text,p_visitor text,p_origin text) returns uuid
language plpgsql security definer set search_path='' as $$
declare portal public.beam_public_portals; body jsonb;
begin
 if length(trim(coalesce(p_title,''))) not between 1 and 140 or length(coalesce(p_description,''))>5000 or coalesce(p_visitor,'') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request'; end if;
 select * into portal from public.beam_public_portals where id=p_portal and enabled and origin=p_origin;
 if portal.id is null then raise exception 'Portal unavailable'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_portal::text,0));
 if exists(select 1 from public.beam_public_receipts receipts where receipts.portal=p_portal and request=p_request) then return p_request; end if;
 if (select count(*) from public.beam_public_receipts receipts where receipts.portal=p_portal and created_at>now()-interval '1 hour')>=100 or (select count(*) from public.beam_public_receipts receipts where receipts.portal=p_portal and visitor=p_visitor and created_at>now()-interval '10 minutes')>=5 then raise exception 'RATE_LIMIT'; end if;
 body:=jsonb_build_object('title',trim(p_title),'description',coalesce(p_description,''),'kind','request','priority','unrated','state','review','sources',jsonb_build_array(jsonb_build_object('kind','public','title','Roadmap publique','quote',coalesce(p_description,''),'at',now())),'history',jsonb_build_array(jsonb_build_object('at',now(),'actor',null,'state','review','title',trim(p_title))));
 insert into public.beam_demands(workspace_id,id,data) values(portal.workspace_id,p_request,body);
 insert into public.beam_public_receipts(portal,request,visitor) values(p_portal,p_request,p_visitor);
 return p_request;
end; $$;
revoke all on function public.beam_receive_public(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.beam_receive_public(uuid,uuid,text,text,text,text) to service_role;
COMMIT;
