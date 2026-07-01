-- Security hardening for the single-store operation model.
-- No tenant/store structure is introduced here.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'arquiteto';

CREATE OR REPLACE FUNCTION public.is_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'gestor'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_architect(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('arquiteto', 'user')
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
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'gestor', 'vendedor')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_operations(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'gestor')
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
    OR public.can_manage_operations(_viewer_id)
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

GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_architect(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_operations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_profile(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_user_id uuid,
  ip_address inet,
  scope text,
  success boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT security_audit_events_action_len CHECK (char_length(action) BETWEEN 2 AND 80),
  CONSTRAINT security_audit_events_scope_len CHECK (scope IS NULL OR char_length(scope) <= 180)
);

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  scope_hash text NOT NULL,
  actor_user_id uuid,
  ip_address inet,
  hit_count integer NOT NULL DEFAULT 0,
  window_start timestamp with time zone NOT NULL,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (action, scope_hash, window_start),
  CONSTRAINT security_rate_limits_hit_count_check CHECK (hit_count >= 0)
);

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read security audit events" ON public.security_audit_events;
CREATE POLICY "Admins can read security audit events"
ON public.security_audit_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can read security rate limits" ON public.security_rate_limits;
CREATE POLICY "Admins can read security rate limits"
ON public.security_rate_limits FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_security_audit_events_action_created ON public.security_audit_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_rate_limits_action_updated ON public.security_rate_limits(action, updated_at DESC);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action text,
  _scope text,
  _max_hits integer,
  _window_seconds integer,
  _block_seconds integer,
  _actor_user_id uuid DEFAULT auth.uid(),
  _ip_address inet DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_action text := left(regexp_replace(coalesce(_action, 'unknown'), '[^a-zA-Z0-9:_-]', '-', 'g'), 80);
  normalized_scope text := left(coalesce(_scope, 'anonymous'), 180);
  scope_hash text := md5(normalized_scope);
  window_start timestamp with time zone;
  row_record public.security_rate_limits%ROWTYPE;
  allowed boolean := true;
  retry_after_seconds integer := 0;
BEGIN
  IF _max_hits < 1 OR _window_seconds < 1 OR _block_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.security_rate_limits(action, scope_hash, actor_user_id, ip_address, hit_count, window_start, updated_at)
  VALUES (normalized_action, scope_hash, _actor_user_id, _ip_address, 1, window_start, now())
  ON CONFLICT (action, scope_hash, window_start)
  DO UPDATE SET
    hit_count = public.security_rate_limits.hit_count + 1,
    actor_user_id = coalesce(EXCLUDED.actor_user_id, public.security_rate_limits.actor_user_id),
    ip_address = coalesce(EXCLUDED.ip_address, public.security_rate_limits.ip_address),
    updated_at = now()
  RETURNING * INTO row_record;

  IF row_record.blocked_until IS NOT NULL AND row_record.blocked_until > now() THEN
    allowed := false;
    retry_after_seconds := ceil(extract(epoch from (row_record.blocked_until - now())));
  ELSIF row_record.hit_count > _max_hits THEN
    allowed := false;
    retry_after_seconds := _block_seconds;
    UPDATE public.security_rate_limits
    SET blocked_until = now() + make_interval(secs => _block_seconds), updated_at = now()
    WHERE id = row_record.id
    RETURNING * INTO row_record;
  END IF;

  IF NOT allowed THEN
    INSERT INTO public.security_audit_events(action, actor_user_id, ip_address, scope, success, metadata)
    VALUES (
      normalized_action,
      _actor_user_id,
      _ip_address,
      normalized_scope,
      false,
      jsonb_build_object('reason', 'rate_limited', 'hit_count', row_record.hit_count)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', allowed,
    'remaining', greatest(_max_hits - row_record.hit_count, 0),
    'retry_after_seconds', retry_after_seconds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer, uuid, inet) TO authenticated;

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins and managers can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.can_manage_operations(auth.uid()) OR public.can_access_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins and managers can view roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.can_manage_operations(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view accessible projects"
ON public.projects FOR SELECT TO authenticated
USING (public.can_access_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update accessible projects"
ON public.projects FOR UPDATE TO authenticated
USING (public.can_access_profile(auth.uid(), user_id))
WITH CHECK (public.can_access_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete accessible projects"
ON public.projects FOR DELETE TO authenticated
USING (auth.uid() = user_id OR public.can_manage_operations(auth.uid()));

DROP POLICY IF EXISTS "CRM customers are visible to staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers are visible to staff owners"
ON public.crm_customers FOR SELECT TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be created by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be created by staff owners"
ON public.crm_customers FOR INSERT TO authenticated
WITH CHECK (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be updated by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be updated by staff owners"
ON public.crm_customers FOR UPDATE TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid())
WITH CHECK (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be deleted by admins" ON public.crm_customers;
CREATE POLICY "CRM customers can be deleted by admins"
ON public.crm_customers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "CRM quotes visible to staff owners" ON public.crm_quotes;
CREATE POLICY "CRM quotes visible to staff owners"
ON public.crm_quotes FOR SELECT TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM quotes managed by staff owners" ON public.crm_quotes;
CREATE POLICY "CRM quotes managed by staff owners"
ON public.crm_quotes FOR ALL TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid())
WITH CHECK (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM orders visible to staff owners" ON public.crm_orders;
CREATE POLICY "CRM orders visible to staff owners"
ON public.crm_orders FOR SELECT TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM orders managed by staff owners" ON public.crm_orders;
CREATE POLICY "CRM orders managed by staff owners"
ON public.crm_orders FOR ALL TO authenticated
USING (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid())
WITH CHECK (public.can_manage_operations(auth.uid()) OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage brand delivery terms" ON public.crm_brand_delivery_terms;
CREATE POLICY "Admins and managers can manage brand delivery terms"
ON public.crm_brand_delivery_terms FOR ALL TO authenticated
USING (public.can_manage_operations(auth.uid()))
WITH CHECK (public.can_manage_operations(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage sales targets" ON public.crm_sales_targets;
CREATE POLICY "Admins and managers can manage sales targets"
ON public.crm_sales_targets FOR ALL TO authenticated
USING (public.can_manage_operations(auth.uid()))
WITH CHECK (public.can_manage_operations(auth.uid()));

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_expected_value_non_negative CHECK (crm_expected_value IS NULL OR crm_expected_value >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_sold_value_non_negative CHECK (crm_sold_value IS NULL OR crm_sold_value >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.project_items
    ADD CONSTRAINT project_items_quantity_positive CHECK (quantity IS NULL OR quantity BETWEEN 1 AND 999) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.project_items
    ADD CONSTRAINT project_items_price_non_negative CHECK (price IS NULL OR price >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.project_items
    ADD CONSTRAINT project_items_discount_price_non_negative CHECK (discount_price IS NULL OR discount_price >= 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.crm_customers
    ADD CONSTRAINT crm_customers_email_format CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.crm_customers
    ADD CONSTRAINT crm_customers_text_lengths CHECK (
      char_length(name) BETWEEN 1 AND 160
      AND (phone IS NULL OR char_length(phone) <= 32)
      AND (whatsapp IS NULL OR char_length(whatsapp) <= 32)
      AND (notes IS NULL OR char_length(notes) <= 2000)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
