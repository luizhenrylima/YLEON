ALTER TABLE public.finish_categories 
ADD COLUMN finish_group text NOT NULL DEFAULT 'Superfícies e Pinturas';

COMMENT ON COLUMN public.finish_categories.finish_group IS 'Top-level grouping: Tecidos or Superfícies e Pinturas';