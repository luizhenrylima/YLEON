-- CRM operacional para lojas de moveis: clientes, timeline, orcamentos,
-- pedidos, aprovacoes e pos-venda. Projetos existentes continuam sendo
-- a fonte do funil comercial.

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_crm_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_quote_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_order_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_delivery_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_approval_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_risk_level_check;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS crm_customer_id uuid,
  ADD COLUMN IF NOT EXISTS crm_expected_value numeric,
  ADD COLUMN IF NOT EXISTS crm_sold_value numeric,
  ADD COLUMN IF NOT EXISTS crm_quote_status text NOT NULL DEFAULT 'sem_orcamento',
  ADD COLUMN IF NOT EXISTS crm_order_status text NOT NULL DEFAULT 'sem_pedido',
  ADD COLUMN IF NOT EXISTS crm_delivery_status text NOT NULL DEFAULT 'sem_entrega',
  ADD COLUMN IF NOT EXISTS crm_approval_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS crm_margin_percent numeric,
  ADD COLUMN IF NOT EXISTS crm_risk_level text NOT NULL DEFAULT 'baixo';

ALTER TABLE public.projects
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
      'concluido',
      'perdido'
    )
  ) NOT VALID;

-- Keep intermediate CRM constraints NOT VALID. Later migrations normalize
-- commercial/order statuses and validate the final current constraints.

ALTER TABLE public.projects
  ADD CONSTRAINT projects_crm_quote_status_check CHECK (
    crm_quote_status IN ('sem_orcamento', 'rascunho', 'em_montagem', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'vencido')
  ) NOT VALID,
  ADD CONSTRAINT projects_crm_order_status_check CHECK (
    crm_order_status IN ('sem_pedido', 'montagem', 'revisao', 'aprovado', 'assinado', 'enviado_marca', 'confirmado', 'faturado', 'producao', 'transporte', 'recebido', 'entregue', 'ocorrencia', 'finalizado')
  ) NOT VALID,
  ADD CONSTRAINT projects_crm_delivery_status_check CHECK (
    crm_delivery_status IN ('sem_entrega', 'aguardando_recebimento', 'recebido_parcial', 'recebido_completo', 'recebido_ocorrencia', 'agendada', 'em_rota', 'entregue', 'montagem_agendada', 'montagem_concluida', 'assistencia')
  ) NOT VALID,
  ADD CONSTRAINT projects_crm_approval_status_check CHECK (
    crm_approval_status IN ('pendente', 'comercial_aprovado', 'tecnico_aprovado', 'financeiro_aprovado', 'aprovado', 'reprovado')
  ) NOT VALID,
  ADD CONSTRAINT projects_crm_risk_level_check CHECK (
    crm_risk_level IN ('baixo', 'medio', 'alto')
  ) NOT VALID;

-- Intermediate constraints intentionally stay NOT VALID for partially migrated databases.

CREATE TABLE IF NOT EXISTS public.crm_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  whatsapp text,
  email text,
  city text,
  address text,
  lead_source text,
  architect_name text,
  store_name text,
  customer_type text NOT NULL DEFAULT 'residencial',
  desired_style text,
  investment_range text,
  desired_rooms text[] NOT NULL DEFAULT '{}',
  purchase_deadline text,
  urgency_level text NOT NULL DEFAULT 'media',
  purchase_reason text,
  status text NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_customers_type_check CHECK (customer_type IN ('residencial', 'corporativo', 'arquiteto', 'construtora', 'incorporadora')),
  CONSTRAINT crm_customers_urgency_check CHECK (urgency_level IN ('baixa', 'media', 'alta', 'urgente')),
  CONSTRAINT crm_customers_status_check CHECK (status IN ('ativo', 'inativo', 'em_negociacao', 'perdido', 'concluido'))
);

DO $$
BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_crm_customer_id_fkey
    FOREIGN KEY (crm_customer_id) REFERENCES public.crm_customers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  interaction_type text NOT NULL DEFAULT 'atendimento',
  description text NOT NULL,
  next_action text,
  next_followup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gross_value numeric NOT NULL DEFAULT 0,
  discount_value numeric NOT NULL DEFAULT 0,
  final_value numeric NOT NULL DEFAULT 0,
  payment_terms text,
  valid_until date,
  status text NOT NULL DEFAULT 'rascunho',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_quotes_status_check CHECK (status IN ('rascunho', 'enviado', 'em_negociacao', 'aprovado', 'recusado', 'vencido'))
);

