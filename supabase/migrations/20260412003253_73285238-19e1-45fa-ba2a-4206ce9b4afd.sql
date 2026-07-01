
-- Fix 1: Prevent users from self-approving
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a restricted policy that prevents users from changing their approved status
CREATE POLICY "Users can update own profile restricted"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND approved = (SELECT p.approved FROM public.profiles p WHERE p.user_id = auth.uid()));

-- Fix 2: Require knowledge of the actual share_token
-- Create a helper function to safely get the share token from request headers
CREATE OR REPLACE FUNCTION public.get_shared_project_by_token(_token text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.projects WHERE share_token = _token LIMIT 1;
$$;

-- Replace the overly permissive anon policy on projects
DROP POLICY IF EXISTS "Anyone can view shared projects by token" ON public.projects;

CREATE POLICY "Anyone can view shared projects by token"
ON public.projects
FOR SELECT
TO anon
USING (share_token IS NOT NULL AND share_token = current_setting('request.headers', true)::json->>'x-share-token');

-- Update related anon policies on project_items
DROP POLICY IF EXISTS "Anyone can view shared project items" ON public.project_items;

CREATE POLICY "Anyone can view shared project items"
ON public.project_items
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = project_items.project_id
    AND projects.share_token IS NOT NULL
    AND projects.share_token = current_setting('request.headers', true)::json->>'x-share-token'
));

-- Update related anon policies on project_environment_images
DROP POLICY IF EXISTS "Anyone can view shared project env images" ON public.project_environment_images;

CREATE POLICY "Anyone can view shared project env images"
ON public.project_environment_images
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM projects
  WHERE projects.id = project_environment_images.project_id
    AND projects.share_token IS NOT NULL
    AND projects.share_token = current_setting('request.headers', true)::json->>'x-share-token'
));

-- Update related anon policies on project_item_checklist
DROP POLICY IF EXISTS "Anon can view shared project checklist" ON public.project_item_checklist;

CREATE POLICY "Anon can view shared project checklist"
ON public.project_item_checklist
FOR SELECT
TO anon
USING (EXISTS (
  SELECT 1 FROM project_items pi
  JOIN projects p ON p.id = pi.project_id
  WHERE pi.id = project_item_checklist.project_item_id
    AND p.share_token IS NOT NULL
    AND p.share_token = current_setting('request.headers', true)::json->>'x-share-token'
));
