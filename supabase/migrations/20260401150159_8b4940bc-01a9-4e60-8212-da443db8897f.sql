
-- Drop the index first, then the extension
DROP INDEX IF EXISTS public.idx_products_name_trgm;
DROP EXTENSION IF EXISTS pg_trgm;

-- Recreate in extensions schema
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
ON public.products USING gin (name extensions.gin_trgm_ops);
