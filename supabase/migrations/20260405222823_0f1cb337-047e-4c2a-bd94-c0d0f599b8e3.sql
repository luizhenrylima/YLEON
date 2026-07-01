
CREATE TABLE public.project_item_checklist (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_item_id uuid NOT NULL REFERENCES public.project_items(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_item_id, check_key)
);

ALTER TABLE public.project_item_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checklist items"
ON public.project_item_checklist FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own checklist items"
ON public.project_item_checklist FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own checklist items"
ON public.project_item_checklist FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own checklist items"
ON public.project_item_checklist FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Anon can view shared project checklist"
ON public.project_item_checklist FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id AND p.share_token IS NOT NULL
  )
);

CREATE INDEX idx_project_item_checklist_item ON public.project_item_checklist(project_item_id);
