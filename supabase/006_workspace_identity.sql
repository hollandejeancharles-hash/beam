BEGIN;
alter table public.beam_workspaces add column if not exists identity_configured boolean not null default false;
alter table public.beam_workspaces add column if not exists description text not null default '' check(length(description)<=160);
alter table public.beam_workspaces add column if not exists image text check(image is null or (length(image)<=700000 and image like 'data:image/png;base64,%'));
create or replace function public.beam_workspace_identity(p_workspace uuid,p_name text,p_description text,p_image text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from public.beam_members where workspace_id=p_workspace and user_id=auth.uid() and role='owner') then raise exception 'Owner required'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 80 or length(coalesce(p_description,''))>160 or (p_image is not null and (length(p_image)>700000 or p_image not like 'data:image/png;base64,%')) then raise exception 'Invalid workspace identity'; end if;
 update public.beam_workspaces set name=trim(p_name),description=coalesce(p_description,''),image=p_image,identity_configured=true where id=p_workspace;
end; $$;
create or replace function public.beam_team_members(p_workspace uuid) returns table(user_id uuid,name text,photo text,role text)
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.beam_is_member(p_workspace) then raise exception 'Access denied'; end if;
 return query select m.user_id,coalesce(p.name,nullif(u.raw_user_meta_data->>'name',''),'Membre de l’équipe'),p.photo,m.role from public.beam_members m join auth.users u on u.id=m.user_id left join public.beam_profiles p on p.workspace_id=m.workspace_id and p.user_id=m.user_id where m.workspace_id=p_workspace order by m.role,m.user_id;
end; $$;
revoke all on function public.beam_workspace_identity(uuid,text,text,text),public.beam_team_members(uuid) from public,anon;
grant execute on function public.beam_workspace_identity(uuid,text,text,text),public.beam_team_members(uuid) to authenticated;
DO $$ BEGIN
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='beam_workspaces') then alter publication supabase_realtime add table public.beam_workspaces; end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='beam_members') then alter publication supabase_realtime add table public.beam_members; end if;
END $$;
COMMIT;
