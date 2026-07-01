CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _action text,
  _scope text,
  _max_hits integer,
  _window_seconds integer,
  _block_seconds integer,
  _actor_user_id uuid DEFAULT auth.uid(),
  _ip_address inet DEFAULT NULL::inet
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_action text := left(regexp_replace(coalesce(_action, 'unknown'), '[^a-zA-Z0-9:_-]', '-', 'g'), 80);
  normalized_scope text := left(coalesce(_scope, 'anonymous'), 180);
  v_scope_hash text := md5(normalized_scope);
  v_window_start timestamp with time zone;
  row_record public.security_rate_limits%ROWTYPE;
  allowed boolean := true;
  retry_after_seconds integer := 0;
BEGIN
  IF _max_hits < 1 OR _window_seconds < 1 OR _block_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate limit configuration';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.security_rate_limits(action, scope_hash, actor_user_id, ip_address, hit_count, window_start, updated_at)
  VALUES (normalized_action, v_scope_hash, _actor_user_id, _ip_address, 1, v_window_start, now())
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
$function$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer, uuid, inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer, integer, uuid, inet) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.approved IS DISTINCT FROM OLD.approved THEN
      NEW.approved := OLD.approved;
    END IF;

    IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
      NEW.seller_id := OLD.seller_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Users can delete accessible projects" ON public.projects;
DROP POLICY IF EXISTS "Projects deleted only by management" ON public.projects;
DROP POLICY IF EXISTS "CRM customers deleted only by management" ON public.crm_customers;
DROP POLICY IF EXISTS "CRM customers can be deleted by admins" ON public.crm_customers;
DROP POLICY IF EXISTS "CRM customers can be deleted by staff owners" ON public.crm_customers;
DROP POLICY IF EXISTS "CRM leads deleted only by management" ON public.crm_leads;
