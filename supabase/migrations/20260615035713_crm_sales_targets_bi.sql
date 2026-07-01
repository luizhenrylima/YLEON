-- Sales goals used by the CRM BI dashboard.

CREATE TABLE IF NOT EXISTS public.crm_sales_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  period_month date NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (seller_user_id, period_month),
  CONSTRAINT crm_sales_targets_period_month_check CHECK (period_month = date_trunc('month', period_month)::date),
  CONSTRAINT crm_sales_targets_value_check CHECK (target_value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_crm_sales_targets_period ON public.crm_sales_targets(period_month);
CREATE INDEX IF NOT EXISTS idx_crm_sales_targets_seller ON public.crm_sales_targets(seller_user_id, period_month);

ALTER TABLE public.crm_sales_targets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_sales_targets TO authenticated;

DROP POLICY IF EXISTS "Admins can manage sales targets" ON public.crm_sales_targets;
CREATE POLICY "Admins can manage sales targets"
ON public.crm_sales_targets FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Sellers can view own sales targets" ON public.crm_sales_targets;
CREATE POLICY "Sellers can view own sales targets"
ON public.crm_sales_targets FOR SELECT TO authenticated
USING (seller_user_id = auth.uid());
