-- CRM extensions for sales conclusion, technical notebook, delivery agenda and architect history.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_seller_id uuid;
  seller_id_text text;
  requested_birth_date date;
  birth_date_text text;
BEGIN
  seller_id_text := NEW.raw_user_meta_data->>'seller_id';
  birth_date_text := NEW.raw_user_meta_data->>'birth_date';

  IF seller_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    requested_seller_id := seller_id_text::uuid;
  END IF;

  IF birth_date_text ~ '^\d{4}-\d{2}-\d{2}$' THEN
    requested_birth_date := birth_date_text::date;
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

  INSERT INTO public.profiles (user_id, full_name, seller_id, birth_date)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', requested_seller_id, requested_birth_date)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      seller_id = COALESCE(EXCLUDED.seller_id, public.profiles.seller_id),
      birth_date = COALESCE(EXCLUDED.birth_date, public.profiles.birth_date);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_crm_status_check;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS crm_architect_profile_id uuid,
  ADD COLUMN IF NOT EXISTS sale_completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS technical_notebook_signed_at timestamp with time zone,
  ADD CONSTRAINT projects_crm_status_check CHECK (
    crm_status IN (
      'novo_atendimento',
      'briefing',
      'briefing_iniciado',
      'curadoria',
      'curadoria_produtos',
      'apresentacao',
      'apresentacao_enviada',
      'orcamento',
      'orcamento_montagem',
      'orcamento_enviado',
      'followup_agendado',
      'negociacao',
      'aguardando_aprovacao',
      'revisao_tecnica',
      'pedido_aprovado',
      'pedido_assinado',
      'pedido_faturado',
      'producao',
      'transporte',
      'recebido_loja',
      'entrega',
      'entrega_agendada',
      'entregue',
      'pos_venda',
      'venda_concluida',
      'concluido',
      'perdido'
    )
  ) NOT VALID;

ALTER TABLE public.projects VALIDATE CONSTRAINT projects_crm_status_check;

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_crm_architect_profile_id_fkey
    FOREIGN KEY (crm_architect_profile_id)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.crm_customers
  DROP CONSTRAINT IF EXISTS crm_customers_status_check;

ALTER TABLE public.crm_customers
  ADD COLUMN IF NOT EXISTS architect_profile_id uuid,
  ADD COLUMN IF NOT EXISTS construction_address text,
  ADD COLUMN IF NOT EXISTS construction_status text,
  ADD COLUMN IF NOT EXISTS construction_deadline date,
  ADD COLUMN IF NOT EXISTS move_in_deadline date,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD CONSTRAINT crm_customers_status_check CHECK (status IN ('ativo', 'inativo', 'em_negociacao', 'perdido', 'concluido', 'venda_concluida')) NOT VALID;

ALTER TABLE public.crm_customers VALIDATE CONSTRAINT crm_customers_status_check;

DO $$
BEGIN
  ALTER TABLE public.crm_customers
    ADD CONSTRAINT crm_customers_architect_profile_id_fkey
    FOREIGN KEY (architect_profile_id)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_brand_delivery_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  delivery_days integer NOT NULL DEFAULT 60,
  followup_days_before integer NOT NULL DEFAULT 10,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (brand_id),
  CONSTRAINT crm_brand_delivery_terms_delivery_days_check CHECK (delivery_days BETWEEN 1 AND 365),
  CONSTRAINT crm_brand_delivery_terms_followup_days_check CHECK (followup_days_before BETWEEN 0 AND 120)
);

CREATE TABLE IF NOT EXISTS public.crm_agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  seller_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  architect_profile_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'atendimento',
  scheduled_at timestamp with time zone NOT NULL,
  notify_at timestamp with time zone,
  completed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'agendado',
  location text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT crm_agenda_events_type_check CHECK (event_type IN ('entrega', 'reuniao', 'atendimento', 'visita', 'followup', 'cobranca_fabrica', 'pos_venda', 'outro')),
  CONSTRAINT crm_agenda_events_status_check CHECK (status IN ('agendado', 'feito', 'cancelado', 'atrasado'))
);

CREATE TABLE IF NOT EXISTS public.crm_technical_notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'rascunho',
  signed_by text,
  signed_at timestamp with time zone,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT crm_technical_notebooks_status_check CHECK (status IN ('rascunho', 'enviado', 'assinado', 'cancelado'))
);

CREATE INDEX IF NOT EXISTS idx_profiles_birth_date ON public.profiles(birth_date);
CREATE INDEX IF NOT EXISTS idx_projects_crm_architect_profile_id ON public.projects(crm_architect_profile_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_architect_profile_id ON public.crm_customers(architect_profile_id);
CREATE INDEX IF NOT EXISTS idx_crm_agenda_events_project ON public.crm_agenda_events(project_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crm_agenda_events_seller ON public.crm_agenda_events(seller_user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crm_agenda_events_status ON public.crm_agenda_events(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_crm_technical_notebooks_project ON public.crm_technical_notebooks(project_id, created_at DESC);

ALTER TABLE public.crm_brand_delivery_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_agenda_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_technical_notebooks ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.crm_brand_delivery_terms TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.crm_brand_delivery_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_agenda_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_technical_notebooks TO authenticated;

DROP POLICY IF EXISTS "Staff can view brand delivery terms" ON public.crm_brand_delivery_terms;
CREATE POLICY "Staff can view brand delivery terms"
ON public.crm_brand_delivery_terms FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage brand delivery terms" ON public.crm_brand_delivery_terms;
CREATE POLICY "Admins can manage brand delivery terms"
ON public.crm_brand_delivery_terms FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff can view accessible agenda events" ON public.crm_agenda_events;
CREATE POLICY "Staff can view accessible agenda events"
ON public.crm_agenda_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR seller_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "Staff can manage accessible agenda events" ON public.crm_agenda_events;
CREATE POLICY "Staff can manage accessible agenda events"
ON public.crm_agenda_events FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR seller_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR seller_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "Staff can view technical notebooks" ON public.crm_technical_notebooks;
CREATE POLICY "Staff can view technical notebooks"
ON public.crm_technical_notebooks FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "Staff can manage technical notebooks" ON public.crm_technical_notebooks;
CREATE POLICY "Staff can manage technical notebooks"
ON public.crm_technical_notebooks FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);
