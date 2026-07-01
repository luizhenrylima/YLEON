-- Add operational CRM fields to projects without duplicating the existing project flow.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS crm_status text NOT NULL DEFAULT 'novo_atendimento',
  ADD COLUMN IF NOT EXISTS crm_expected_close_date date,
  ADD COLUMN IF NOT EXISTS crm_last_contact_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS crm_next_followup_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS crm_notes text;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_crm_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_crm_status_check CHECK (
    crm_status IN (
      'novo_atendimento',
      'briefing',
      'curadoria',
      'apresentacao',
      'orcamento',
      'negociacao',
      'revisao_tecnica',
      'pedido_aprovado',
      'producao',
      'entrega',
      'concluido',
      'perdido'
    )
  ) NOT VALID;

-- Keep this first constraint NOT VALID because later CRM migrations map newer
-- statuses before tightening the final allowed values.

CREATE INDEX IF NOT EXISTS idx_projects_crm_status ON public.projects(crm_status);
CREATE INDEX IF NOT EXISTS idx_projects_crm_next_followup_at ON public.projects(crm_next_followup_at);
CREATE INDEX IF NOT EXISTS idx_projects_user_crm_status ON public.projects(user_id, crm_status);
