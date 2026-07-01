import { supabase } from '@/integrations/supabase/client';
import { checkClientRateLimit, rateLimitMessage } from '@/lib/rateLimit';
import { firstZodMessage, sanitizePlainText, uploadFileSchema } from '@/lib/validation';

const BUCKET = 'product-images';

/**
 * Upload a file to storage and return the public URL.
 * Falls back to base64 data URL on error.
 */
export async function uploadToStorage(
  file: File,
  folder: string,
  fileName?: string
): Promise<string> {
  const parsed = uploadFileSchema.safeParse({ name: file.name, size: file.size, type: file.type });
  if (!parsed.success) throw new Error(firstZodMessage(parsed.error));

  const rate = checkClientRateLimit('upload:image', folder);
  if (!rate.allowed) throw new Error(rateLimitMessage(rate));

  const ext = file.name.split('.').pop() || 'jpg';
  const safeFolder = sanitizePlainText(folder, 80).replace(/[^a-zA-Z0-9/_-]/g, '-');
  const safeName = fileName ? sanitizePlainText(fileName, 120).replace(/[^a-zA-Z0-9._-]/g, '-') : `${crypto.randomUUID()}.${ext}`;
  const path = `${safeFolder}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(`Falha ao enviar imagem para o storage: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload multiple files and return their public URLs.
 */
export async function uploadMultipleToStorage(
  files: File[],
  folder: string
): Promise<string[]> {
  return Promise.all(files.map(f => uploadToStorage(f, folder)));
}
