BEGIN;
-- Team collaboration: profiles, comments, audited changes and private presence.
create table if not exists public.beam_profiles (
 workspace_id uuid not null references public.beam_workspaces on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 80), photo text,
 primary key(workspace_id,user_id),
 check(photo is null or (length(photo)<200000 and photo like 'data:image/png;base64,%'))
);
create table if not exists public.beam_comments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.beam_workspaces on delete cascade,
 item_id uuid not null, user_id uuid not null references auth.users,
 body text not null check(length(trim(body)) between 1 and 4000), created_at timestamptz not null default now()
);
create table if not exists public.beam_activity (
 id bigint generated always as identity primary key, workspace_id uuid not null references public.beam_workspaces on delete cascade,
 item_id uuid not null, user_id uuid references auth.users, action text not null,
 changes jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists beam_comments_item on public.beam_comments(workspace_id,item_id,created_at);
create index if not exists beam_activity_item on public.beam_activity(workspace_id,item_id,created_at desc);
alter table public.beam_profiles enable row level security;
alter table public.beam_comments enable row level security;
alter table public.beam_activity enable row level security;
create policy team_profiles on public.beam_profiles for select to authenticated using(public.beam_is_member(workspace_id));
create policy team_comments on public.beam_comments for select to authenticated using(public.beam_is_member(workspace_id));
create policy team_activity on public.beam_activity for select to authenticated using(public.beam_is_member(workspace_id));
revoke all on public.beam_profiles,public.beam_comments,public.beam_activity from anon,authenticated;
grant select on public.beam_profiles,public.beam_comments,public.beam_activity to authenticated;
create or replace function public.beam_team_profile(p_workspace uuid,p_name text,p_photo text default null) returns void
 language plpgsql security definer set search_path='' as $$ begin
 if not public.beam_is_member(p_workspace) then raise exception 'Access denied'; end if;
 insert into public.beam_profiles values(p_workspace,auth.uid(),trim(p_name),p_photo)
 on conflict(workspace_id,user_id) do update set name=excluded.name,photo=excluded.photo;
 end; $$;
create or replace function public.beam_comment(p_workspace uuid,p_item uuid,p_body text) returns uuid
 language plpgsql security definer set search_path='' as $$ declare c uuid; begin
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role in ('owner','editor')) then raise exception 'Editing denied'; end if;
 if not exists(select 1 from public.beam_roadmaps r,jsonb_array_elements(r.items) i where r.workspace_id=p_workspace and i->>'id'=p_item::text) then raise exception 'Item missing'; end if;
 insert into public.beam_comments(workspace_id,item_id,user_id,body) values(p_workspace,p_item,auth.uid(),trim(p_body)) returning id into c; return c;
 end; $$;
create or replace function public.beam_audit_roadmap() returns trigger
 language plpgsql security definer set search_path='' as $$
 declare entry jsonb; previous jsonb; field text; diff jsonb;
 begin
 for entry in select value from jsonb_array_elements(new.items) loop
 select value into previous from jsonb_array_elements(old.items) where value->>'id'=entry->>'id';
 if previous is null then
 insert into public.beam_activity(workspace_id,item_id,user_id,action,changes) values(new.workspace_id,(entry->>'id')::uuid,new.updated_by,'created',jsonb_build_object('title',entry->'title'));
 else
 diff:='{}';
 for field in select jsonb_object_keys(entry) loop
 if entry->field is distinct from previous->field then diff:=diff||jsonb_build_object(field,jsonb_build_object('before',previous->field,'after',entry->field)); end if;
 end loop;
 if diff<>'{}' then insert into public.beam_activity(workspace_id,item_id,user_id,action,changes) values(new.workspace_id,(entry->>'id')::uuid,new.updated_by,'updated',diff); end if;
 end if;
 end loop;
 for entry in select value from jsonb_array_elements(old.items) loop
 if not exists(select 1 from jsonb_array_elements(new.items) i where i->>'id'=entry->>'id') then
 insert into public.beam_activity(workspace_id,item_id,user_id,action,changes) values(new.workspace_id,(entry->>'id')::uuid,new.updated_by,'deleted',jsonb_build_object('title',entry->'title'));
 end if;
 end loop;
 return new;
 end; $$;
create trigger beam_roadmap_audit after update of items on public.beam_roadmaps for each row execute function public.beam_audit_roadmap();
revoke execute on function public.beam_team_profile(uuid,text,text),public.beam_comment(uuid,uuid,text),public.beam_audit_roadmap() from public,anon;
grant execute on function public.beam_team_profile(uuid,text,text),public.beam_comment(uuid,uuid,text) to authenticated;
-- RLS protects presence independently of knowledge of a channel name.
create or replace function public.beam_presence_member(topic text) returns boolean
language plpgsql stable security definer set search_path='' as $$ begin
 if topic !~ '^beam:[0-9a-f-]{36}$' then return false; end if;
 return public.beam_is_member(substring(topic from 6)::uuid);
 exception when invalid_text_representation then return false;
 end; $$;
revoke execute on function public.beam_presence_member(text) from public,anon;
grant execute on function public.beam_presence_member(text) to authenticated;
create policy beam_presence_read on realtime.messages for select to authenticated using(extension='presence' and public.beam_presence_member(realtime.topic()));
create policy beam_presence_write on realtime.messages for insert to authenticated with check(extension='presence' and public.beam_presence_member(realtime.topic()));
alter publication supabase_realtime add table public.beam_comments,public.beam_activity,public.beam_profiles;

COMMIT;
