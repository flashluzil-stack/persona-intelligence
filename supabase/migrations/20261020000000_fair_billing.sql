-- Fair billing: a report can be unlocked (and charged) only when it contains
-- at least one verified finding. A report with an overview but no evidence-backed
-- claims (empty or entirely unusable research) is never billable.
create or replace function public.billing_report_ready(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profile_sections
     where research_project_id = p_project and is_current and section_type = 'overview'
  ) and exists (
    select 1 from public.claims where research_project_id = p_project
  );
$$;
revoke all on function public.billing_report_ready(uuid) from public, anon, authenticated;
grant execute on function public.billing_report_ready(uuid) to service_role;
