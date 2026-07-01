-- Project, seller routine and commercial lead flow improvements.
-- Single-store platform: no tenant_id/store_id additions.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

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
      AND role::text IN ('admin', 'gestor', 'vendedor')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS seller_user_id uuid,
  ADD COLUMN IF NOT EXISTS crm_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS initial_notes text;

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_seller_user_id_fkey
    FOREIGN KEY (seller_user_id)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_seller_user_id ON public.projects(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_crm_tags ON public.projects USING gin(crm_tags);

UPDATE public.projects p
SET seller_user_id = COALESCE(
  p.seller_user_id,
  CASE WHEN public.has_role(p.user_id, 'vendedor') THEN p.user_id ELSE NULL END,
  profile_owner.seller_id
)
FROM public.profiles profile_owner
WHERE profile_owner.user_id = p.user_id
  AND p.seller_user_id IS NULL;

ALTER TABLE public.crm_customers
  DROP CONSTRAINT IF EXISTS crm_customers_status_check;

ALTER TABLE public.crm_customers
  ADD CONSTRAINT crm_customers_status_check
  CHECK (status IN ('ativo', 'arquivado', 'inativo', 'em_negociacao', 'perdido', 'concluido', 'venda_concluida'))
  NOT VALID;

ALTER TABLE public.crm_customers VALIDATE CONSTRAINT crm_customers_status_check;

CREATE OR REPLACE FUNCTION public.resolve_project_commercial_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_profile record;
  seller_profile record;
  existing_customer_id uuid;
  resolved_architect_name text;
BEGIN
  SELECT p.user_id, p.full_name, p.seller_id
  INTO creator_profile
  FROM public.profiles p
  WHERE p.user_id = NEW.user_id;

  IF NEW.seller_user_id IS NULL THEN
    IF public.has_role(NEW.user_id, 'vendedor') THEN
      NEW.seller_user_id := NEW.user_id;
    ELSE
      NEW.seller_user_id := creator_profile.seller_id;
    END IF;
  END IF;

  IF NEW.crm_architect_profile_id IS NULL AND public.has_role(NEW.user_id, 'arquiteto') THEN
    NEW.crm_architect_profile_id := NEW.user_id;
  END IF;

  IF (NEW.architect_name IS NULL OR btrim(NEW.architect_name) = '') AND NEW.crm_architect_profile_id IS NOT NULL THEN
    SELECT p.full_name
    INTO resolved_architect_name
    FROM public.profiles p
    WHERE p.user_id = NEW.crm_architect_profile_id;
    NEW.architect_name := resolved_architect_name;
  END IF;

  IF (NEW.architect_name IS NULL OR btrim(NEW.architect_name) = '') AND public.has_role(NEW.user_id, 'arquiteto') THEN
    NEW.architect_name := creator_profile.full_name;
  END IF;

  IF (NEW.consultant_name IS NULL OR btrim(NEW.consultant_name) = '') AND NEW.seller_user_id IS NOT NULL THEN
    SELECT p.full_name
    INTO seller_profile
    FROM public.profiles p
    WHERE p.user_id = NEW.seller_user_id;
    NEW.consultant_name := seller_profile.full_name;
  END IF;

  IF TG_OP = 'INSERT' AND (NEW.client_name IS NULL OR btrim(NEW.client_name) = '') THEN
    RAISE EXCEPTION 'Nome do cliente e obrigatorio para criar projeto.';
  END IF;

  IF NEW.crm_customer_id IS NULL AND NEW.seller_user_id IS NOT NULL AND NEW.client_name IS NOT NULL AND btrim(NEW.client_name) <> '' THEN
    SELECT c.id
    INTO existing_customer_id
    FROM public.crm_customers c
    WHERE c.seller_user_id = NEW.seller_user_id
      AND lower(btrim(c.name)) = lower(btrim(NEW.client_name))
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF existing_customer_id IS NULL THEN
      INSERT INTO public.crm_customers (
        seller_user_id,
        name,
        lead_source,
        architect_name,
        architect_profile_id,
        customer_type,
        urgency_level,
        status,
        notes
      )
      VALUES (
        NEW.seller_user_id,
        btrim(NEW.client_name),
        'Projeto',
        NULLIF(btrim(COALESCE(NEW.architect_name, '')), ''),
        NEW.crm_architect_profile_id,
        'residencial',
        'media',
        'ativo',
        NULLIF(btrim(COALESCE(NEW.initial_notes, '')), '')
      )
      RETURNING id INTO existing_customer_id;
    END IF;

    NEW.crm_customer_id := existing_customer_id;
  END IF;

  NEW.crm_status := COALESCE(NEW.crm_status, 'novo_atendimento');
  NEW.crm_quote_status := COALESCE(NEW.crm_quote_status, 'sem_orcamento');
  NEW.crm_order_status := COALESCE(NEW.crm_order_status, 'sem_pedido');
  NEW.crm_delivery_status := COALESCE(NEW.crm_delivery_status, 'sem_entrega');
  NEW.crm_approval_status := COALESCE(NEW.crm_approval_status, 'pendente');
  NEW.crm_risk_level := COALESCE(NEW.crm_risk_level, 'baixo');
  NEW.crm_tags := COALESCE(NEW.crm_tags, '{}'::text[]);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_project_commercial_links ON public.projects;
CREATE TRIGGER trg_resolve_project_commercial_links
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.resolve_project_commercial_links();

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Users can view own projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR user_id = auth.uid()
  OR seller_user_id = auth.uid()
  OR public.can_access_profile(auth.uid(), user_id)
);

