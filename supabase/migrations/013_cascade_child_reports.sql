-- Child-linked reports can contain the child's personal details. Delete
-- those reports atomically with the child instead of retaining their content.
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_related_child_id_fkey,
  ADD CONSTRAINT reports_related_child_id_fkey
    FOREIGN KEY (related_child_id)
    REFERENCES public.children(id)
    ON DELETE CASCADE;
