select c.relname,c.relrowsecurity,p.policyname,p.roles,p.qual
from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_policies p on p.tablename=c.relname and p.schemaname=n.nspname
where n.nspname='public' and c.relname='beam_demands';
select proname,prosecdef,proconfig,
 has_function_privilege('anon',oid,'execute') as anonymous_execution,
 has_function_privilege('authenticated',oid,'execute') as member_execution
from pg_proc where proname in ('beam_save_demand','beam_create_from_demand','beam_merge_demands');
select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename='beam_demands';
