CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.marketing_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'custom',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view marketing events" ON public.marketing_events FOR SELECT USING (true);
CREATE POLICY "Public can insert marketing events" ON public.marketing_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update marketing events" ON public.marketing_events FOR UPDATE USING (true);
CREATE POLICY "Public can delete marketing events" ON public.marketing_events FOR DELETE USING (true);

CREATE INDEX idx_marketing_events_date ON public.marketing_events(event_date);

CREATE TRIGGER trg_marketing_events_updated_at
BEFORE UPDATE ON public.marketing_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();