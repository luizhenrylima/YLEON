import { enforceRateLimit, requireAdmin } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = await requireAdmin(req, corsHeaders);
  if ("response" in admin) return admin.response;
  const limited = await enforceRateLimit(admin.supabase, req, admin.user.id, "admin:compress-finishes", 20, 900, 1800);
  if (limited) return limited;

  const { offset = 0, limit = 10 } = await req.json().catch(() => ({}));

  const supabase = admin.supabase;

  const BRAND_ID = "54d7141b-853b-4646-be50-0a7db17546e6";
  const BUCKET = "product-images";
  const BASE_PUBLIC = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${BUCKET}/`;
  const MAX_DIM = 400;
  const QUALITY = 75;

  const { data: cats } = await supabase
    .from("finish_categories")
    .select("id")
    .eq("brand_id", BRAND_ID);

  const catIds = (cats || []).map((c: any) => c.id);
  
  const { data: finishes, count } = await supabase
    .from("finishes")
    .select("id, image_url", { count: "exact" })
    .in("finish_category_id", catIds)
    .order("display_order")
    .range(offset, offset + limit - 1);

  if (!finishes || finishes.length === 0) {
    return new Response(JSON.stringify({ done: true, total: count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");

  const results: any[] = [];
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const finish of finishes) {
    const url = finish.image_url;
    if (!url.startsWith(BASE_PUBLIC)) {
      results.push({ id: finish.id, status: "skipped" });
      continue;
    }
    const storagePath = url.replace(BASE_PUBLIC, "");

    try {
      const imgResp = await fetch(url);
      const originalBytes = new Uint8Array(await imgResp.arrayBuffer());
      const origSize = originalBytes.byteLength;
      totalOriginal += origSize;

      const img = await Image.decode(originalBytes);
      
      if (img.width > MAX_DIM || img.height > MAX_DIM) {
        if (img.width > img.height) {
          img.resize(MAX_DIM, Image.RESIZE_AUTO);
        } else {
          img.resize(Image.RESIZE_AUTO, MAX_DIM);
        }
      }

      const compressed = await img.encodeJPEG(QUALITY);
      totalCompressed += compressed.byteLength;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, compressed, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (error) {
        results.push({ id: finish.id, status: "error", error: error.message });
      } else {
        results.push({
          id: finish.id,
          status: "ok",
          orig_kb: Math.round(origSize / 1024),
          new_kb: Math.round(compressed.byteLength / 1024),
        });
      }
    } catch (e: any) {
      results.push({ id: finish.id, status: "error", error: e.message });
    }
  }

  return new Response(
    JSON.stringify({
      processed: finishes.length,
      total: count,
      next_offset: offset + limit,
      has_more: offset + limit < (count || 0),
      total_original_kb: Math.round(totalOriginal / 1024),
      total_compressed_kb: Math.round(totalCompressed / 1024),
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
