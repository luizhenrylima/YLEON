ALTER TABLE public.project_items
  ADD COLUMN IF NOT EXISTS presentation_dimensions text DEFAULT NULL;
