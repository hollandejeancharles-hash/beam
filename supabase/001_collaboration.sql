-- Run once in the SQL editor of a Supabase project. No service_role key in Beam.
create extension if not exists pgcrypto with schema extensions;
create table public.beam_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.beam_members (
 workspace_id uuid not null references public.beam_workspaces on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('owner','editor','viewer')), primary key(workspace_id,user_id)
);
create table public.beam_roadmaps (
 workspace_id uuid primary key references public.beam_workspaces on delete cascade,
 items jsonb not null default '[]' check(jsonb_typeof(items)='array'), revision bigint not null default 0,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table public.beam_invites (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.beam_workspaces on delete cascade,
 code_hash text not null unique, role text not null check(role in ('editor','viewer')),
 expires_at timestamptz not null default now()+interval '7 days', used_by uuid references auth.users(id)
);
alter table public.beam_workspaces enable row level security;
alter table public.beam_members enable row level security;
alter table public.beam_roadmaps enable row level security;
alter table public.beam_invites enable row level security;
create function public.beam_is_member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.beam_members where workspace_id=w and user_id=auth.uid());
$$;
create policy member_workspaces on public.beam_workspaces for select to authenticated using(public.beam_is_member(id));
create policy member_members on public.beam_members for select to authenticated using(public.beam_is_member(workspace_id));
create policy member_roadmaps on public.beam_roadmaps for select to authenticated using(public.beam_is_member(workspace_id));
-- All writes go through the checked RPC functions; no direct table write grants.
revoke all on public.beam_workspaces,public.beam_members,public.beam_roadmaps,public.beam_invites from anon,authenticated;
grant select on public.beam_workspaces,public.beam_members,public.beam_roadmaps to authenticated;
create function public.beam_create_workspace(p_name text,p_items jsonb default '[]') returns uuid
 language plpgsql security definer set search_path='' as $$
 declare w uuid;
 begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_items)<>'array' or pg_column_size(p_items)>1000000 then raise exception 'Invalid roadmap'; end if;
 insert into public.beam_workspaces(name,owner_id) values(trim(p_name),auth.uid()) returning id into w;
 insert into public.beam_members values(w,auth.uid(),'owner');
 insert into public.beam_roadmaps(workspace_id,items,updated_by) values(w,p_items,auth.uid());
 return w;
 end; $$;
create function public.beam_save_roadmap(p_workspace uuid,p_revision bigint,p_items jsonb) returns bigint
 language plpgsql security definer set search_path='' as $$
 declare r bigint;
 begin
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role in ('owner','editor')) then raise exception 'Editing denied'; end if;
 if jsonb_typeof(p_items)<>'array' or pg_column_size(p_items)>1000000 then raise exception 'Invalid roadmap'; end if;
 update public.beam_roadmaps set items=p_items,revision=revision+1,updated_at=now(),updated_by=auth.uid()
 where workspace_id=p_workspace and revision=p_revision returning revision into r;
 if r is null then raise exception 'BEAM_CONFLICT'; end if;
 return r;
 end; $$;
create function public.beam_invite(p_workspace uuid,p_role text default 'editor') returns text
 language plpgsql security definer set search_path='' as $$
 declare code text;
 begin
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role='owner') then raise exception 'Invitation denied'; end if;
 if p_role not in ('editor','viewer') then raise exception 'Invalid role'; end if;
 code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.beam_invites(workspace_id,code_hash,role) values(p_workspace,encode(extensions.digest(code,'sha256'),'hex'),p_role);
 return code;
 end; $$;
create function public.beam_join(p_code text) returns uuid
 language plpgsql security definer set search_path='' as $$
 declare invitation public.beam_invites;
 begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into invitation from public.beam_invites where code_hash=encode(extensions.digest(p_code,'sha256'),'hex') and used_by is null and expires_at>now() for update;
 if invitation.id is null then raise exception 'Invitation expired or already used'; end if;
 insert into public.beam_members values(invitation.workspace_id,auth.uid(),invitation.role) on conflict do nothing;
 update public.beam_invites set used_by=auth.uid() where id=invitation.id;
 return invitation.workspace_id;
 end; $$;
revoke execute on function public.beam_is_member(uuid),public.beam_create_workspace(text,jsonb),public.beam_save_roadmap(uuid,bigint,jsonb),public.beam_invite(uuid,text),public.beam_join(text) from public,anon;
grant execute on function public.beam_is_member(uuid),public.beam_create_workspace(text,jsonb),public.beam_save_roadmap(uuid,bigint,jsonb),public.beam_invite(uuid,text),public.beam_join(text) to authenticated;
alter publication supabase_realtime add table public.beam_roadmaps;
