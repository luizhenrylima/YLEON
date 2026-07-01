import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2/scrape";
const PRODUCT_IMAGES_BUCKET = "product-images";

interface FinishSwatch {
  name: string;
  imageUrl: string;
}

interface ParsedFinishCategory {
  name: string;
  finishGroup: string;
  swatches: FinishSwatch[];
}

interface IndexedHeading {
  name: string;
  level: number;
  index: number;
  end: number;
}

interface ImportCategorySummary {
  name: string;
  finishGroup: string;
  found: number;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      response: new Response(JSON.stringify({ error: "Supabase environment is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    return {
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });

  if (roleError || !isAdmin) {
    return {
      response: new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return { supabase: adminClient, user };
}

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    "#039": "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z0-9#]+);/g, (match, entity) => entities[entity] ?? match);
}

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function absoluteUrl(rawUrl: string, baseUrl: string): string {
  return new URL(decodeHtml(rawUrl), baseUrl).toString();
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || crypto.randomUUID();
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function scrape(url: string) {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return scrapeDirectly(url);

  try {
    const response = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html", "markdown"],
        onlyMainContent: false,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Firecrawl retornou HTTP ${response.status}`);

    const data = payload?.data ?? payload;
    return {
      html: String(data?.html ?? data?.content?.html ?? data?.content ?? ""),
      markdown: String(data?.markdown ?? ""),
      metadata: data?.metadata ?? {},
    };
  } catch (error) {
    console.warn("Firecrawl scrape failed, falling back to direct HTML fetch", error);
    return scrapeDirectly(url);
  }
}

async function scrapeDirectly(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Acervo1055Bot/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) throw new Error(`Site retornou HTTP ${response.status}`);
  return { html: await response.text(), markdown: "", metadata: {} };
}

function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function firstMatchIndex(html: string, patterns: RegExp[], from = 0): number {
  let index = -1;
  const search = html.slice(from);
  for (const pattern of patterns) {
    const match = search.match(pattern);
    if (!match || match.index === undefined) continue;
    const absoluteIndex = from + match.index;
    if (index === -1 || absoluteIndex < index) index = absoluteIndex;
  }
  return index;
}

function sliceSection(html: string, type: "fabrics" | "finishes"): string {
  const start = type === "fabrics"
    ? firstMatchIndex(html, [/id=["']headingTecidos["']/i, /Tecidos\s+Dispon/i])
    : firstMatchIndex(html, [/id=["']headingAcabamentos["']/i, /Acabamentos\s+Dispon/i]);

  if (start < 0) return "";

  const end = type === "fabrics"
    ? firstMatchIndex(html, [/id=["']headingAcabamentos["']/i, /acabamentos\s+dispon/i], start + 1)
    : firstMatchIndex(html, [/<section\b[^>]+id=["']gallery-ambientes-produto["'][^>]*data-aos=["']fade-in["']/i, /<footer\b/i], start + 1);

  return stripComments(html.slice(start, end > start ? end : undefined));
}

function extractSwatches(block: string, sourceUrl: string): FinishSwatch[] {
  const swatches: FinishSwatch[] = [];
  const seen = new Set<string>();
  const swatchRegex = /<div\b[^>]*class=["'][^"']*\bsingle-amostra\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;

  for (const match of block.matchAll(swatchRegex)) {
    const inner = match[1] ?? "";
    const imageMatch = inner.match(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/i);
    const name = cleanText(inner.match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1]);
    if (!imageMatch?.[1] || !name) continue;

    const imageUrl = absoluteUrl(imageMatch[1], sourceUrl);
    const key = normalizeKey(`${name} ${imageUrl}`);
    if (seen.has(key)) continue;
    seen.add(key);
    swatches.push({ name, imageUrl });
  }

  return swatches;
}

function getAttribute(tag: string, attribute: string): string {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]).trim() : "";
}

function firstSrcFromSrcset(srcset: string): string {
  return srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0]).find(Boolean) ?? "";
}

function imageUrlFromTag(tag: string): string {
  return getAttribute(tag, "src")
    || getAttribute(tag, "data-src")
    || getAttribute(tag, "data-lazy-src")
    || getAttribute(tag, "data-original")
    || firstSrcFromSrcset(getAttribute(tag, "srcset") || getAttribute(tag, "data-srcset"));
}

function isUsableImageUrl(rawUrl: string): boolean {
  if (!rawUrl || /^data:/i.test(rawUrl)) return false;
  if (/\.svg(?:[?#].*)?$/i.test(rawUrl)) return false;
  if (/(?:logo|favicon|sprite|placeholder|loading|spinner|blank)\b/i.test(rawUrl)) return false;
  return true;
}

function nameFromUrl(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl, "https://example.com").pathname;
    const fileName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
    return fileName
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b(?:thumb|thumbnail|image|img|foto|photo|amostra|swatch)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function isGenericText(value: string): boolean {
  const text = normalizeKey(value);
  if (!text || text.length < 2 || text.length > 80) return true;
  return /^(imagem|image|foto|photo|produto|product|acabamento|acabamentos|finish|finishes|tecido|tecidos|fabric|fabrics|cor|cores|color|colors|amostra|amostras|swatch|swatches|ver mais|saiba mais|download)$/.test(text);
}

function bestTextCandidate(candidates: string[]): string {
  for (const candidate of candidates) {
    const text = cleanText(candidate)
      .replace(/\b(?:clique|ver|saiba)\s+mais\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!isGenericText(text)) return text;
  }
  return "";
}

function extractNearbyName(context: string, imageTag: string, imageUrl: string): string {
  const attributeName = bestTextCandidate([
    getAttribute(imageTag, "alt"),
    getAttribute(imageTag, "title"),
    getAttribute(imageTag, "aria-label"),
  ]);
  if (attributeName) return attributeName;

  const afterImage = context.slice(context.indexOf(imageTag) + imageTag.length);
  const beforeImage = context.slice(0, Math.max(0, context.indexOf(imageTag)));
  const textPattern = /<(?:figcaption|h[3-6]|p|span|strong|a|button)\b[^>]*>([\s\S]{0,180}?)<\/(?:figcaption|h[3-6]|p|span|strong|a|button)>/gi;
  const afterCandidates = [...afterImage.matchAll(textPattern)].slice(0, 6).map((match) => match[1]);
  const beforeCandidates = [...beforeImage.matchAll(textPattern)].slice(-6).reverse().map((match) => match[1]);
  return bestTextCandidate([...afterCandidates, ...beforeCandidates, nameFromUrl(imageUrl)]);
}

function finishGroupFromText(value: string): string {
  const text = normalizeKey(value);
  if (/\b(tecido|tecidos|fabric|fabrics|textil|textile|couro|leather|linho|veludo|suede)\b/.test(text)) {
    return "Tecidos";
  }
  return "Superf\u00edcies e Pinturas";
}

function looksLikeFinishText(value: string): boolean {
  return /\b(acabamentos?|finishes?|tecidos?|fabrics?|amostras?|swatches?|materiais?|materials?|cores?|colors?|pinturas?|paint|laminados?|madeiras?|woods?|lacas?|lacquer|verniz|veneer|metal|metais|marble|marmore|stone|pedra|glass|vidro)\b/i.test(value);
}

function cleanupCategoryName(value: string, fallback: string): string {
  const cleaned = cleanText(value)
    .replace(/\b(?:acabamentos?|finishes?|dispon[ií]veis?|available|op[cç][oõ]es?|options|materiais?|materials?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || isGenericText(cleaned)) return fallback;
  return cleaned;
}

function collectHeadings(html: string): IndexedHeading[] {
  return [...html.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({
      name: cleanText(match[2]),
      level: Number(match[1]),
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }))
    .filter((heading) => heading.name);
}

function hasNestedFinishHeading(block: string, parentLevel: number): boolean {
  if (parentLevel >= 6) return false;
  const nestedHeadingRegex = new RegExp(`<h([${parentLevel + 1}-6])\\b[^>]*>([\\s\\S]*?)<\\/h\\1>`, "gi");
  return [...block.matchAll(nestedHeadingRegex)]
    .some((match) => looksLikeFinishText(cleanText(match[2])));
}

function extractGenericSwatches(block: string, sourceUrl: string, requireFinishContext = false): FinishSwatch[] {
  const swatches: FinishSwatch[] = [];
  const seen = new Set<string>();
  const imageRegex = /<img\b[^>]*>/gi;

  for (const match of block.matchAll(imageRegex)) {
    const imageTag = match[0];
    const rawImageUrl = imageUrlFromTag(imageTag);
    if (!isUsableImageUrl(rawImageUrl)) continue;

    const imageIndex = match.index ?? 0;
    const context = block.slice(Math.max(0, imageIndex - 900), Math.min(block.length, imageIndex + imageTag.length + 900));
    const name = extractNearbyName(context, imageTag, rawImageUrl);
    if (!name) continue;
    if (requireFinishContext && !looksLikeFinishText(`${context} ${imageTag} ${name} ${rawImageUrl}`)) continue;

    const imageUrl = absoluteUrl(rawImageUrl, sourceUrl);
    const key = normalizeKey(`${name} ${imageUrl}`);
    if (seen.has(key)) continue;
    seen.add(key);
    swatches.push({ name, imageUrl });
  }

  return swatches;
}

function mergeCategories(categories: ParsedFinishCategory[]): ParsedFinishCategory[] {
  const byKey = new Map<string, ParsedFinishCategory>();

  for (const category of categories) {
    const key = normalizeKey(`${category.finishGroup} ${category.name}`);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...category, swatches: [...category.swatches] });
      continue;
    }

    const seen = new Set(existing.swatches.map((swatch) => normalizeKey(`${swatch.name} ${swatch.imageUrl}`)));
    for (const swatch of category.swatches) {
      const swatchKey = normalizeKey(`${swatch.name} ${swatch.imageUrl}`);
      if (seen.has(swatchKey)) continue;
      seen.add(swatchKey);
      existing.swatches.push(swatch);
    }
  }

  return [...byKey.values()].filter((category) => category.swatches.length);
}

function extractGenericFinishCategories(html: string, sourceUrl: string): ParsedFinishCategory[] {
  const cleanHtml = stripComments(html);
  const headings = collectHeadings(cleanHtml);
  const categories: ParsedFinishCategory[] = [];

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const nextIndex = headings.find((candidate, index) => index > i && candidate.level <= heading.level)?.index ?? cleanHtml.length;
    const block = cleanHtml.slice(heading.end, nextIndex);
    const headingLooksRelevant = looksLikeFinishText(heading.name);
    const blockLooksRelevant = looksLikeFinishText(block.slice(0, 2000));
    if (!headingLooksRelevant && !blockLooksRelevant) continue;
    if (headingLooksRelevant && isGenericText(cleanupCategoryName(heading.name, "")) && hasNestedFinishHeading(block, heading.level)) {
      continue;
    }

    const swatches = extractGenericSwatches(block, sourceUrl, !headingLooksRelevant);
    if (!swatches.length) continue;

    const finishGroup = finishGroupFromText(`${heading.name} ${block.slice(0, 1000)}`);
    const fallbackName = finishGroup === "Tecidos" ? "Tecidos" : "Acabamentos";
    categories.push({
      name: cleanupCategoryName(heading.name, fallbackName),
      finishGroup,
      swatches,
    });
  }

  const sectionRegex = /<(?:section|article|div)\b[^>]*(?:id|class)=["'][^"']*(?:acabamento|finish|tecido|fabric|amostra|swatch|material|color|cor)[^"']*["'][^>]*>/gi;
  for (const match of cleanHtml.matchAll(sectionRegex)) {
    const start = match.index ?? 0;
    const end = firstMatchIndex(cleanHtml, [/<section\b/i, /<article\b/i, /<footer\b/i], start + match[0].length);
    const block = cleanHtml.slice(start, end > start ? end : Math.min(cleanHtml.length, start + 15000));
    const swatches = extractGenericSwatches(block, sourceUrl);
    if (!swatches.length) continue;

    const headingName = cleanText(block.match(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/i)?.[1]);
    const finishGroup = finishGroupFromText(`${match[0]} ${headingName} ${block.slice(0, 1000)}`);
    categories.push({
      name: cleanupCategoryName(headingName, finishGroup === "Tecidos" ? "Tecidos" : "Acabamentos"),
      finishGroup,
      swatches,
    });
  }

  if (categories.length === 0 && looksLikeFinishText(cleanHtml)) {
    const swatches = extractGenericSwatches(cleanHtml, sourceUrl, true);
    if (swatches.length) {
      const finishGroup = finishGroupFromText(cleanHtml);
      categories.push({
        name: finishGroup === "Tecidos" ? "Tecidos" : "Acabamentos",
        finishGroup,
        swatches,
      });
    }
  }

  return mergeCategories(categories);
}

function extractCategoriesFromSection(section: string, finishGroup: string, sourceUrl: string): ParsedFinishCategory[] {
  const headings = [...section.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]
    .map((match) => ({
      name: cleanText(match[1]),
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    }))
    .filter((heading) => heading.name);

  const categories: ParsedFinishCategory[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const nextIndex = headings[i + 1]?.index ?? section.length;
    const block = section.slice(heading.end, nextIndex);
    const swatches = extractSwatches(block, sourceUrl);
    const categoryKey = normalizeKey(`${finishGroup} ${heading.name}`);
    if (!swatches.length || seen.has(categoryKey)) continue;
    seen.add(categoryKey);
    categories.push({ name: heading.name, finishGroup, swatches });
  }

  return categories;
}

function isCenturyUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("meucentury.com");
  } catch {
    return false;
  }
}

function extractCenturyFinishCategories(html: string, sourceUrl: string): ParsedFinishCategory[] {
  const fabrics = extractCategoriesFromSection(sliceSection(html, "fabrics"), "Tecidos", sourceUrl);
  const finishes = extractCategoriesFromSection(sliceSection(html, "finishes"), "Superf\u00edcies e Pinturas", sourceUrl);
  return [...fabrics, ...finishes];
}

function extractFinishCategories(html: string, sourceUrl: string): ParsedFinishCategory[] {
  const centuryCategories = isCenturyUrl(sourceUrl) ? extractCenturyFinishCategories(html, sourceUrl) : [];
  if (centuryCategories.length) return centuryCategories;
  return extractGenericFinishCategories(html, sourceUrl);
}

async function uploadExternalFinishImage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  sourceSlug: string,
  categorySlug: string,
  finishSlug: string,
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Falha ao baixar imagem ${imageUrl}`);

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const blob = await response.blob();
  const path = `finishes/imports/${sourceSlug}/${categorySlug}/${finishSlug}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function ensureBrand(supabase: ReturnType<typeof createClient>, name: string, segment: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from("brands")
    .select("id, name")
    .ilike("name", name)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("brands")
    .insert({ name, segment })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

function inferBrandNameFromUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const first = host.split(".")[0] || "Marca";
  return first
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function ensureFinishCategory(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  name: string,
  finishGroup: string,
): Promise<{ id: string; created: boolean }> {
  const { data: categories, error: listError } = await supabase
    .from("finish_categories")
    .select("id, name, finish_group, display_order")
    .eq("brand_id", brandId)
    .order("display_order");

  if (listError) throw listError;

  const existing = (categories ?? []).find((category: { name: string }) => normalizeKey(category.name) === normalizeKey(name));
  if (existing?.id) {
    if (existing.finish_group !== finishGroup) {
      const { error } = await supabase
        .from("finish_categories")
        .update({ finish_group: finishGroup })
        .eq("id", existing.id);
      if (error) throw error;
    }
    return { id: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("finish_categories")
    .insert({
      brand_id: brandId,
      name,
      finish_group: finishGroup,
      display_order: categories?.length ?? 0,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, created: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireAdmin(req);
    if ("response" in auth) return auth.response;
    const { data: rateLimit } = await auth.supabase.rpc("check_rate_limit", {
      _action: "admin:bulk-import-finishes",
      _scope: auth.user.id,
      _max_hits: 8,
      _window_seconds: 900,
      _block_seconds: 1800,
      _actor_user_id: auth.user.id,
      _ip_address: null,
    });
    if (rateLimit?.allowed === false) {
      return new Response(JSON.stringify({ error: "Muitas importacoes em pouco tempo. Aguarde alguns minutos e tente novamente." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      sourceUrl,
      brandName = "",
      brandSegment = "high",
    } = await req.json();

    if (!sourceUrl || typeof sourceUrl !== "string") {
      return new Response(JSON.stringify({ error: "sourceUrl e obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedUrl = new URL(sourceUrl);
    const resolvedBrandName = cleanText(String(brandName || "")) || inferBrandNameFromUrl(parsedUrl.toString());
    const sourceSlug = slugify(parsedUrl.hostname.replace(/^www\./, ""));

    const sourcePage = await scrape(parsedUrl.toString());
    const parsedCategories = extractFinishCategories(sourcePage.html, parsedUrl.toString()).slice(0, 80);
    if (!parsedCategories.length) {
      return new Response(JSON.stringify({
        success: false,
        error: "Nenhum acabamento foi encontrado nesta pagina. Tente uma URL que tenha amostras, tecidos, cores ou materiais visiveis.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brandId = await ensureBrand(auth.supabase, resolvedBrandName, brandSegment);
    const summaries: ImportCategorySummary[] = [];
    let categoriesCreated = 0;
    let categoriesExisting = 0;
    let finishesCreated = 0;
    let finishesUpdated = 0;
    let failed = 0;

    for (const parsedCategory of parsedCategories) {
      const categorySummary: ImportCategorySummary = {
        name: parsedCategory.name,
        finishGroup: parsedCategory.finishGroup,
        found: parsedCategory.swatches.length,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [],
      };

      const category = await ensureFinishCategory(auth.supabase, brandId, parsedCategory.name, parsedCategory.finishGroup);
      if (category.created) categoriesCreated += 1;
      else categoriesExisting += 1;

      const { data: existingFinishes, error: existingError } = await auth.supabase
        .from("finishes")
        .select("id, name")
        .eq("finish_category_id", category.id);
      if (existingError) throw existingError;

      const existingByName = new Map(
        (existingFinishes ?? []).map((finish: { id: string; name: string }) => [normalizeKey(finish.name), finish.id]),
      );
      const categorySlug = slugify(parsedCategory.name);

      const uploadResults = await mapWithConcurrency(parsedCategory.swatches, 8, async (swatch) => ({
        swatch,
        imageUrl: await uploadExternalFinishImage(auth.supabase, swatch.imageUrl, sourceSlug, categorySlug, slugify(swatch.name)),
      }));

      for (let index = 0; index < uploadResults.length; index += 1) {
        const result = uploadResults[index];
        if (result.status === "rejected") {
          categorySummary.failed += 1;
          failed += 1;
          categorySummary.errors.push(result.reason instanceof Error ? result.reason.message : "Erro desconhecido");
          continue;
        }

        const { swatch, imageUrl } = result.value;
        const existingId = existingByName.get(normalizeKey(swatch.name));
        if (existingId) {
          const { error } = await auth.supabase
            .from("finishes")
            .update({
              name: swatch.name,
              image_url: imageUrl,
              display_order: index,
            })
            .eq("id", existingId);
          if (error) throw error;
          categorySummary.updated += 1;
          finishesUpdated += 1;
        } else {
          const { data, error } = await auth.supabase
            .from("finishes")
            .insert({
              finish_category_id: category.id,
              name: swatch.name,
              image_url: imageUrl,
              display_order: index,
            })
            .select("id")
            .single();
          if (error) throw error;
          if (data?.id) existingByName.set(normalizeKey(swatch.name), data.id);
          categorySummary.created += 1;
          finishesCreated += 1;
        }
      }

      summaries.push(categorySummary);
    }

    return new Response(JSON.stringify({
      success: true,
      brandName: resolvedBrandName,
      sourceUrl: parsedUrl.toString(),
      categoriesFound: parsedCategories.length,
      finishesFound: parsedCategories.reduce((total, category) => total + category.swatches.length, 0),
      categoriesCreated,
      categoriesExisting,
      finishesCreated,
      finishesUpdated,
      failed,
      categories: summaries,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("bulk-import-century-finishes error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