CREATE TABLE IF NOT EXISTS public.crm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.crm_quotes(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  seller_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'montagem',
  risk_level text NOT NULL DEFAULT 'baixo',
  expected_deadline date,
  real_deadline date,
  sent_to_brand_at timestamptz,
  brand_confirmed_at timestamptz,
  invoiced_at timestamptz,
  received_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_orders_status_check CHECK (status IN ('montagem', 'revisao', 'aprovado', 'assinado', 'enviado_marca', 'confirmado', 'faturado', 'producao', 'transporte', 'recebido_parcial', 'recebido_completo', 'recebido_ocorrencia', 'entrega_agendada', 'entregue', 'montagem_agendada', 'montagem_concluida', 'finalizado', 'ocorrencia')),
  CONSTRAINT crm_orders_risk_check CHECK (risk_level IN ('baixo', 'medio', 'alto'))
);

CREATE TABLE IF NOT EXISTS public.crm_order_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.crm_orders(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  approval_type text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejected_reason text,
  confirmation_text text,
  session_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_order_approvals_type_check CHECK (approval_type IN ('comercial', 'tecnico', 'gestor', 'financeiro', 'final')),
  CONSTRAINT crm_order_approvals_status_check CHECK (status IN ('pendente', 'aprovado', 'reprovado'))
);

CREATE TABLE IF NOT EXISTS public.crm_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.crm_orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issue_type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'aberta',
  due_date date,
  impact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_support_tickets_status_check CHECK (status IN ('aberta', 'analise', 'fornecedor', 'aguardando_peca', 'visita_agendada', 'execucao', 'resolvida', 'finalizada', 'reprovada'))
);

CREATE INDEX IF NOT EXISTS idx_projects_crm_customer_id ON public.projects(crm_customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_crm_quote_status ON public.projects(crm_quote_status);
CREATE INDEX IF NOT EXISTS idx_projects_crm_order_status ON public.projects(crm_order_status);
CREATE INDEX IF NOT EXISTS idx_projects_crm_delivery_status ON public.projects(crm_delivery_status);
CREATE INDEX IF NOT EXISTS idx_projects_crm_risk_level ON public.projects(crm_risk_level);
CREATE INDEX IF NOT EXISTS idx_crm_customers_seller ON public.crm_customers(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_status ON public.crm_customers(status);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON public.crm_interactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_quotes_project ON public.crm_quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_crm_orders_project ON public.crm_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_crm_support_tickets_project ON public.crm_support_tickets(project_id);

ALTER TABLE public.crm_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_order_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM customers are visible to staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers are visible to staff owners"
ON public.crm_customers FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be created by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be created by staff owners"
ON public.crm_customers FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be updated by staff owners" ON public.crm_customers;
CREATE POLICY "CRM customers can be updated by staff owners"
ON public.crm_customers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM customers can be deleted by admins" ON public.crm_customers;
CREATE POLICY "CRM customers can be deleted by admins"
ON public.crm_customers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "CRM interactions visible to project or customer owners" ON public.crm_interactions;
CREATE POLICY "CRM interactions visible to project or customer owners"
ON public.crm_interactions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_customers c WHERE c.id = customer_id AND c.seller_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "CRM interactions insert by staff owners" ON public.crm_interactions;
CREATE POLICY "CRM interactions insert by staff owners"
ON public.crm_interactions FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.crm_customers c WHERE c.id = customer_id AND c.seller_user_id = auth.uid())
);

DROP POLICY IF EXISTS "CRM interactions update by staff owners" ON public.crm_interactions;
CREATE POLICY "CRM interactions update by staff owners"
ON public.crm_interactions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

DROP POLICY IF EXISTS "CRM quotes visible to staff owners" ON public.crm_quotes;
CREATE POLICY "CRM quotes visible to staff owners"
ON public.crm_quotes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM quotes managed by staff owners" ON public.crm_quotes;
CREATE POLICY "CRM quotes managed by staff owners"
ON public.crm_quotes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM orders visible to staff owners" ON public.crm_orders;
CREATE POLICY "CRM orders visible to staff owners"
ON public.crm_orders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM orders managed by staff owners" ON public.crm_orders;
CREATE POLICY "CRM orders managed by staff owners"
ON public.crm_orders FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'admin') OR seller_user_id = auth.uid());

DROP POLICY IF EXISTS "CRM approvals visible through order or project" ON public.crm_order_approvals;
CREATE POLICY "CRM approvals visible through order or project"
ON public.crm_order_approvals FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND o.seller_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "CRM approvals managed by staff" ON public.crm_order_approvals;
CREATE POLICY "CRM approvals managed by staff"
ON public.crm_order_approvals FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND o.seller_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.crm_orders o WHERE o.id = order_id AND o.seller_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "CRM support tickets visible to staff owners" ON public.crm_support_tickets;
CREATE POLICY "CRM support tickets visible to staff owners"
ON public.crm_support_tickets FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR responsible_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);

DROP POLICY IF EXISTS "CRM support tickets managed by staff owners" ON public.crm_support_tickets;
CREATE POLICY "CRM support tickets managed by staff owners"
ON public.crm_support_tickets FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR responsible_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR responsible_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.can_access_profile(auth.uid(), p.user_id))
);
