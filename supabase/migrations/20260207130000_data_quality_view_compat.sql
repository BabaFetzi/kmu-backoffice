-- Compatibility view for go-live checks

begin;

DROP VIEW IF EXISTS public.data_quality_issues_view;
CREATE VIEW public.data_quality_issues_view AS
SELECT *
FROM public.data_quality_issues;

commit;
