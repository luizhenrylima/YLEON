
-- Add fields to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS architect_name text,
  ADD COLUMN IF NOT EXISTS consultant_name text;

-- Add fields to project_items table
ALTER TABLE public.project_items
  ADD COLUMN IF NOT EXISTS environment_label text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS discount_price numeric;

-- Create project environment images table
CREATE TABLE IF NOT EXISTS public.project_environment_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_name text NOT NULL,
  image_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.project_environment_images ENABLE ROW LEVEL SECURITY;

-- Owner can manage
CREATE POLICY "Users can view own project env images"
  ON public.project_environment_images FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_environment_images.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can insert own project env images"
  ON public.project_environment_images FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_environment_images.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can update own project env images"
  ON public.project_environment_images FOR UPDATE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_environment_images.project_id AND projects.user_id = auth.uid()));

CREATE POLICY "Users can delete own project env images"
  ON public.project_environment_images FOR DELETE
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_environment_images.project_id AND projects.user_id = auth.uid()));

-- Shared projects viewable by anon
CREATE POLICY "Anyone can view shared project env images"
  ON public.project_environment_images FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_environment_images.project_id AND projects.share_token IS NOT NULL));