CREATE POLICY "Users can create projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

CREATE POLICY "Users can update own projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR user_id = auth.uid()
  OR seller_user_id = auth.uid()
  OR public.can_access_profile(auth.uid(), user_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR user_id = auth.uid()
  OR seller_user_id = auth.uid()
  OR public.can_access_profile(auth.uid(), user_id)
);

CREATE POLICY "Users can delete own projects"
ON public.projects
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM customers are visible to staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers are visible to staff owners"
ON public.crm_customers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM customers can be created by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be created by staff owners"
ON public.crm_customers FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM customers can be updated by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be updated by staff owners"
ON public.crm_customers FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM customers can be deleted by admins" ON public.crm_customers;
CREATE POLICY "CRM customers can be deleted by staff owners"
ON public.crm_customers FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR seller_user_id = auth.uid()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  architect_profile_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  lead_name text NOT NULL,
  phone text,
  lead_source text,
  notes text,
  crm_status text NOT NULL DEFAULT 'novo_atendimento',
  status text NOT NULL DEFAULT 'aberto',
  crm_tags text[] NOT NULL DEFAULT '{}'::text[],
  next_action text,
  next_followup_at timestamptz,
  converted_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_leads_status_check CHECK (status IN ('aberto', 'convertido', 'arquivado', 'perdido')),
  CONSTRAINT crm_leads_crm_status_check CHECK (crm_status IN ('novo_atendimento', 'briefing_visita', 'curadoria_produtos', 'proposta_orcamento', 'followup_negociacao', 'pedido_fechado', 'perdido'))
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_seller ON public.crm_leads(seller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON public.crm_leads(status, crm_status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tags ON public.crm_leads USING gin(crm_tags);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;

DROP POLICY IF EXISTS "CRM leads visible to staff owners" ON public.crm_leads;
CREATE POLICY "CRM leads visible to staff owners"
ON public.crm_leads FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM leads created by staff owners" ON public.crm_leads;
CREATE POLICY "CRM leads created by staff owners"
ON public.crm_leads FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM leads updated by staff owners" ON public.crm_leads;
CREATE POLICY "CRM leads updated by staff owners"
ON public.crm_leads FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR seller_user_id = auth.uid()
);

DROP POLICY IF EXISTS "CRM leads deleted by staff owners" ON public.crm_leads;
CREATE POLICY "CRM leads deleted by staff owners"
ON public.crm_leads FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR seller_user_id = auth.uid()
);
