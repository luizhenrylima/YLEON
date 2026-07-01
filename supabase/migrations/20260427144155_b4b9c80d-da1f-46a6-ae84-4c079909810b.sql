
ALTER TABLE public.marketing_events ADD COLUMN IF NOT EXISTS preview_image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-previews', 'marketing-previews', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public insert marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public update marketing-previews" ON storage.objects;
DROP POLICY IF EXISTS "Public delete marketing-previews" ON storage.objects;

CREATE POLICY "Public read marketing-previews" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketing-previews');
CREATE POLICY "Public insert marketing-previews" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'marketing-previews');
CREATE POLICY "Public update marketing-previews" ON storage.objects
  FOR UPDATE USING (bucket_id = 'marketing-previews');
CREATE POLICY "Public delete marketing-previews" ON storage.objects
  FOR DELETE USING (bucket_id = 'marketing-previews');
