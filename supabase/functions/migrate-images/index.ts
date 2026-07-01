import { requireAdmin } from "../_shared/admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToUint8Array(base64String: string): { data: Uint8Array; mimeType: string } {
  const match = base64String.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URL");
  const mimeType = match[1];
  const raw = atob(match[2]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { data: arr, mimeType };
}

function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  };
  return map[mimeType] || "jpg";
}

function isExternalUrl(url: string, supabaseUrl: string): boolean {
  return url.startsWith("http") && !url.includes(supabaseUrl.replace("https://", ""));
}

async function uploadExternalUrl(supabase: any, url: string, path: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const contentType = blob.type || "image/jpeg";
    const buffer = new Uint8Array(await blob.arrayBuffer());
    
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, buffer, { contentType, upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    return urlData.publicUrl;
  } catch (e) {
    console.error("Failed to upload external URL:", url, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = await requireAdmin(req, corsHeaders);
    if ("response" in admin) return admin.response;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = admin.supabase;

    const results = { products: 0, finishes: 0, brands: 0, errors: [] as string[] };

    // --- Migrate product images (base64 + external URLs) ---
    const { data: products } = await supabase
      .from("products")
      .select("id, images")
      .not("images", "is", null);

    for (const product of products || []) {
      if (!product.images || product.images.length === 0) continue;

      const newUrls: string[] = [];
      let changed = false;

      for (let i = 0; i < product.images.length; i++) {
        const img = product.images[i];
        
        if (img.startsWith("data:")) {
          // Base64 migration
          try {
            const { data, mimeType } = base64ToUint8Array(img);
            const ext = getExtension(mimeType);
            const path = `products/${product.id}/${i}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("product-images").upload(path, data, { contentType: mimeType, upsert: true });
            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
            newUrls.push(urlData.publicUrl);
            changed = true;
          } catch (e) {
            results.errors.push(`Product ${product.id} img ${i}: ${e.message}`);
            newUrls.push(img);
          }
        } else if (isExternalUrl(img, supabaseUrl)) {
          // External URL migration
          const ext = img.split('.').pop()?.split('?')[0]?.substring(0, 4) || 'jpg';
          const path = `products/${product.id}/${i}.${ext}`;
          const storageUrl = await uploadExternalUrl(supabase, img, path);
          if (storageUrl) {
            newUrls.push(storageUrl);
            changed = true;
          } else {
            results.errors.push(`Product ${product.id} img ${i}: failed to download`);
            newUrls.push(img);
          }
        } else {
          newUrls.push(img); // Already in storage
        }
      }

      if (changed) {
        const { error } = await supabase.from("products").update({ images: newUrls }).eq("id", product.id);
        if (error) results.errors.push(`Product update ${product.id}: ${error.message}`);
        else results.products++;
      }
    }

    // --- Migrate finish images ---
    const { data: finishes } = await supabase
      .from("finishes")
      .select("id, image_url, finish_category_id");

    for (const finish of finishes || []) {
      const url = finish.image_url;
      if (!url) continue;
      
      let newUrl: string | null = null;
      
      if (url.startsWith("data:")) {
        try {
          const { data, mimeType } = base64ToUint8Array(url);
          const ext = getExtension(mimeType);
          const path = `finishes/${finish.finish_category_id}/${finish.id}.${ext}`;
          const { error } = await supabase.storage.from("product-images").upload(path, data, { contentType: mimeType, upsert: true });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
          newUrl = urlData.publicUrl;
        } catch (e) {
          results.errors.push(`Finish ${finish.id}: ${e.message}`);
        }
      } else if (isExternalUrl(url, supabaseUrl)) {
        const path = `finishes/${finish.finish_category_id}/${finish.id}.jpg`;
        newUrl = await uploadExternalUrl(supabase, url, path);
        if (!newUrl) results.errors.push(`Finish ${finish.id}: failed to download`);
      }

      if (newUrl) {
        const { error } = await supabase.from("finishes").update({ image_url: newUrl }).eq("id", finish.id);
        if (error) results.errors.push(`Finish update ${finish.id}: ${error.message}`);
        else results.finishes++;
      }
    }

    // --- Migrate brand logos ---
    const { data: brands } = await supabase.from("brands").select("id, logo_url");

    for (const brand of brands || []) {
      const url = brand.logo_url;
      if (!url) continue;
      
      let newUrl: string | null = null;
      
      if (url.startsWith("data:")) {
        try {
          const { data, mimeType } = base64ToUint8Array(url);
          const ext = getExtension(mimeType);
          const path = `brands/${brand.id}/logo.${ext}`;
          const { error } = await supabase.storage.from("product-images").upload(path, data, { contentType: mimeType, upsert: true });
          if (error) throw error;
          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
          newUrl = urlData.publicUrl;
        } catch (e) {
          results.errors.push(`Brand ${brand.id}: ${e.message}`);
        }
      } else if (isExternalUrl(url, supabaseUrl)) {
        const path = `brands/${brand.id}/logo.jpg`;
        newUrl = await uploadExternalUrl(supabase, url, path);
        if (!newUrl) results.errors.push(`Brand ${brand.id}: failed to download`);
      }

      if (newUrl) {
        const { error } = await supabase.from("brands").update({ logo_url: newUrl }).eq("id", brand.id);
        if (error) results.errors.push(`Brand update ${brand.id}: ${error.message}`);
        else results.brands++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, migrated: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
