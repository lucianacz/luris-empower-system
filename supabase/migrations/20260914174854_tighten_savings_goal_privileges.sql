-- Keep the exposed planning table least-privilege. RLS controls row access;
-- authenticated users only need ordinary CRUD through the Data API.

revoke all privileges on table public.savings_goals from anon;
revoke truncate, references, trigger on table public.savings_goals from authenticated;
grant select, insert, update, delete on table public.savings_goals to authenticated;
grant all privileges on table public.savings_goals to service_role;
