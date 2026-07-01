-- Split CRM into two flows:
-- 1. Commercial Kanban in projects.crm_status
-- 2. Order management in projects.crm_order_status / crm_orders.status
--
-- Existing data is mapped before constraints are tightened, so old projects keep
-- working without leaving deprecated statuses writable after this migration.

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_crm_status_check,
  DROP CONSTRAINT IF EXISTS projects_crm_order_status_check;

UPDATE public.projects
SET
  crm_order_status = CASE
    WHEN crm_status IN ('revisao_tecnica', 'pedido_aprovado', 'pedido_assinado', 'venda_concluida', 'concluido') THEN 'revisao_tecnica'
    WHEN crm_status = 'pedido_faturado' THEN 'pedido_faturado'
    WHEN crm_status = 'producao' THEN 'producao'
    WHEN crm_status = 'transporte' THEN 'transporte'
    WHEN crm_status IN ('recebido_loja') THEN 'recebido_loja'
    WHEN crm_status IN ('entrega', 'entrega_agendada') THEN 'entrega_agendada'
    WHEN crm_status IN ('entregue', 'pos_venda') THEN 'entregue'
    WHEN crm_order_status IN ('montagem', 'revisao', 'aprovado', 'assinado', 'enviado_marca', 'confirmado') THEN 'revisao_tecnica'
    WHEN crm_order_status = 'faturado' THEN 'pedido_faturado'
    WHEN crm_order_status = 'producao' THEN 'producao'
    WHEN crm_order_status = 'transporte' THEN 'transporte'
    WHEN crm_order_status IN ('recebido', 'recebido_parcial', 'recebido_completo', 'recebido_ocorrencia') THEN 'recebido_loja'
    WHEN crm_order_status IN ('entrega_agendada', 'montagem_agendada') THEN 'entrega_agendada'
    WHEN crm_order_status IN ('entregue', 'montagem_concluida', 'finalizado') THEN 'entregue'
    WHEN crm_status IN ('perdido') THEN 'sem_pedido'
    ELSE COALESCE(NULLIF(crm_order_status, ''), 'sem_pedido')
  END,
  sale_completed_at = CASE
    WHEN crm_status IN ('pedido_assinado', 'pedido_faturado', 'producao', 'transporte', 'recebido_loja', 'entrega', 'entrega_agendada', 'entregue', 'pos_venda', 'venda_concluida', 'concluido')
      AND sale_completed_at IS NULL
    THEN COALESCE(created_at, now())
    ELSE sale_completed_at
  END,
  crm_status = CASE
    WHEN crm_status IN ('briefing', 'briefing_iniciado') THEN 'briefing_visita'
    WHEN crm_status IN ('curadoria', 'curadoria_produtos') THEN 'curadoria_produtos'
    WHEN crm_status IN ('apresentacao', 'apresentacao_enviada', 'orcamento', 'orcamento_montagem', 'orcamento_enviado') THEN 'proposta_orcamento'
    WHEN crm_status IN ('followup_agendado', 'negociacao', 'aguardando_aprovacao') THEN 'followup_negociacao'
    WHEN crm_status IN ('revisao_tecnica', 'pedido_aprovado', 'pedido_assinado', 'pedido_faturado', 'producao', 'transporte', 'recebido_loja', 'entrega', 'entrega_agendada', 'entregue', 'pos_venda', 'venda_concluida', 'concluido') THEN 'pedido_fechado'
    WHEN crm_status = 'perdido' THEN 'perdido'
    ELSE 'novo_atendimento'
  END;

UPDATE public.projects
SET crm_order_status = 'sem_pedido'
WHERE crm_order_status IS NULL
   OR crm_order_status NOT IN ('sem_pedido', 'revisao_tecnica', 'pedido_faturado', 'producao', 'transporte', 'recebido_loja', 'entrega_agendada', 'entregue');

ALTER TABLE public.projects
  ADD CONSTRAINT projects_crm_status_check CHECK (
    crm_status IN (
      'novo_atendimento',
      'briefing_visita',
      'curadoria_produtos',
      'proposta_orcamento',
      'followup_negociacao',
      'pedido_fechado',
      'perdido'
    )
  ) NOT VALID,
  ADD CONSTRAINT projects_crm_order_status_check CHECK (
    crm_order_status IN (
      'sem_pedido',
      'revisao_tecnica',
      'pedido_faturado',
      'producao',
      'transporte',
      'recebido_loja',
      'entrega_agendada',
      'entregue'
    )
  ) NOT VALID;

ALTER TABLE public.projects VALIDATE CONSTRAINT projects_crm_status_check;
ALTER TABLE public.projects VALIDATE CONSTRAINT projects_crm_order_status_check;

ALTER TABLE public.crm_orders
  DROP CONSTRAINT IF EXISTS crm_orders_status_check;

UPDATE public.crm_orders
SET status = CASE
  WHEN status IN ('montagem', 'revisao', 'aprovado', 'assinado', 'enviado_marca', 'confirmado', 'ocorrencia') THEN 'revisao_tecnica'
  WHEN status = 'faturado' THEN 'pedido_faturado'
  WHEN status = 'producao' THEN 'producao'
  WHEN status = 'transporte' THEN 'transporte'
  WHEN status IN ('recebido', 'recebido_parcial', 'recebido_completo', 'recebido_ocorrencia') THEN 'recebido_loja'
  WHEN status IN ('entrega_agendada', 'montagem_agendada') THEN 'entrega_agendada'
  WHEN status IN ('entregue', 'montagem_concluida', 'finalizado') THEN 'entregue'
  ELSE 'revisao_tecnica'
END;

ALTER TABLE public.crm_orders
  ADD CONSTRAINT crm_orders_status_check CHECK (
    status IN (
      'revisao_tecnica',
      'pedido_faturado',
      'producao',
      'transporte',
      'recebido_loja',
      'entrega_agendada',
      'entregue'
    )
  ) NOT VALID;

ALTER TABLE public.crm_orders VALIDATE CONSTRAINT crm_orders_status_check;

CREATE INDEX IF NOT EXISTS idx_projects_commercial_status ON public.projects(crm_status);
CREATE INDEX IF NOT EXISTS idx_projects_order_status ON public.projects(crm_order_status);
CREATE INDEX IF NOT EXISTS idx_crm_orders_status ON public.crm_orders(status);
