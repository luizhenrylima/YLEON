
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;
ALTER TABLE public.project_items ADD COLUMN IF NOT EXISTS selected_finish_id uuid REFERENCES public.finishes(id) ON DELETE SET NULL DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT NULL;

CREATE POLICY "Anyone can view shared projects by token"
ON public.projects
FOR SELECT
TO anon
USING (share_token IS NOT NULL);

CREATE POLICY "Anyone can view shared project items"
ON public.project_items
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = project_items.project_id AND projects.share_token IS NOT NULL
));

CREATE POLICY "Users can update own project items"
ON public.project_items
FOR UPDATE
TO public
USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_items.project_id AND projects.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_items.project_id AND projects.user_id = auth.uid()));
