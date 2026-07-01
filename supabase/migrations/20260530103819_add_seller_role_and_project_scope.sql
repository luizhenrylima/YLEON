-- Add seller role and scope project visibility by architect ownership.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendedor';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_id uuid;

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_seller_id_fkey
    FOREIGN KEY (seller_id)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_seller_id ON public.profiles(seller_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);

CREATE OR REPLACE FUNCTION public.is_seller(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = 'vendedor'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'vendedor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_profile(_viewer_id uuid, _profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    _viewer_id = _profile_user_id
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _viewer_id
        AND role::text = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = _profile_user_id
        AND p.seller_id = _viewer_id
        AND public.is_seller(_viewer_id)
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.list_sellers()
RETURNS TABLE(user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    COALESCE(NULLIF(p.full_name, ''), 'Vendedor') AS full_name
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role::text = 'vendedor'
    AND p.approved = true
  ORDER BY p.full_name NULLS LAST, p.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.is_seller(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_profile(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_sellers() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_seller_id uuid;
  seller_id_text text;
BEGIN
  seller_id_text := NEW.raw_user_meta_data->>'seller_id';

  IF seller_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    requested_seller_id := seller_id_text::uuid;
  END IF;

  IF requested_seller_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = requested_seller_id
        AND role::text = 'vendedor'
    )
  THEN
    requested_seller_id := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, seller_id)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', requested_seller_id);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.approved IS DISTINCT FROM OLD.approved THEN
      NEW.approved := OLD.approved;
    END IF;

    IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
      NEW.seller_id := OLD.seller_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can update own profile restricted" ON public.profiles;
CREATE POLICY "Users can update own profile restricted"
ON public.profiles
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND approved = (SELECT p.approved FROM public.profiles p WHERE p.user_id = auth.uid())
  AND seller_id IS NOT DISTINCT FROM (SELECT p.seller_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Sellers can view assigned profiles" ON public.profiles;
CREATE POLICY "Sellers can view assigned profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_access_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Users can view own projects"
ON public.projects
FOR SELECT
TO authenticated
USING (public.can_access_profile(auth.uid(), user_id));

CREATE POLICY "Users can create projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (public.can_access_profile(auth.uid(), user_id))
WITH CHECK (public.can_access_profile(auth.uid(), user_id));

CREATE POLICY "Users can delete own projects"
ON public.projects
FOR DELETE
TO authenticated
USING (public.can_access_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can view own project items" ON public.project_items;
DROP POLICY IF EXISTS "Users can add project items" ON public.project_items;
DROP POLICY IF EXISTS "Users can remove project items" ON public.project_items;
DROP POLICY IF EXISTS "Users can update own project items" ON public.project_items;

CREATE POLICY "Users can view own project items"
ON public.project_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_items.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can add project items"
ON public.project_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_items.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can update own project items"
ON public.project_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_items.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_items.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can remove project items"
ON public.project_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_items.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

DROP POLICY IF EXISTS "Users can view own project env images" ON public.project_environment_images;
DROP POLICY IF EXISTS "Users can insert own project env images" ON public.project_environment_images;
DROP POLICY IF EXISTS "Users can update own project env images" ON public.project_environment_images;
DROP POLICY IF EXISTS "Users can delete own project env images" ON public.project_environment_images;

CREATE POLICY "Users can view own project env images"
ON public.project_environment_images
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_environment_images.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can insert own project env images"
ON public.project_environment_images
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_environment_images.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can update own project env images"
ON public.project_environment_images
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_environment_images.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_environment_images.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can delete own project env images"
ON public.project_environment_images
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_environment_images.project_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

DROP POLICY IF EXISTS "Users can view own checklist items" ON public.project_item_checklist;
DROP POLICY IF EXISTS "Users can insert own checklist items" ON public.project_item_checklist;
DROP POLICY IF EXISTS "Users can update own checklist items" ON public.project_item_checklist;
DROP POLICY IF EXISTS "Users can delete own checklist items" ON public.project_item_checklist;

CREATE POLICY "Users can view own checklist items"
ON public.project_item_checklist
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can insert own checklist items"
ON public.project_item_checklist
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can update own checklist items"
ON public.project_item_checklist
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);

CREATE POLICY "Users can delete own checklist items"
ON public.project_item_checklist
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.project_items pi
    JOIN public.projects p ON p.id = pi.project_id
    WHERE pi.id = project_item_checklist.project_item_id
      AND public.can_access_profile(auth.uid(), p.user_id)
  )
);
