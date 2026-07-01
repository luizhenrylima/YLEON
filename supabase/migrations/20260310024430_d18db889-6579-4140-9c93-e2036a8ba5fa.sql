
-- Featured designers table (max 2)
CREATE TABLE public.featured_designers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  photo_url text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.featured_designers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view featured_designers"
  ON public.featured_designers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert featured_designers"
  ON public.featured_designers FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update featured_designers"
  ON public.featured_designers FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete featured_designers"
  ON public.featured_designers FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Landing images table
CREATE TABLE public.landing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  alt_text text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.landing_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view landing_images"
  ON public.landing_images FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert landing_images"
  ON public.landing_images FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update landing_images"
  ON public.landing_images FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete landing_images"
  ON public.landing_images FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Seed initial designers
INSERT INTO public.featured_designers (name, description, display_order) VALUES
  ('Sergio Rodrigues', 'Considerado um dos maiores designers de mobiliário do Brasil. Suas criações unem a brasilidade com o conforto, utilizando madeiras nobres e couro natural em peças icônicas como a Poltrona Mole.', 0),
  ('WENTZ', 'Marca brasileira de design contemporâneo que une sofisticação e funcionalidade. Reconhecida internacionalmente por peças com linhas limpas, materiais naturais e acabamentos impecáveis.', 1);
