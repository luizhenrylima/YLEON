import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2/scrape";
const PRODUCT_IMAGES_BUCKET = "product-images";
const TISSOT_IMAGE_LIMIT = 3;

type DownloadType = "tech_sheet" | "2d" | "3d";

interface ProductLink {
  url: string;
  nameFromCard: string;
  imageFromCard: string | null;
}

interface ProductDownload {
  download_type: DownloadType;
  label: string;
  url: string;
  display_order: number;
}

interface NamedEntity {
  id: string;
  name: string;
}

interface ComfortSignals {
  sentar?: number;
  ambiente?: number;
  aparencia?: number;
}

interface ImportedProductResult {
  name: string;
  url: string;
  action?: "created" | "updated";
  imageCount: number;
  ambientImageCount?: number;
  styleCount?: number;
  environmentCount?: number;
  environmentNames?: string[];
  categoryName?: string;
  downloads: {
    techSheet: boolean;
    file2d: boolean;
    threeDCount: number;
  };
  warnings: string[];
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
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

function cleanText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cleanProductDescription(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/\bvisite\s+a\s+p[aá]gina(?:\s+e\s+conhe[cç]a)?!?/gi, "")
    .replace(/\b(?:a\s+partir\s+de|or[cç]amento|pre[cç]o|valor)\s*:?\s*R\$\s*[\d.,]+(?:\s*\*)?/gi, "")
    .replace(/\bsolicite\s+(?:seu\s+)?or[cç]amento\b/gi, "")
    .replace(/\b(?:a\s+partir\s+de|or[cç]amento|pre[cç]o|valor)\s*:?\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function sentenceCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    aacute: "\u00e1",
    Aacute: "\u00c1",
    agrave: "\u00e0",
    Agrave: "\u00c0",
    acirc: "\u00e2",
    Acirc: "\u00c2",
    atilde: "\u00e3",
    Atilde: "\u00c3",
    ccedil: "\u00e7",
    Ccedil: "\u00c7",
    eacute: "\u00e9",
    Eacute: "\u00c9",
    ecirc: "\u00ea",
    Ecirc: "\u00ca",
    iacute: "\u00ed",
    Iacute: "\u00cd",
    oacute: "\u00f3",
    Oacute: "\u00d3",
    ocirc: "\u00f4",
    Ocirc: "\u00d4",
    otilde: "\u00f5",
    Otilde: "\u00d5",
    uacute: "\u00fa",
    Uacute: "\u00da",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z0-9#]+);/g, (match, entity) => entities[entity] ?? match);
}

function absoluteUrl(rawUrl: string, baseUrl: string): string {
  const decoded = decodeHtml(rawUrl).trim();
  if (!decoded || /[\s<>"']/.test(decoded.replace(/^data:image\/[^,]+,.+$/i, ""))) return "";
  if (
    isJhoviniUrl(baseUrl)
    && !/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(decoded)
    && !decoded.startsWith("/")
    && /^(?:produto|produtos|fotos|arquivos|imagens)\//i.test(decoded)
  ) {
    try {
      return new URL(decoded, `${new URL(baseUrl).origin}/`).toString();
    } catch {
      return "";
    }
  }

  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return "";
  }
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

function normalizeProductNameForMatch(value: string): string {
  return normalizeKey(value).replace(/\s+html$/, "").trim();
}

function cleanImportedProductName(value: string): string {
  return cleanText(value)
    .replace(/\s*(?:[-|–—]\s*)?Grupo\s+Bell\s*'?\s*Art(?:e)?\s*$/i, "")
    .replace(/\s*(?:[-|–—]\s*)?Grupo\s+Bellarte\s*$/i, "")
    .replace(/\s+html$/i, "")
    .trim();
}

function titleCaseFromSlug(url: string): string {
  const pathname = new URL(url).pathname;
  const rawLast = pathname.split("/").filter(Boolean).pop() ?? "Produtos";
  const last = deepDecodeUriComponent(rawLast)
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\+/g, " ");
  const name = last
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return cleanImportedProductName(name);
}

function titleCasePhrase(value: string): string {
  return cleanText(deepDecodeUriComponent(value).replace(/\+/g, " "))
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function isCenturyUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("meucentury.com");
  } catch {
    return false;
  }
}

function isFolioUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("folioliving.com.br");
  } catch {
    return false;
  }
}

function isEssenzaUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("essenzamoveis.com.br");
  } catch {
    return false;
  }
}

function isAmericaUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith("americamoveis.com") || hostname.endsWith("americamoveis.com.br");
  } catch {
    return false;
  }
}

function isTissotUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("tissot.com.br");
  } catch {
    return false;
  }
}

function isJhoviniUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("jhovini.com.br");
  } catch {
    return false;
  }
}

function isDoimoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("doimobrasil.com.br");
  } catch {
    return false;
  }
}

function isCasocaUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith("casoca.com.br");
  } catch {
    return false;
  }
}

function isGreenhouseUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith("greenhousemoveis.com.br");
  } catch {
    return false;
  }
}

function isFeelingUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith("feelingestofados.com.br");
  } catch {
    return false;
  }
}

function isNeoboxUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith("neoboxmoveis.com.br");
  } catch {
    return false;
  }
}

function isPontoVirgulaUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").endsWith("pontovirgula.com");
  } catch {
    return false;
  }
}

function isNeoboxCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isNeoboxUrl(url) && /^\/product-list\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isFeelingCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isFeelingUrl(url) && /^\/categoria\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isGreenhouseCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isGreenhouseUrl(url) && /^\/category\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isPontoVirgulaCategoryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isPontoVirgulaUrl(url) && /^\/produtos\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isCasocaProductUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isCasocaUrl(url)) return false;
    const path = parsed.pathname.replace(/\/$/, "");
    if (!/\/[^/]+\.html$/i.test(path)) return false;
    return !/\/(?:produtos|marcas|lojas|moveis|iluminacao|acessorios-de-decoracao|comercial|escritorio|revestimentos|loucas-e-metais|eletros|vegetacao|portas-e-janelas|construcao|quarto-infantil|mostras|curadorias|lancamentos|cgs)\.html$/i.test(path);
  } catch {
    return false;
  }
}

function extractNextPageProps(html: string): Record<string, unknown> | null {
  const rawJson = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!rawJson) return null;

  try {
    const nextData = asRecord(JSON.parse(rawJson));
    const props = asRecord(nextData?.props);
    return asRecord(props?.pageProps);
  } catch {
    return null;
  }
}

function extractAmericaProductData(html: string): Record<string, unknown> | null {
  return asRecord(extractNextPageProps(html)?.result);
}

async function scrape(url: string) {
  if (isCasocaUrl(url)) {
    return scrapeDirectly(url);
  }

  if (isNeoboxUrl(url)) {
    return scrapeDirectly(url);
  }

  if (isPontoVirgulaUrl(url)) {
    const directPage = await scrapeDirectly(url);
    const path = new URL(url).pathname;
    if (/^\/produto\/[^/]+\/?$/i.test(path)) {
      return {
        ...directPage,
        html: compactPontoVirgulaProductHtml(directPage.html),
      };
    }
    if (isPontoVirgulaCategoryUrl(url)) {
      return {
        ...directPage,
        html: compactPontoVirgulaCategoryHtml(directPage.html),
      };
    }
    return directPage;
  }

  if (isFeelingUrl(url)) {
    return isFeelingCategoryUrl(url) ? scrapeFeelingCategoryPage(url) : scrapeDirectly(url);
  }

  if (isGreenhouseCategoryUrl(url)) {
    try {
      const directPage = await scrapeDirectly(url);
      if (/\/produto-page\//i.test(directPage.html)) {
        return {
          ...directPage,
          html: compactGreenhouseCategoryHtml(directPage.html),
        };
      }
    } catch (error) {
      console.warn("Greenhouse direct category scrape failed, trying Firecrawl", error);
    }
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    return scrapeDirectly(url);
  }

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
    if (!response.ok) {
      throw new Error(payload?.error || `Firecrawl retornou HTTP ${response.status}`);
    }

    const data = payload?.data ?? payload;
    const html = String(data?.html ?? data?.content?.html ?? data?.content ?? "");
    if (shouldFallbackToDirectHtml(url, html)) {
      return scrapeDirectly(url);
    }

    return {
      html,
      markdown: String(data?.markdown ?? ""),
      metadata: data?.metadata ?? {},
    };
  } catch (error) {
    if (isGreenhouseCategoryUrl(url)) {
      throw new Error(`Firecrawl falhou ao ler a categoria Greenhouse: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
    console.warn("Firecrawl scrape failed, falling back to direct HTML fetch", error);
    return scrapeDirectly(url);
  }
}

async function scrapeGreenhouseProductDetails(url: string) {
  const directPage = await scrapeDirectly(url).catch((error) => {
    console.warn("Greenhouse direct product scrape failed", url, error);
    return null;
  });
  const directHtml = directPage ? `${directPage.html}\n${directPage.markdown || ""}` : "";
  if (directHtml && /drive\.google\.com|product-gallery-root|static\.wixstatic\.com\/media/i.test(directHtml)) {
    return {
      html: compactGreenhouseProductHtml(directHtml),
      markdown: "",
      metadata: directPage?.metadata ?? {},
    };
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    return {
      html: compactGreenhouseProductHtml(directHtml),
      markdown: "",
      metadata: directPage?.metadata ?? {},
    };
  }

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
    if (!response.ok) {
      throw new Error(payload?.error || `Firecrawl retornou HTTP ${response.status}`);
    }

    const data = payload?.data ?? payload;
    const html = compactGreenhouseProductHtml([
      directHtml,
      String(data?.html ?? data?.content?.html ?? data?.content ?? ""),
      String(data?.markdown ?? ""),
    ].filter(Boolean).join("\n"));
    return {
      html,
      markdown: "",
      metadata: { ...(directPage?.metadata ?? {}), ...(data?.metadata ?? {}) },
    };
  } catch (error) {
    console.warn("Greenhouse product details scrape failed", url, error);
    return {
      html: compactGreenhouseProductHtml(directHtml),
      markdown: "",
      metadata: directPage?.metadata ?? {},
    };
  }
}

async function scrapeFeelingProductDetails(url: string) {
  const directPage = await scrapeDirectly(url).catch(async (error) => {
    console.warn("Feeling direct product scrape failed, trying Reader fallback", url, error);
    return scrapeViaJinaReader(url);
  });
  return {
    html: compactFeelingProductHtml(directPage.html),
    markdown: "",
    metadata: directPage.metadata,
  };
}

async function scrapeFeelingCategoryPage(url: string) {
  try {
    const directPage = await scrapeDirectly(url);
    return {
      ...directPage,
      html: compactFeelingCategoryHtml(directPage.html),
    };
  } catch (error) {
    console.warn("Feeling direct category scrape failed, trying fallbacks", url, error);
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (apiKey) {
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
      const html = [
        String(data?.html ?? data?.content?.html ?? data?.content ?? ""),
        String(data?.markdown ?? ""),
      ].filter(Boolean).join("\n");
      if (html && /\/produto\//i.test(html)) {
        return {
          html: compactFeelingCategoryHtml(html),
          markdown: String(data?.markdown ?? ""),
          metadata: data?.metadata ?? {},
        };
      }
      throw new Error("Firecrawl nao retornou links de produtos da Feeling");
    } catch (error) {
      console.warn("Feeling Firecrawl category scrape failed, trying Reader fallback", url, error);
    }
  }

  const readerPage = await scrapeViaJinaReader(url);
  return {
    ...readerPage,
    html: compactFeelingCategoryHtml(readerPage.html),
  };
}

async function scrapeViaJinaReader(url: string) {
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "Accept": "text/plain,application/json;q=0.9,*/*;q=0.8",
      "X-No-Cache": "true",
    },
  });

  if (!response.ok) {
    throw new Error(`Reader retornou HTTP ${response.status}`);
  }

  const markdown = await response.text();
  const title = cleanText(markdown.match(/^Title:\s*(.+)$/im)?.[1] || markdown.match(/^#\s+(.+)$/m)?.[1] || "");
  return {
    html: markdown,
    markdown,
    metadata: { title, description: "" },
  };
}

function shouldFallbackToDirectHtml(url: string, html: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    if (isJhoviniUrl(url)) {
      if (/^\/produtos\/categorias\/[^/]+\/?$/i.test(pathname) && !/\blistagem_produtos\b/i.test(html)) return true;
      if (/^\/produto\/[^/]+\/[^/]+\/?$/i.test(pathname) && !/<section\b[^>]*id=["']produto["']/i.test(html)) return true;
    }
    if (isDoimoUrl(url)) {
      if (!/^\/produto\/[^/]+\/?$/i.test(pathname) && !/\belementor-portfolio-item\b/i.test(html)) return true;
      if (/^\/produto\/[^/]+\/?$/i.test(pathname) && !/\bproduct_title\b/i.test(html)) return true;
    }
    if (isGreenhouseUrl(url)) {
      if (/^\/category\//i.test(pathname)) return false;
      if (/^\/produto-page\/[^/]+\/?$/i.test(pathname) && !/data-hook=["']product-page["']|<meta\s+property=["']og:type["']\s+content=["']produto["']/i.test(html)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SourceRateLimitError extends Error {
  retryAfterMs: number;
  status: number;

  constructor(status: number, retryAfterMsValue: number) {
    super(`Site retornou HTTP ${status}`);
    this.name = "SourceRateLimitError";
    this.status = status;
    this.retryAfterMs = retryAfterMsValue;
  }
}

function retryAfterMs(headerValue: string | null, fallbackMs: number): number {
  if (!headerValue) return fallbackMs;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 180_000);
  const retryDate = Date.parse(headerValue);
  if (Number.isFinite(retryDate)) return Math.min(Math.max(retryDate - Date.now(), fallbackMs), 180_000);
  return fallbackMs;
}

async function scrapeDirectly(url: string) {
  const isPontoVirgulaRequest = isPontoVirgulaUrl(url);
  const maxAttempts = isPontoVirgulaRequest ? 2 : 1;
  let response: Response | null = null;
  let lastRetryAfterMs = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (response.ok) break;
    if (response.status !== 429 || attempt === maxAttempts - 1) {
      if (response.status === 429 && isPontoVirgulaRequest) {
        throw new SourceRateLimitError(429, retryAfterMs(response.headers.get("retry-after"), lastRetryAfterMs || 120_000));
      }
      throw new Error(`Site retornou HTTP ${response.status}`);
    }

    const fallbackMs = 15_000 + attempt * 15_000;
    lastRetryAfterMs = retryAfterMs(response.headers.get("retry-after"), fallbackMs);
    await sleep(lastRetryAfterMs);
  }

  if (!response?.ok) {
    throw new Error("Site nao respondeu corretamente");
  }

  const html = await response.text();
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = isGreenhouseUrl(url)
    ? cleanProductDescription(
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
        ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
        ?? "",
    )
    : extractProductDescription(html, {}, title);

  return {
    html,
    markdown: "",
    metadata: { title, description },
  };
}

function collectHtmlSnippets(html: string, pattern: RegExp, before = 600, after = 1200, limit = 30): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(pattern.source, flags);
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(regex)) {
    if (snippets.length >= limit) break;
    const index = match.index ?? 0;
    const start = Math.max(0, index - before);
    const end = Math.min(html.length, index + match[0].length + after);
    const key = `${start}:${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(html.slice(start, end));
  }

  return snippets;
}

function compactGreenhouseCategoryHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const productChunks: string[] = [];
  const seenProducts = new Set<string>();
  const productRegex = /\/produto-page\/[^"'#?\s<]+/gi;
  for (const match of source.matchAll(productRegex)) {
    const productPath = (match[0] ?? "").replace(/\/$/, "");
    if (!productPath || seenProducts.has(productPath)) continue;
    seenProducts.add(productPath);
    const index = match.index ?? 0;
    productChunks.push(source.slice(Math.max(0, index - 900), Math.min(source.length, index + match[0].length + 1400)));
    if (productChunks.length >= 200) break;
  }

  const chunks = [
    ...collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1),
    ...collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*>/i, 0, 0, 8),
    ...productChunks,
  ];

  return chunks.join("\n");
}

function compactFeelingCategoryHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const productChunks: string[] = [];
  const seenProducts = new Set<string>();
  const productRegex = /(?:https?:\/\/feelingestofados\.com\.br)?\/produto\/[^"'#?\s<)]+\/?/gi;

  for (const match of source.matchAll(productRegex)) {
    const productPath = (match[0] ?? "").replace(/\/$/, "");
    if (!productPath || seenProducts.has(productPath)) continue;
    seenProducts.add(productPath);
    const index = match.index ?? 0;
    productChunks.push(source.slice(Math.max(0, index - 900), Math.min(source.length, index + match[0].length + 1400)));
    if (productChunks.length >= 220) break;
  }

  const chunks = [
    ...collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1),
    ...collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*>/i, 0, 0, 8),
    ...collectHtmlSnippets(source, /^Title:\s*.+$/im, 0, 0, 1),
    ...productChunks,
  ];

  return chunks.join("\n") || source.slice(0, 180_000);
}

function compactPontoVirgulaCategoryHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const productChunks: string[] = [];
  const seenProducts = new Set<string>();
  const anchorRegex = /<a\b[^>]*href=["'][^"']*\/produto\/[^"'#?]+\/?["'][^>]*>[\s\S]*?<\/a>/gi;

  for (const match of source.matchAll(anchorRegex)) {
    const anchor = match[0] ?? "";
    const href = anchor.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
    const key = href.replace(/\/$/, "");
    if (!key || seenProducts.has(key)) continue;
    seenProducts.add(key);
    productChunks.push(anchor);
    if (productChunks.length >= 240) break;
  }

  if (productChunks.length === 0) {
    const productRegex = /(?:https?:\/\/pontovirgula\.com)?\/produto\/[^"'#?\s<)]+\/?/gi;
    for (const match of source.matchAll(productRegex)) {
      const key = (match[0] ?? "").replace(/\/$/, "");
      if (!key || seenProducts.has(key)) continue;
      seenProducts.add(key);
      const index = match.index ?? 0;
      productChunks.push(source.slice(Math.max(0, index - 900), Math.min(source.length, index + match[0].length + 1400)));
      if (productChunks.length >= 240) break;
    }
  }

  const chunks = [
    ...collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1),
    ...collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description|og:image)["'][^>]*>/i, 0, 0, 12),
    ...productChunks,
  ];

  return chunks.join("\n") || source.slice(0, 160_000);
}

function compactNeoboxCategoryHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const productChunks: string[] = [];
  const seenProducts = new Set<string>();
  const productRegex = /\/product-detail\/\d+/gi;

  for (const match of source.matchAll(productRegex)) {
    const productPath = match[0] ?? "";
    if (!productPath || seenProducts.has(productPath)) continue;
    seenProducts.add(productPath);
    const index = match.index ?? 0;
    productChunks.push(source.slice(Math.max(0, index - 900), Math.min(source.length, index + match[0].length + 1200)));
    if (productChunks.length >= 240) break;
  }

  const chunks = [
    ...collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1),
    ...collectHtmlSnippets(source, /<h1\b[\s\S]*?<\/h1>/i, 0, 0, 1),
    ...collectHtmlSnippets(source, /product-list\/[^"'\s<>]+(?:\?per_page=\d+)?/i, 500, 500, 20),
    ...productChunks,
  ];

  return chunks.join("\n") || source.slice(0, 160_000);
}

function extractNeoboxPaginationUrls(html: string, categoryUrl: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const category = new URL(categoryUrl);
  const add = (rawUrl: string) => {
    const absolute = absoluteUrl(rawUrl, categoryUrl);
    if (!absolute) return;
    const parsed = new URL(absolute);
    if (parsed.hostname !== category.hostname || parsed.pathname.replace(/\/$/, "") !== category.pathname.replace(/\/$/, "")) return;
    if (!parsed.searchParams.has("per_page")) return;
    const normalized = parsed.toString();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    urls.push(normalized);
  };

  const anchorRegex = /<a\b[^>]*href=["']([^"']*product-list[^"']*per_page=\d+[^"']*)["'][^>]*>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    add(match[1] ?? "");
  }

  return urls.slice(0, 12);
}

async function loadNeoboxCategoryHtmlWithPagination(initialHtml: string, categoryUrl: string): Promise<string> {
  const htmlPages: string[] = [initialHtml];
  const seen = new Set<string>([new URL(categoryUrl).toString()]);
  const queue = extractNeoboxPaginationUrls(initialHtml, categoryUrl);

  while (queue.length && htmlPages.length < 12) {
    const nextUrl = queue.shift()!;
    if (seen.has(nextUrl)) continue;
    seen.add(nextUrl);

    try {
      const page = await scrapeDirectly(nextUrl);
      htmlPages.push(page.html);
      for (const discovered of extractNeoboxPaginationUrls(page.html, categoryUrl)) {
        if (!seen.has(discovered) && !queue.includes(discovered)) queue.push(discovered);
      }
    } catch (error) {
      console.warn("Neobox pagination page failed", nextUrl, error);
    }
  }

  return compactNeoboxCategoryHtml(htmlPages.join("\n"));
}

function compactGreenhouseProductHtml(html: string): string {
  const source = stripVideoMarkup(html);
  if (source.length <= 220_000) return source;

  const chunks: string[] = [];
  const add = (chunk: string | null | undefined, maxLength = 90_000) => {
    if (!chunk) return;
    const value = chunk.length > maxLength ? chunk.slice(0, maxLength) : chunk;
    if (value.trim()) chunks.push(value);
  };

  add(collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description|og:image)["'][^>]*>/i, 0, 0, 12).join("\n"), 30_000);
  add(collectHtmlSnippets(source, /<h1\b[^>]*data-hook=["']product-title["'][\s\S]*?<\/h1>/i, 200, 400, 2).join("\n"), 20_000);
  add(extractBetween(
    source,
    /<div\b[^>]*data-hook=["']product-gallery-root["'][^>]*>/i,
    /<div\b[^>]*data-hook=["']product-page-media-overlay["']|<h1\b[^>]*data-hook=["']product-title["']|<h2\b[^>]*data-hook=["']info-section-title["']|<footer\b/i,
  ), 80_000);
  add(extractGreenhouseInfoSection(source, /detalhes?\s+do\s+produto|descri[cç][aã]o|medidas?|dimens[oõ]es?|ficha/i), 60_000);
  add(extractGreenhouseInfoSection(source, /blocos?\s*3d|arquivos?\s*3d|downloads?/i), 60_000);
  add(extractGreenhouseInfoSection(source, /acabamentos?|finish/i), 40_000);
  add(collectHtmlSnippets(source, /drive\.google\.com/i, 1200, 1800, 20).join("\n"), 100_000);
  add(collectHtmlSnippets(source, /static\.wixstatic\.com\/media/i, 350, 650, 50).join("\n"), 90_000);
  add(collectHtmlSnippets(source, /\[[^\]]*\]\(https?:\/\/[^)\s]+\)/i, 500, 900, 30).join("\n"), 60_000);

  return chunks.join("\n");
}

function compactFeelingProductHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const chunks: string[] = [];
  const add = (chunk: string | null | undefined, maxLength = 80_000) => {
    if (!chunk) return;
    const value = chunk.length > maxLength ? chunk.slice(0, maxLength) : chunk;
    if (value.trim()) chunks.push(value);
  };

  add(collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description|og:image)["'][^>]*>/i, 0, 0, 12).join("\n"), 30_000);
  add(collectHtmlSnippets(source, /<h1\b[\s\S]*?<\/h1>/i, 0, 400, 2).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /\/categoria\/[^"'#?\s<]+\/?/i, 600, 600, 10).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /wp-content\/uploads\/[^"'<>]+\.(?:jpe?g|png|webp)/i, 600, 900, 80).join("\n"), 100_000);
  add(collectHtmlSnippets(source, /wp-content\/uploads\/[^"'<>]+\.(?:pdf|skp|dwg|dxf|zip|rar|7z|max|3ds|obj|fbx|rfa|rvt|3dm)/i, 1200, 1600, 30).join("\n"), 90_000);
  add(collectHtmlSnippets(source, /id=["']prod_arquivo_lista["']|Fa[cç]a\s+o\s+download|SKETCHUP|VISTA\s*2D|FICHA\s+TECNICA/i, 2200, 3200, 12).join("\n"), 90_000);
  add(collectHtmlSnippets(source, /\b(?:ASSENTO|ENCOSTO|ALMOFADA|P[ÉE]|DETALHE|OBSERVA[CÇ][OÕ]ES)\b/i, 1500, 3500, 8).join("\n"), 80_000);

  return chunks.join("\n") || source.slice(0, 180_000);
}

function compactPontoVirgulaProductHtml(html: string): string {
  const source = stripVideoMarkup(html);
  const chunks: string[] = [];
  const add = (chunk: string | null | undefined, maxLength = 80_000) => {
    if (!chunk) return;
    const value = chunk.length > maxLength ? chunk.slice(0, maxLength) : chunk;
    if (value.trim()) chunks.push(value);
  };

  add(collectHtmlSnippets(source, /<title\b[\s\S]*?<\/title>/i, 0, 0, 1).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /<meta\b[^>]+(?:name|property)=["'](?:description|og:title|og:description|og:image|twitter:title|twitter:image)["'][^>]*>/i, 0, 0, 12).join("\n"), 30_000);
  add(collectHtmlSnippets(source, /<h1\b[\s\S]*?<\/h1>/i, 0, 500, 2).join("\n"), 20_000);
  add(collectHtmlSnippets(source, /<p\b[^>]*>[\s\S]{40,1400}?<\/p>/i, 0, 0, 8).join("\n"), 35_000);
  add(collectHtmlSnippets(source, /<img\b[^>]*data-fancybox=["']banner-fotos["'][^>]*>/i, 0, 0, 80).join("\n"), 90_000);
  add(collectHtmlSnippets(source, /downloads-single|download_bloco|Blocos?\s*3D|Blocos?\s*2D|Ficha/i, 1200, 2200, 12).join("\n"), 80_000);
  add(collectHtmlSnippets(source, /https?:\/\/pontovirgula\.com\/wp-content\/uploads\/[^"'<> ]+\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)/i, 900, 1000, 30).join("\n"), 80_000);

  return chunks.join("\n") || source.slice(0, 120_000);
}

function extractCategoryTitle(html: string, categoryUrl: string): string {
  const americaCategory = stringField(extractAmericaProductData(html), "categoryName")
    || stringField(asRecord(extractAmericaProductData(html)?.category), "name");
  if (americaCategory) return americaCategory;

  if (isDoimoUrl(categoryUrl)) {
    const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
      .replace(/\s*[-|]\s*Doimo\s*$/i, "")
      .trim();
    if (title) return title;

    try {
      const pathname = new URL(categoryUrl).pathname;
      if (/sofas?/i.test(pathname)) return "Sofás";
    } catch {
      // Keep the generic title fallbacks below.
    }
  }

  if (isGreenhouseUrl(categoryUrl)) {
    try {
      const url = new URL(categoryUrl);
      for (const [key, value] of url.searchParams.entries()) {
        if (normalizeKey(key) === "filtrar por" && value) return titleCasePhrase(value);
      }
    } catch {
      // Keep the generic title fallbacks below.
    }
  }

  if (isFeelingUrl(categoryUrl)) {
    try {
      const url = new URL(categoryUrl);
      const categorySlug = url.pathname.match(/\/categoria\/([^/]+)/i)?.[1]
        || html.match(/href=["'][^"']*\/categoria\/([^/"'#?]+)\/?["']/i)?.[1]
        || "";
      if (categorySlug) return titleCasePhrase(categorySlug);
    } catch {
      // Keep the generic title fallbacks below.
    }
  }

  if (isNeoboxUrl(categoryUrl)) {
    try {
      const url = new URL(categoryUrl);
      const categorySlug = url.pathname.match(/\/product-list\/([^/]+)/i)?.[1] ?? "";
      if (categorySlug && !/^tipo$/i.test(categorySlug)) return titleCasePhrase(categorySlug);
    } catch {
      // Keep the generic title fallbacks below.
    }
  }

  if (isPontoVirgulaUrl(categoryUrl)) {
    try {
      const url = new URL(categoryUrl);
      const categorySlug = url.pathname.match(/\/produtos\/([^/]+)/i)?.[1] ?? "";
      if (categorySlug) return titleCasePhrase(categorySlug);
    } catch {
      // Keep the generic title fallbacks below.
    }
  }

  const selectedOption = cleanText(html.match(/<option\b[^>]*(?:selected|selected=["']selected["'])[^>]*>([\s\S]*?)<\/option>/i)?.[1]);
  if (selectedOption && !/^categorias?$|^linha$|^cole[cç][aã]o$/i.test(selectedOption)) return selectedOption;

  try {
    const url = new URL(categoryUrl);
    const categoryParam = url.searchParams.get("value") || url.searchParams.get("category") || url.searchParams.get("categoria") || url.searchParams.get("catproduto");
    if (categoryParam) return titleCasePhrase(categoryParam);
  } catch {
    // Keep the generic title fallbacks below.
  }

  const h1 = cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (h1 && !/century|produtos?/i.test(h1)) return h1;

  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    .replace(/\s*[-|]\s*Century\s*$/i, "")
    .trim();

  return title || titleCaseFromSlug(categoryUrl);
}

function extractProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/produto\/[^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const index = match.index ?? 0;
    const tag = match[0] ?? "";
    if (!/stretched-link/i.test(tag) && !/single-tipo-produto/i.test(html.slice(Math.max(0, index - 1400), index + 400))) {
      continue;
    }

    const url = absoluteUrl(href, categoryUrl).split("#")[0];
    const prefix = html.slice(Math.max(0, index - 1800), index);
    const h2Matches = [...prefix.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const imgMatches = [...prefix.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];
    const nameFromCard = cleanText(h2Matches.at(-1)?.[1]) || titleCaseFromSlug(url);
    const imageFromCard = imgMatches.at(-1)?.[1] ? absoluteUrl(imgMatches.at(-1)![1], categoryUrl) : null;

    if (!links.has(url)) {
      links.set(url, { url, nameFromCard, imageFromCard });
    }
  }

  return [...links.values()];
}

function extractFolioProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/produtos\/[^/"'#?]+\/?)["'][^>]*>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1];
    const index = match.index ?? 0;
    const url = absoluteUrl(href, categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const context = html.slice(index, index + 800);
    const imgMatch = context.match(/<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    if (!links.has(url)) {
      links.set(url, {
        url,
        nameFromCard: titleCaseFromSlug(url),
        imageFromCard: imgMatch?.[1] ? absoluteUrl(imgMatch[1], categoryUrl) : null,
      });
    }
  }

  return [...links.values()];
}

function extractEssenzaProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const cardRegex = /<div\b[^>]*class=["'][^"']*\bproject-item\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bproject-item\b|<\/div>\s*<\/div>\s*<\/div>\s*<\/section>|<footer\b)/gi;

  for (const match of html.matchAll(cardRegex)) {
    const card = match[0] ?? "";
    const hrefMatch = card.match(/<a\b[^>]*href=["']([^"']*\/pt\/detalhe\/[^"']+)["'][^>]*>/i);
    if (!hrefMatch?.[1]) continue;

    const url = absoluteUrl(hrefMatch[1], categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const imgMatch = card.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const titleLink = card.match(/<a\b[^>]*class=["'][^"']*\btitle-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const overlayTitle = card.match(/<div\b[^>]*class=["'][^"']*\boverlay\b[^"']*["'][^>]*>[\s\S]*?<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1];
    const imageAlt = card.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1];
    const nameFromCard = cleanCardProductName(titleLink || overlayTitle || imageAlt || "", url) || titleCaseFromSlug(url);
    const imageFromCard = imgMatch?.[1] ? absoluteUrl(imgMatch[1], categoryUrl) : null;

    if (!links.has(url)) {
      links.set(url, { url, nameFromCard, imageFromCard });
    }
  }

  return [...links.values()];
}

function extractAmericaProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const pageProps = extractNextPageProps(html);
  const products = Array.isArray(pageProps?.products) ? pageProps.products : [];

  for (const item of products) {
    const product = asRecord(item);
    const slug = stringField(product, "slug");
    if (!slug) continue;

    const url = absoluteUrl(`/produto/${slug}/`, categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const nameFromCard = cleanCardProductName(stringField(product, "name"), url) || titleCaseFromSlug(url);
    const cover = stringField(product, "cover");
    const imageFromCard = cover ? absoluteUrl(cover, categoryUrl) : null;
    links.set(url, { url, nameFromCard, imageFromCard });
  }

  if (links.size) return [...links.values()];

  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/produto\/[^/"'#?]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const url = absoluteUrl(match[1], categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const context = html.slice(Math.max(0, match.index ?? 0), (match.index ?? 0) + 1200);
    const imgMatch = context.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const nameFromCard = cleanCardProductName(match[2], url) || titleCaseFromSlug(url);
    links.set(url, {
      url,
      nameFromCard,
      imageFromCard: imgMatch?.[1] ? absoluteUrl(imgMatch[1], categoryUrl) : null,
    });
  }

  return [...links.values()];
}

function extractTissotProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const blockRegex = /<div\b[^>]*data-elementor-type=["']loop-item["'][^>]*class=["'][^"']*\bproduto\b[\s\S]*?(?=<div\b[^>]*data-elementor-type=["']loop-item["']|<nav\b|<footer\b|<\/main>)/gi;

  for (const match of html.matchAll(blockRegex)) {
    const block = match[0] ?? "";
    const hrefMatch = block.match(/<a\b[^>]*href=["']([^"']*\/produto\/[^"']+)["'][^>]*>/i);
    if (!hrefMatch?.[1]) continue;

    const url = absoluteUrl(hrefMatch[1], categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const imgMatch = block.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const titleMatch = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const altMatch = block.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i);
    const nameFromCard = cleanCardProductName(titleMatch?.[1] || altMatch?.[1] || "", url) || titleCaseFromSlug(url);
    const imageFromCard = imgMatch?.[1] ? absoluteUrl(imgMatch[1], categoryUrl) : null;

    if (!links.has(url)) {
      links.set(url, { url, nameFromCard, imageFromCard });
    }
  }

  return links.size ? [...links.values()] : extractGenericProductLinks(html, categoryUrl);
}

function extractJhoviniProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const productList = html.match(/<ul\b[^>]*class=["'][^"']*\blistagem_produtos\b[^"']*["'][^>]*>[\s\S]*?<\/ul>/i)?.[0] ?? "";
  const source = productList || html;
  const itemRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

  for (const match of source.matchAll(itemRegex)) {
    const item = match[1] ?? "";
    const hrefMatch = item.match(/<a\b[^>]*href=["']([^"']*produto\/[^"']+)["'][^>]*>/i);
    if (!hrefMatch?.[1]) continue;

    const url = absoluteUrl(hrefMatch[1], categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const titleMatch = item.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const imageMatch = item.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const altMatch = item.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i);
    const nameFromCard = cleanCardProductName(titleMatch?.[1] || altMatch?.[1] || "", url) || titleCaseFromSlug(url);
    const imageFromCard = imageMatch?.[1] ? absoluteUrl(imageMatch[1], categoryUrl) : null;

    if (!links.has(url)) {
      links.set(url, { url, nameFromCard, imageFromCard });
    }
  }

  return links.size ? [...links.values()] : extractGenericProductLinks(html, categoryUrl);
}

function extractDoimoProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const itemRegex = /<article\b[^>]*class=["'][^"']*\belementor-portfolio-item\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;

  for (const match of html.matchAll(itemRegex)) {
    const item = match[1] ?? "";
    const hrefMatch = item.match(/<a\b[^>]*href=["']([^"']*\/produto\/[^"']+)["'][^>]*>/i);
    if (!hrefMatch?.[1]) continue;

    const url = absoluteUrl(hrefMatch[1], categoryUrl).split("#")[0];
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const titleMatch = item.match(/<h[1-4]\b[^>]*class=["'][^"']*\belementor-portfolio-item__title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-4]>/i)
      ?? item.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const imageMatch = item.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const altMatch = item.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i);
    const nameFromCard = cleanCardProductName(titleMatch?.[1] || altMatch?.[1] || "", url) || titleCaseFromSlug(url);
    const imageFromCard = imageMatch?.[1] ? absoluteUrl(imageMatch[1], categoryUrl) : null;

    links.set(url, { url, nameFromCard, imageFromCard });
  }

  return links.size ? [...links.values()] : extractGenericProductLinks(html, categoryUrl);
}

function extractCasocaProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const cardRegex = /<div\b[^>]*class=["'][^"']*\bdetail-product\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bdetail-product\b|<div\b[^>]*class=["'][^"']*\btoolbar\b|<\/body>|$)/gi;

  for (const match of html.matchAll(cardRegex)) {
    const card = match[0];
    const anchorMatch = card.match(/<a\b[^>]+href=["']([^"']+\.html(?:\?[^"']*)?)["'][^>]*class=["'][^"']*\bproduct\b[^"']*["'][^>]*>/i)
      ?? card.match(/<a\b[^>]+class=["'][^"']*\bproduct\b[^"']*["'][^>]*href=["']([^"']+\.html(?:\?[^"']*)?)["'][^>]*>/i)
      ?? card.match(/<a\b[^>]+href=["']([^"']+\.html(?:\?[^"']*)?)["'][^>]*>/i);
    if (!anchorMatch?.[1]) continue;

    const url = absoluteUrl(anchorMatch[1], categoryUrl).split("#")[0];
    if (!isCasocaProductUrl(url)) continue;

    const h2Match = card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const imageMatches = [...card.matchAll(/<img\b[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)];
    const productImage = imageMatches
      .find((candidate) => /media\/catalog\/product|photo-image|small_image|cache\/image/i.test(`${candidate[0]} ${candidate[1]}`))?.[1]
      ?? imageMatches.at(0)?.[1];
    const nameFromCard = cleanCardProductName(h2Match?.[1] ?? "", url) || titleCaseFromSlug(url);
    const imageFromCard = productImage ? absoluteUrl(productImage, categoryUrl) : null;

    links.set(url, { url, nameFromCard, imageFromCard });
  }

  return links.size ? [...links.values()] : extractGenericProductLinks(html, categoryUrl);
}

function extractGreenhouseProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const anchorRegex = /<a\b([^>]*)href=["']([^"']*\/produto-page\/[^"'#?]+\/?)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[2];
    const index = match.index ?? 0;
    const url = absoluteUrl(href, categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const context = html.slice(Math.max(0, index - 2200), index + 1600);
    const anchorContent = match[4] ?? "";
    const textCandidates = [
      anchorContent,
      ...[...context.matchAll(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((candidate) => candidate[1]),
      ...[...context.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((candidate) => candidate[1]),
      context.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1],
      titleCaseFromSlug(url),
    ];
    const nameFromCard = textCandidates
      .map((candidate) => cleanCardProductName(candidate ?? "", url))
      .find(Boolean) || titleCaseFromSlug(url);

    const imgMatch = stripVideoMarkup(context).match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const rawImageFromCard = imgMatch?.[1] ? normalizeImageUrl(imgMatch[1], categoryUrl) : "";
    const imageFromCard = rawImageFromCard && looksLikeProductImage(rawImageFromCard, categoryUrl) ? rawImageFromCard : null;
    const existing = links.get(url);
    if (!existing || (existing.nameFromCard === titleCaseFromSlug(url) && nameFromCard !== existing.nameFromCard)) {
      links.set(url, { url, nameFromCard, imageFromCard: imageFromCard || existing?.imageFromCard || null });
    }
  }

  if (links.size) return [...links.values()];

  const rawPathRegex = /\/produto-page\/[a-z0-9-]+\/?/gi;
  for (const match of html.matchAll(rawPathRegex)) {
    const url = absoluteUrl(match[0], categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;
    links.set(url, { url, nameFromCard: titleCaseFromSlug(url), imageFromCard: null });
  }

  return [...links.values()];
}

function extractFeelingProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const cards = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)]
    .map((match) => match[0])
    .filter((card) => /\/produto\//i.test(card));

  for (const card of cards) {
    const href = card.match(/data-post-link=["']([^"']+)["']/i)?.[1]
      || card.match(/<a\b[^>]*href=["']([^"']*\/produto\/[^"'#?]+\/?)["'][^>]*>/i)?.[1];
    if (!href) continue;

    const url = absoluteUrl(href, categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const title = card.match(/class=["'][^"']*\bdce-post-title\b[^"']*["'][\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1]
      || card.match(/<h[1-4]\b[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-4]>/i)?.[1]
      || card.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1]
      || "";
    const nameFromCard = cleanCardProductName(title, url) || titleCaseFromSlug(url);

    const imageRaw = card.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i)?.[1]
      || card.match(/srcset=["']([^"']+)["']/i)?.[1]?.split(",").at(-1)?.trim().split(/\s+/)[0]
      || "";
    const imageUrl = imageRaw ? normalizeImageUrl(imageRaw, categoryUrl) : "";
    const imageFromCard = imageUrl && looksLikeProductImage(imageUrl, categoryUrl) ? imageUrl : null;

    links.set(url, { url, nameFromCard, imageFromCard });
  }

  if (links.size) return [...links.values()];

  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/produto\/[^"'#?]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const url = absoluteUrl(match[1] ?? "", categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;
    const nameFromCard = cleanCardProductName(match[2] ?? "", url) || titleCaseFromSlug(url);
    links.set(url, { url, nameFromCard, imageFromCard: null });
  }

  const markdownLinkRegex = /\[([^\]]{1,140})\]\((https?:\/\/feelingestofados\.com\.br\/produto\/[^)#?\s]+\/?)[^)]*\)/gi;
  for (const match of html.matchAll(markdownLinkRegex)) {
    const url = absoluteUrl(match[2] ?? "", categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;
    const nameFromCard = cleanCardProductName(match[1] ?? "", url) || titleCaseFromSlug(url);
    links.set(url, { url, nameFromCard, imageFromCard: links.get(url)?.imageFromCard ?? null });
  }

  const rawProductUrlRegex = /https?:\/\/feelingestofados\.com\.br\/produto\/[^"'#?\s<)]+\/?/gi;
  for (const match of html.matchAll(rawProductUrlRegex)) {
    const url = absoluteUrl(match[0] ?? "", categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;
    links.set(url, links.get(url) ?? { url, nameFromCard: titleCaseFromSlug(url), imageFromCard: null });
  }

  return [...links.values()];
}

function neoboxProductPrefix(categoryUrl: string): string {
  const category = normalizeProductCategory(extractCategoryTitle("", categoryUrl));
  const key = normalizeKey(category);
  if (key === "sofas") return "Sof\u00e1";
  if (key === "poltronas") return "Poltrona";
  if (key === "cadeiras") return "Cadeira";
  if (key === "banquetas") return "Banqueta";
  if (key === "mesas de centro") return "Mesa de Centro";
  if (key === "mesas laterais") return "Mesa Lateral";
  if (key === "mesas de jantar") return "Mesa de Jantar";
  if (key === "aparadores") return "Aparador";
  if (key === "buffets") return "Buffet";
  if (key === "bancos") return "Banco";
  if (key === "pufes") return "Puff";
  return category.replace(/s$/i, "");
}

function composeNeoboxProductName(rawName: string, categoryUrl: string): string {
  const name = cleanImportedProductName(rawName);
  if (!name) return "";
  const prefix = neoboxProductPrefix(categoryUrl);
  if (!prefix) return name;
  if (normalizeKey(name).startsWith(normalizeKey(prefix))) return name;
  return `${prefix} ${name}`.trim();
}

function extractNeoboxProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/product-detail\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1] ?? "";
    const content = match[2] ?? "";
    const url = absoluteUrl(href, categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const nameCandidate = content.match(/\b(?:alt|title)=["']([^"']+)["']/i)?.[1]
      || cleanText(content)
      || titleCaseFromSlug(url);
    const nameFromCard = composeNeoboxProductName(nameCandidate, categoryUrl) || titleCaseFromSlug(url);
    const backgroundImage = content.match(/background-image\s*:\s*url\((['"]?)([^'")]+)\1\)/i)?.[2] ?? "";
    const imageFromCard = backgroundImage
      ? normalizeImageUrl(backgroundImage, categoryUrl)
      : content.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i)?.[1]
      ? normalizeImageUrl(content.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i)![1], categoryUrl)
      : null;

    if (!links.has(url)) links.set(url, { url, nameFromCard, imageFromCard });
  }

  return [...links.values()];
}

function extractPontoVirgulaProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink>();
  const anchorRegex = /<a\b[^>]*href=["']([^"']*\/produto\/[^"'#?]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1] ?? "";
    const content = match[2] ?? "";
    const url = absoluteUrl(href, categoryUrl).split("#")[0].replace(/\/$/, "");
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const rawTitle = content.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1]
      || content.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1]
      || "";
    const cleanTitle = cleanCardProductName(rawTitle, url);
    const nameFromCard = cleanTitle ? titleCasePhrase(cleanTitle) : titleCaseFromSlug(url);
    const imageRaw = content.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i)?.[1]
      || content.match(/srcset=["']([^"']+)["']/i)?.[1]?.split(",").at(-1)?.trim().split(/\s+/)[0]
      || "";
    const imageUrl = imageRaw ? normalizeImageUrl(imageRaw, categoryUrl) : "";
    const imageFromCard = imageUrl && looksLikeProductImage(imageUrl, categoryUrl) ? imageUrl : null;

    links.set(url, { url, nameFromCard, imageFromCard });
  }

  return [...links.values()];
}

function isBlockedProductLink(url: string, categoryUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const category = new URL(categoryUrl);
    if (parsed.hostname !== category.hostname) return true;
    if (isAmericaUrl(categoryUrl) && !/^\/produto\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isFolioUrl(categoryUrl) && !/^\/produtos\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isTissotUrl(categoryUrl) && !/^\/produto\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isJhoviniUrl(categoryUrl) && !/^\/produto\/[^/]+\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isDoimoUrl(categoryUrl) && !/^\/produto\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isGreenhouseUrl(categoryUrl) && !/^\/produto-page\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isFeelingUrl(categoryUrl) && !/^\/produto\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (isNeoboxUrl(categoryUrl) && !/^\/product-detail\/\d+\/?$/i.test(parsed.pathname)) return true;
    if (isPontoVirgulaUrl(categoryUrl) && !/^\/produto\/[^/]+\/?$/i.test(parsed.pathname)) return true;
    if (parsed.href.split("#")[0].replace(/\/$/, "") === category.href.split("#")[0].replace(/\/$/, "")) return true;
    if (parsed.pathname.replace(/\/$/, "") === category.pathname.replace(/\/$/, "") && parsed.search !== category.search) return true;
    if (/\.(jpg|jpeg|png|webp|gif|svg|pdf|zip|rar|7z|dwg|skp|max|css|js)(\?|$)/i.test(parsed.pathname)) return true;
    const blockedNavigationPattern = isJhoviniUrl(categoryUrl)
      ? /cart|checkout|account|minha-conta|login|wishlist|favoritos|blog|news|privacy|politica|termos|wp-content|wp-json/i
      : /cart|carrinho|checkout|account|minha-conta|login|wishlist|favoritos|blog|news|privacy|politica|termos|wp-content|wp-json/i;
    if (blockedNavigationPattern.test(parsed.pathname)) return true;
    return false;
  } catch {
    return true;
  }
}

function cleanCardProductName(value: string, url: string): string {
  const text = cleanImportedProductName(value);
  if (!text) return "";
  if (/^(produtos?|categorias?|aparadores?|bancos?|cadeiras?|mesas?|poltronas?|sof[aá]s?)$/i.test(text)) return "";
  if (text.length > 90) return "";
  const slugName = titleCaseFromSlug(url);
  if (normalizeKey(text).includes(normalizeKey(slugName)) || normalizeKey(slugName).includes(normalizeKey(text))) return text;
  if (/^(aparador|mesa|cadeira|espregui(?:c|\u00e7)adeira|poltrona|sofa|sof[aá]|banco|buffet|cama|rack|puff|lumin[aá]ria|espelho|estante|carrinho|c[oô]moda|vaso)\b/i.test(text)) return text;
  return "";
}

function compactCategorySource(categoryName: string): string {
  const key = normalizeKey(categoryName);
  if (key.startsWith("arquivos ")) {
    return key
      .replace(/^arquivos\s+/, "")
      .replace(/\s+tissot\s+arte\s+e\s+atitude.*$/, "")
      .trim();
  }
  return key
    .replace(/\s+tissot\s+arte\s+e\s+atitude.*$/, "")
    .trim();
}

function inferCanonicalCategoryFromKey(key: string): string {
  if (!key) return "";
  if (/\bespreguicadeira(s)?\b/.test(key)) return "Espregui\u00e7adeira";
  if (/\bbanqueta(s)?\b|\bbanco\s+alto\b|\bassento\s+alto\b|\bbalc[aã]o\b|\bbar\b|\bgourmet\b|\bcozinha\s+americana\b|\baltura\s+(?:de\s+)?(?:bar|balc[aã]o|bancada)\b/.test(key)) return "Banquetas";
  if (/\bcadeira(s)?\b|\bchair(s)?\b|\bassento\s+(?:de\s+)?jantar\b|\bencosto\b.*\bassento\b|\bassento\b.*\bencosto\b/.test(key)) return "Cadeiras";
  if (/\b(mesa|mesas)\s+(de\s+)?(cabeceira|cabeceiras)|\bcriado(s)?\b|\bcriado\s+mudo\b|\bbedside\b/.test(key)) return "Mesas de Cabeceira";
  if (/\b(mesa|mesas)\s+(de\s+)?(centro|central)\b/.test(key)) return "Mesas de Centro";
  if (/\b(mesa|mesas)\s+(lateral|laterais|auxiliar|auxiliares|apoio)\b/.test(key)) return "Mesas Laterais";
  if (/\b(mesa|mesas)\s+(de\s+)?jantar\b/.test(key)) return "Mesas de Jantar";
  if (/\b(carros?\s+bar|mesa\s+bar|bar|bares)\b/.test(key)) return "Bares";
  if (/\baparador(es)?\b/.test(key)) return "Aparadores";
  if (/\bbuffet(s)?\b|\bbalcao\b/.test(key)) return "Buffets";
  if (/\bbanco(s)?\b/.test(key)) return "Bancos";
  if (/\bbandeja(s)?\b/.test(key)) return "Bandejas";
  if (/\bpuff(s)?\b|\bpufe(s)?\b/.test(key)) return "Pufes";
  if (/\bpoltrona(s)?\b|\bnamoradeira(s)?\b/.test(key)) return "Poltronas";
  if (/\bsofa(s)?\b/.test(key)) return "Sof\u00e1s";
  if (/\bcabeceira(s)?\b/.test(key)) return "Cabeceiras";
  if (/\bcama(s)?\b|\bchaise(s)?\b/.test(key)) return "Camas";
  if (/\bescrivaninha(s)?\b|\bpenteadeira(s)?\b|\bhome\s+office\b/.test(key)) return "Escrivaninhas";
  if (/\brack(s)?\b|\bhome\b/.test(key)) return "Racks";
  if (/\bestante(s)?\b/.test(key)) return "Estantes";
  if (/\bmancebo(s)?\b/.test(key)) return "Mancebos";
  if (/\bespelho(s)?\b/.test(key)) return "Espelhos";
  if (/\bcristaleira(s)?\b/.test(key)) return "Cristaleiras";
  if (/\bluminaria(s)?\b/.test(key)) return "Lumin\u00e1rias";
  if (/\bcomoda(s)?\b/.test(key)) return "C\u00f4modas";
  if (/\bcarrinho(s)?\b/.test(key)) return "Carrinhos";
  if (/\bvaso(s)?\b/.test(key)) return "Vasos";
  if (/\bmesa(s)?\b/.test(key)) return "Mesas de Jantar";
  return "";
}

function normalizeProductCategory(categoryName: string, productName = ""): string {
  const sourceKey = compactCategorySource(categoryName);
  const productKey = normalizeKey(productName);
  const sourceIsComposite = /\b(e|&)\b/.test(sourceKey)
    || /\b(aparadores?\s+buffets?\s+(e\s+)?bares?|puffs?\s+e\s+bancos?|cadeiras?\s+e\s+banquetas?|mesas?\s+de\s+centro\s+e\s+laterais|espelhos?\s+e\s+mancebos?|biombos?\s+e\s+(estantes?|mancebos?))\b/.test(sourceKey)
    || sourceKey === "pt";

  const fromProduct = inferCanonicalCategoryFromKey(productKey);
  if (sourceIsComposite && fromProduct) return fromProduct;

  const fromSource = inferCanonicalCategoryFromKey(sourceKey);
  if (fromSource) return fromSource;
  if (fromProduct) return fromProduct;
  if (sourceKey === "pt") return "Mesas de Cabeceira";

  return cleanText(categoryName) || "Produtos";
}

function extractGenericProductLinks(html: string, categoryUrl: string): ProductLink[] {
  const links = new Map<string, ProductLink & { score: number }>();
  const anchorRegex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const attrs = `${match[1]} ${match[3]}`;
    const href = match[2];
    const index = match.index ?? 0;
    const content = match[4] ?? "";
    let url: string;
    try {
      url = absoluteUrl(href, categoryUrl).split("#")[0];
    } catch {
      continue;
    }
    if (isBlockedProductLink(url, categoryUrl)) continue;

    const parsed = new URL(url);
    const context = html.slice(Math.max(0, index - 1800), index + 1200);
    const path = normalizeKey(parsed.pathname);
    const contextText = normalizeKey(`${attrs} ${context}`);

    let score = 0;
    if (/(^| )(produto|product|products product|shop product)( |$)/.test(path)) score += 5;
    if (/(^| )(produtos|products|shop|loja)( |$)/.test(path)) score += 2;
    if (/<img\b/i.test(context)) score += 2;
    if (/product|produto|card|item|grid|collection|vitrine/i.test(contextText)) score += 2;
    if (/add-to-cart|comprar|orcamento|price|preco/i.test(contextText)) score += 1;

    if (score < 4) continue;

    const prefix = html.slice(Math.max(0, index - 1800), index);
    const hMatches = [...prefix.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)];
    const strongMatches = [...context.matchAll(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi)];
    const anchorTextMatches = [...context.matchAll(/<a\b[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const imgMatches = [...context.matchAll(/<img[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)];
    const imgAltMatches = [...context.matchAll(/<img[^>]*alt=["']([^"']+)["'][^>]*>/gi)];
    const cardNameCandidates = [
      content,
      ...strongMatches.map((candidate) => candidate[1]),
      ...anchorTextMatches.map((candidate) => candidate[1]),
      imgAltMatches.at(0)?.[1],
      hMatches.at(-1)?.[1],
    ];
    const nameFromCard = cardNameCandidates.map((candidate) => cleanCardProductName(candidate ?? "", url)).find(Boolean)
      || titleCaseFromSlug(url);
    const imageFromCard = imgMatches.at(0)?.[1] ? absoluteUrl(imgMatches.at(0)![1], categoryUrl) : null;
    const existing = links.get(url);
    if (!existing || existing.score < score) {
      links.set(url, { url, nameFromCard, imageFromCard, score });
    }
  }

  return [...links.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ score: _score, ...link }) => link);
}

function extractCategoryProductLinks(html: string, categoryUrl: string): ProductLink[] {
  if (isCenturyUrl(categoryUrl)) {
    return extractProductLinks(html, categoryUrl);
  }
  if (isAmericaUrl(categoryUrl)) {
    return extractAmericaProductLinks(html, categoryUrl);
  }
  if (isEssenzaUrl(categoryUrl)) {
    return extractEssenzaProductLinks(html, categoryUrl);
  }
  if (isFolioUrl(categoryUrl)) {
    return extractFolioProductLinks(html, categoryUrl);
  }
  if (isTissotUrl(categoryUrl)) {
    return extractTissotProductLinks(html, categoryUrl);
  }
  if (isJhoviniUrl(categoryUrl)) {
    return extractJhoviniProductLinks(html, categoryUrl);
  }
  if (isDoimoUrl(categoryUrl)) {
    return extractDoimoProductLinks(html, categoryUrl);
  }
  if (isCasocaUrl(categoryUrl)) {
    return extractCasocaProductLinks(html, categoryUrl);
  }
  if (isGreenhouseUrl(categoryUrl)) {
    return extractGreenhouseProductLinks(html, categoryUrl);
  }
  if (isFeelingUrl(categoryUrl)) {
    return extractFeelingProductLinks(html, categoryUrl);
  }
  if (isNeoboxUrl(categoryUrl)) {
    return extractNeoboxProductLinks(html, categoryUrl);
  }
  if (isPontoVirgulaUrl(categoryUrl)) {
    return extractPontoVirgulaProductLinks(html, categoryUrl);
  }
  return extractGenericProductLinks(html, categoryUrl);
}

function isLikelyProductPage(html: string, url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    if (isCenturyUrl(url) && /\/produto\/[^/]+$/i.test(path)) return true;
    if (isAmericaUrl(url) && /\/produto\/[^/]+$/i.test(path) && !!extractAmericaProductData(html)) return true;
    if (isEssenzaUrl(url) && /\/pt\/detalhe\/[^/]+\/[^/]+$/i.test(path)) return true;
    if (isTissotUrl(url) && /\/produto\/[^/]+$/i.test(path)) return true;
    if (isJhoviniUrl(url) && /\/produto\/[^/]+\/[^/]+$/i.test(path)) return true;
    if (isDoimoUrl(url) && /\/produto\/[^/]+$/i.test(path)) return true;
    if (isCasocaUrl(url) && isCasocaProductUrl(url) && /page_object["']?\s*:\s*\{[\s\S]*?["']type["']\s*:\s*["']product["']|<meta\s+property=["']og:type["']\s+content=["']product["']|product-info-main/i.test(html)) return true;
    if (isGreenhouseUrl(url) && /\/produto-page\/[^/]+$/i.test(path) && /data-hook=["']product-page["']|<meta\s+property=["']og:type["']\s+content=["']produto["']/i.test(html)) return true;
    if (isFeelingUrl(url) && /\/produto\/[^/]+$/i.test(path) && /prod_arquivo_lista|dce-acf-repeater|elementorFrontendConfig|prod_vista_titulo/i.test(html)) return true;
    if (isNeoboxUrl(url) && /\/product-detail\/\d+$/i.test(path) && /caption--webdor|banner_home|especification--title/i.test(html)) return true;
    if (isPontoVirgulaUrl(url) && /\/produto\/[^/]+$/i.test(path) && /downloads-single|download_bloco|data-fancybox=["']banner-fotos["']/i.test(html)) return true;
    if (/\/produtos\/[^/]+$/i.test(path) && /id=["']single-products["']|download\s*3d|download\s*2d|acessar\s+ficha/i.test(html)) return true;
    if (/\/product\/[^/]+$/i.test(path) && /download|technical|spec|gallery|sku|price/i.test(html)) return true;
    return false;
  } catch {
    return false;
  }
}

function inferCategoryFromProductName(name: string, fallback: string): string {
  const key = normalizeKey(name);
  const categoryRules: Array<[RegExp, string]> = [
    [/\baparador(es)?\b/, "Aparadores"],
    [/\bbuffet(s)?\b/, "Buffets"],
    [/\bpoltrona(s)?\b/, "Poltronas"],
    [/\bsofa(s)?\b/, "Sofás"],
    [/\bpuff(s)?|pufe(s)?\b/, "Pufes"],
    [/\bespreguicadeira(s)?\b/, "Espregui\u00e7adeira"],
    [/\bcadeira(s)?\b/, "Cadeiras"],
    [/\bbanqueta(s)?\b/, "Banquetas"],
    [/\bcabeceira(s)?\b/, "Cabeceiras"],
    [/\bcama(s)?\b/, "Camas"],
    [/\bmesa(s)?\s+de\s+jantar\b/, "Mesas de Jantar"],
    [/\bmesa(s)?\s+de\s+centro\b/, "Mesas de Centro e Laterais"],
    [/\bmesa(s)?\s+lateral|msa\s+lateral\b/, "Mesas de Centro e Laterais"],
    [/\bmesa(s)?\s+de\s+cabeceira|criado(s)?\b/, "Mesas de Cabeceira"],
    [/\brack(s)?\b/, "Racks"],
    [/\bestante(s)?\b/, "Estantes"],
    [/\bespelho(s)?\b/, "Espelhos"],
    [/\bcarrinho(s)?\b/, "Carrinhos"],
    [/\bcomoda(s)?\b/, "Cômodas"],
    [/\bvaso(s)?\b/, "Vasos"],
    [/\bluminaria(s)?\b/, "Luminárias"],
  ];

  return normalizeProductCategory(categoryRules.find(([pattern]) => pattern.test(key))?.[1] || fallback || "Produtos", name);
}

function extractEssenzaProductDescription(html: string): string {
  const detailsEnd = html.search(/<div\b[^>]*class=["'][^"']*\brow\b[^"']*\bacabamentos\b[^"']*["'][^>]*>/i);
  const detailsMatch = /<div\b[^>]*class=["'][^"']*\brow\s+details\b[^"']*["'][^>]*>/i.exec(html);
  if (!detailsMatch || detailsMatch.index === undefined || detailsEnd <= detailsMatch.index) return "";

  const descriptionArea = html.slice(detailsMatch.index, detailsEnd);
  const paragraphs = [...descriptionArea.matchAll(/<p\b(?![^>]*class=["'][^"']*\bportfolio-cates\b)[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanProductDescription(match[1]))
    .filter((text) => {
      if (!text || text.length < 25) return false;
      const key = normalizeKey(text);
      if (/preencha|download|politica|autorizo|compartilhe|marketing|ficha tecnica|manual de conservacao|onde encontrar/.test(key)) return false;
      if (/^\d+(?:\s*x\s*\d+){1,2}\s*$/.test(key)) return false;
      return true;
    });

  return [...new Set(paragraphs)].join(" ").trim();
}

function formatMultilineText(value: string): string {
  return decodeHtml(value)
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .split(/\r?\n/)
    .map((line) => cleanProductDescription(line))
    .filter(Boolean)
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractAmericaProductDescription(html: string): string {
  const product = extractAmericaProductData(html);
  if (!product) return "";

  let description = cleanProductDescription(stringField(product, "description"));
  const materials = formatMultilineText(stringField(product, "materials"));
  if (materials && !normalizeKey(description).includes(normalizeKey(materials.slice(0, 80)))) {
    description = appendUniqueSentence(description, `Materiais e acabamentos: ${materials}`);
  }

  return description;
}

function extractJhoviniProductDescription(html: string): string {
  const section = extractJhoviniProductSection(html);
  if (!section) return "";

  const paragraphs = [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanProductDescription(match[1]))
    .filter((text) => {
      if (!text || text.length < 8) return false;
      const key = normalizeKey(text);
      return !/download|designer|veja outros|newsletter|compartilhe/.test(key);
    });

  const specsBlock = section.match(/<div\b[^>]*class=["'][^"']*\bespecificacoes\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const specs = cleanProductDescription(specsBlock).replace(/^especifica[cç][oõ]es\s*/i, "").trim();
  const description = [...new Set(paragraphs)].join(" ").trim();

  if (specs && !normalizeKey(description).includes(normalizeKey(specs))) {
    return appendUniqueSentence(description, `Especificacoes: ${specs}`);
  }

  return description;
}

function extractDoimoProductDetailsSection(html: string): string {
  return extractBetween(
    html,
    /<h1\b[^>]*class=["'][^"']*\bproduct_title\b[^"']*["'][^>]*>/i,
    /Produtos\s+relacionados|<section\b[^>]*class=["'][^"']*\brelated\b[^"']*["'][^>]*>|<footer\b/i,
  );
}

function extractDoimoProductParagraphs(html: string): string[] {
  const section = extractDoimoProductDetailsSection(html);
  if (!section) return [];

  return [...section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanProductDescription(match[1]))
    .filter((text) => {
      if (!text || text.length < 2) return false;
      const key = normalizeKey(text);
      return !/arquivos 3d|cadastre se|para continuar|name email|quero cadastrar/.test(key);
    });
}

function extractDoimoProductDescription(html: string): string {
  const paragraphs = extractDoimoProductParagraphs(html).filter((text) => text.length >= 8);

  return paragraphs.find((text) => /sofa|sof[aá]|cadeira|poltrona|mesa|banco|metal|couro|estofado/i.test(text)) ?? paragraphs[0] ?? "";
}

function extractCasocaProductDescription(html: string): string {
  const descriptionValue = html.match(/<div\b[^>]*class=["'][^"']*\bproduct\s+attribute\s+description\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["']value["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? "";
  if (descriptionValue) return cleanProductDescription(descriptionValue);

  const descriptionSection = extractBetween(
    html,
    /<div\b[^>]*class=["'][^"']*\bsection-description\b[^"']*["'][^>]*>/i,
    /<div\b[^>]*class=["'][^"']*\b(?:box-technical|additional-addtocart-box|section-info-product)\b[^"']*["'][^>]*>|<footer\b/i,
  );

  return cleanProductDescription(descriptionSection)
    .replace(/^descri[cÃ§][aÃ£]o\s+do\s+produto\s*/i, "")
    .trim();
}

function extractGreenhouseInfoSection(html: string, titlePattern: RegExp): string {
  const titleRegex = /<h2\b[^>]*data-hook=["']info-section-title["'][^>]*>([\s\S]*?)<\/h2>/gi;
  for (const match of html.matchAll(titleRegex)) {
    const title = cleanText(match[1] ?? "");
    if (!titlePattern.test(title)) continue;

    const start = (match.index ?? 0) + match[0].length;
    const tail = html.slice(start);
    const end = /<h2\b[^>]*data-hook=["']info-section-title["']|<footer\b|<\/body>/i.exec(tail);
    return end?.index === undefined ? tail : tail.slice(0, end.index);
  }

  return "";
}

function extractGreenhouseProductDescription(html: string, name: string): string {
  if (!/greenhousemoveis\.com\.br|Green House M[oÃ³]veis/i.test(html)) return "";

  const detailsSection = extractGreenhouseInfoSection(html, /detalhes?\s+do\s+produto|descri[cÃ§][aÃ£]o/i);
  const paragraphs = [...detailsSection.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanProductDescription(match[1]))
    .filter((text) => {
      if (!text || text.length < 2) return false;
      const key = normalizeKey(text);
      return !/^nbsp$|^preco|^valor|^r\$|^quantidade|^comprar/.test(key);
    });
  const rawDescription = [...new Set(paragraphs)].join(" ").trim();

  const categoryName = inferCategoryFromProductName(name, "Produtos").toLowerCase();
  const needsMoreContext = !rawDescription
    || rawDescription.length < 70
    || /feito\s+pela\s+green\s+house\s+moveis?$/.test(normalizeKey(rawDescription));
  if (!needsMoreContext) return rawDescription;

  const fallback = `${name} da Green House Moveis e uma peca de mobiliario outdoor indicada para composicoes de ${categoryName}, com presenca discreta e acabamento visual pensado para projetos residenciais e corporativos.`;
  return appendUniqueSentence(rawDescription, fallback);
}

function extractGreenhouseInfoLink(html: string, titlePattern: RegExp, textPattern: RegExp): string {
  const section = extractGreenhouseInfoSection(html, titlePattern);
  if (!section) return "";

  for (const match of section.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = normalizeDownloadCandidate(match[1] ?? "", "https://www.greenhousemoveis.com.br/");
    if (!href) continue;
    const label = cleanText(match[2] ?? "");
    const context = cleanText(section.slice(Math.max(0, (match.index ?? 0) - 180), (match.index ?? 0) + 260));
    if (textPattern.test(`${label} ${href} ${context}`)) return href;
  }

  return "";
}

function extractGreenhouseFinishLink(html: string): string {
  if (!/greenhousemoveis\.com\.br|Green House M[oÃƒÂ³]veis/i.test(html)) return "";
  return extractGreenhouseInfoLink(html, /acabamentos?/i, /acabamentos?|finish|drive\.google\.com/i)
    || extractGreenhouseInfoLink(html, /detalhes?\s+do\s+produto|ficha/i, /acabamentos?|finish/i);
}

function extractFeelingProductDescription(html: string, name: string): string {
  if (!/feelingestofados\.com\.br|Feeling Estofados/i.test(html)) return "";

  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? "";
  let base = cleanProductDescription(metaDescription)
    .replace(/\s*[-|]\s*Feeling\s+Estofados\s*$/i, "")
    .trim();

  const detailStart = /(?:prod_vista_titulo|>\s*ASSENTO\b|>\s*Vista\s+(?:Lateral|Frontal)\b)/i.exec(html);
  if (detailStart?.index !== undefined) {
    const tail = html.slice(detailStart.index);
    const end = /<div\b[^>]*id=["']prod_arquivo_lista["']|Fa[cç]a\s+o\s+download|Encontre\s+sua\s+configura[cç][aã]o|<footer\b/i.exec(tail);
    const rawDetails = end?.index === undefined ? tail.slice(0, 6000) : tail.slice(0, end.index);
    const details = cleanProductDescription(rawDetails)
      .replace(/^.*?\b(Vista\s+(?:Lateral|Frontal)|ASSENTO)\b/i, "$1")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (details && details.length > 20) {
      base = appendUniqueSentence(base, `Informacoes tecnicas: ${details}`);
    }
  }

  return base || name;
}

function extractNeoboxProductName(html: string): string {
  if (!/neoboxmoveis\.com\.br|caption--webdor|banner_home/i.test(html)) return "";
  const category = cleanText(html.match(/<p\b[^>]*class=["'][^"']*\bcaption--sub\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  const name = cleanImportedProductName(html.match(/<p\b[^>]*class=["'][^"']*\bcaption--webdor\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
  if (!name) return "";
  if (!category || normalizeKey(name).startsWith(normalizeKey(category))) return name;
  return `${category} ${name}`.trim();
}

function extractNeoboxProductDescription(html: string, name: string): string {
  if (!/neoboxmoveis\.com\.br|caption--webdor|banner_home/i.test(html)) return "";

  const captionText = html.match(/<div\b[^>]*class=["'][^"']*\bcaption--text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const description = cleanProductDescription(captionText);
  if (description) return description;

  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? "";
  return cleanProductDescription(metaDescription) || name;
}

function extractPontoVirgulaProductName(html: string, productUrl: string): string {
  if (!isPontoVirgulaUrl(productUrl) && !/pontovirgula\.com|download_bloco|banner-fotos/i.test(html)) return "";

  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<img\b[^>]*data-fancybox=["']banner-fotos["'][^>]*alt=["']([^"']+)["'][^>]*>/i)?.[1]
    || "";
  const cleanTitle = cleanImportedProductName(title)
    .replace(/\s*[-|]\s*ponto\s*v[ií]rgula\s*$/i, "")
    .replace(/\s*[-|]\s*pontov[ií]rgula\s*$/i, "")
    .trim();
  if (cleanTitle && !/^ponto\s*v[ií]rgula$/i.test(cleanTitle)) return titleCasePhrase(cleanTitle);

  return titleCaseFromSlug(productUrl).replace(/^Sofa\s+/i, "Sofa ");
}

function extractPontoVirgulaProductDescription(html: string): string {
  if (!/pontovirgula\.com|download_bloco|banner-fotos/i.test(html)) return "";

  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => cleanProductDescription(match[1] ?? ""))
    .filter((text) => text.length >= 40)
    .filter((text) => !/cookies?|pol[ií]tica|newsletter|whatsapp|copyright|todos os direitos|clique|download/i.test(text));
  if (paragraphs.length) return paragraphs[0];

  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? "";
  return cleanProductDescription(metaDescription);
}

function extractGeneralProductInfo(html: string, name = ""): string {
  const pontoVirgulaDescription = extractPontoVirgulaProductDescription(html);
  if (pontoVirgulaDescription) return pontoVirgulaDescription;

  const feelingDescription = extractFeelingProductDescription(html, name || cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]));
  if (feelingDescription) return feelingDescription;

  const neoboxDescription = extractNeoboxProductDescription(html, name || extractNeoboxProductName(html));
  if (neoboxDescription) return neoboxDescription;

  const greenhouseDescription = extractGreenhouseProductDescription(html, name || cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]));
  if (greenhouseDescription) return greenhouseDescription;

  const americaDescription = extractAmericaProductDescription(html);
  if (americaDescription) return americaDescription;

  const essenzaDescription = extractEssenzaProductDescription(html);
  if (essenzaDescription) return essenzaDescription;

  const jhoviniDescription = extractJhoviniProductDescription(html);
  if (jhoviniDescription) return jhoviniDescription;

  const doimoDescription = extractDoimoProductDescription(html);
  if (doimoDescription) return doimoDescription;

  const casocaDescription = extractCasocaProductDescription(html);
  if (casocaDescription) return casocaDescription;

  const folioDescription = html.match(/<div[^>]*class=["'][^"']*wrapper[^"']*espec[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>\s*Descri[\s\S]*?<\/h2>[\s\S]*?<div[^>]*class=["'][^"']*cols[^"']*["'][^>]*>\s*<div[^>]*class=["'][^"']*col[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*col/i)?.[1]
    ?? "";
  if (folioDescription) return cleanProductDescription(folioDescription);

  const collapse = html.match(/id=["']collapseInfoGerais["'][^>]*>[\s\S]*?<div[^>]*class=["'][^"']*card-body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1]
    ?? html.match(/Informações Gerais[\s\S]{0,900}?<div[^>]*class=["'][^"']*card-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    ?? "";
  return cleanProductDescription(collapse);
}

function normalizePersonName(value: string): string {
  return cleanText(value)
    .replace(/\s*\|.*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractDesignCredit(html: string): string {
  const americaDesigner = normalizePersonName(stringField(asRecord(extractAmericaProductData(html)?.designer), "name"));
  if (americaDesigner) return americaDesigner;

  const doimoDesigner = extractDoimoProductParagraphs(html)
    .map((paragraph) => paragraph.match(/design\s+by\s+(.+)$/i)?.[1] ?? "")
    .map((name) => normalizePersonName(name))
    .find(Boolean);
  if (doimoDesigner) return doimoDesigner;

  const text = cleanText(html);
  const patterns = [
    /(?:designed\s+by|design\s+by|designer\s*:?)\s+([A-ZÀ-Ü][A-Za-zÀ-ü'. -]{2,80})/i,
    /(?:assinado|assinada)\s+por\s+([A-ZÀ-Ü][A-Za-zÀ-ü'. -]{2,80})/i,
    /design\s+assinado\s+por\s+([A-ZÀ-Ü][A-Za-zÀ-ü'. -]{2,80})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const name = normalizePersonName(match?.[1] ?? "");
    if (name && !/tamanho|medida|pre[cç]o|valor|download|or[cç]amento|descri[cç][aã]o/i.test(name)) return name;
  }

  return "";
}

function normalizeMeasureValue(value: string): string {
  return cleanText(value)
    .replace(/\bR\$\s*[\d.,]+.*/i, "")
    .replace(/\*/g, "")
    .replace(/(\d)\s*[xX×]\s*(\d)/g, "$1 x $2")
    .replace(/\s{2,}/g, " ")
    .replace(/[.;,\s]+$/g, "")
    .trim();
}

function extractEssenzaMeasurementInfo(html: string): string {
  const detailsSection = extractBetween(
    html,
    /<div\b[^>]*class=["'][^"']*\brow\s+details\b[^"']*["'][^>]*>/i,
    /<div\b[^>]*class=["'][^"']*\brow\b[^"']*["'][^>]*>\s*<div\b[^>]*class=["'][^"']*\bcol-md-12\b/i,
  );
  if (!detailsSection) return "";

  const measureBlock = detailsSection.match(/<h6\b[^>]*>[\s\S]*?medidas?[\s\S]*?<\/h6>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const spanValue = measureBlock.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "";
  const textValue = cleanText(measureBlock).match(/([0-9][0-9.,\s]*[xX]\s*[0-9][0-9.,\s]*(?:[xX]\s*[0-9][0-9.,\s]*)?(?:\s*(?:cm|mm|m))?)/i)?.[1] ?? "";
  return normalizeMeasureValue(spanValue || textValue);
}

function extractAmericaMeasurementInfo(html: string): string {
  const dimensions = formatMultilineText(stringField(extractAmericaProductData(html), "dimensions"));
  return normalizeMeasureValue(dimensions);
}

function formatDoimoMeasurements(value: string): string {
  const cleaned = normalizeMeasureValue(value)
    .replace(/\*?\s*foto\b/gi, " ")
    .replace(/(\d)\s*[xXÃ—]\s*(\d)/g, "$1 x $2");
  const dimensions = [...cleaned.matchAll(/(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)/gi)]
    .map((match) => `${match[1]} x ${match[2]} x ${match[3]} cm`);
  return [...new Set(dimensions)].join(", ");
}

function extractDoimoMeasurementInfo(html: string): string {
  const paragraphs = extractDoimoProductParagraphs(html)
    .map((paragraph) => paragraph.replace(/(\d)\s*x\s*(\d)/gi, "$1 x $2"))
    .filter(Boolean);
  const measureIndex = paragraphs.findIndex((paragraph) => /\(L\)\s*X\s*\(P\)\s*X\s*\(H\)|medidas?|dimens[oõ]es?/i.test(paragraph));
  const candidate = measureIndex >= 0 ? paragraphs[measureIndex + 1] : paragraphs.find((paragraph) => /\d+\s*x\s*\d+\s*x\s*\d+/i.test(paragraph));
  return formatDoimoMeasurements(candidate || "");
}

function extractCasocaMeasurementInfo(html: string): string {
  const labels: Array<[string, string[]]> = [
    ["Altura", ["altura", "height"]],
    ["Largura", ["largura", "width"]],
    ["Profundidade", ["profundidade", "comprimento", "depth", "lenght", "length"]],
  ];
  const values: string[] = [];

  for (const [label, keys] of labels) {
    const keyPattern = keys.join("|");
    const match = html.match(new RegExp(`<li\\b[^>]*(?:id=["'](?:${keyPattern})["']|class=["'][^"']*product-attribute-(?:${keyPattern})-data[^"']*["'])[^>]*>[\\s\\S]*?<span\\b[^>]*>([\\s\\S]*?)<\\/span>\\s*([^<]*)<\\/li>`, "i"));
    const number = cleanText(match?.[1] ?? "");
    const unit = cleanText(match?.[2] ?? "");
    if (!number) continue;
    values.push(`${label}: ${normalizeMeasureValue(`${number} ${unit || "CM"}`)}`);
  }

  return values.join("; ");
}

function extractGreenhouseMeasurementInfo(html: string): string {
  if (!/greenhousemoveis\.com\.br|Green House M[oÃ³]veis/i.test(html)) return "";

  const sections = [
    extractGreenhouseInfoSection(html, /detalhes?\s+do\s+produto|medidas?|dimens[oÃµ]es?|ficha/i),
    extractGreenhouseInfoSection(html, /blocos?\s*3d/i),
  ].filter(Boolean);
  const text = cleanText(sections.join(" "));
  const labels: Array<[string, RegExp]> = [
    ["Largura", /(?:largura|width)\s*:?\s*([0-9][0-9.,]*(?:\s*(?:cm|mm|m))?)/i],
    ["Profundidade", /(?:profundidade|comprimento|depth|length)\s*:?\s*([0-9][0-9.,]*(?:\s*(?:cm|mm|m))?)/i],
    ["Altura", /(?:altura|height)\s*:?\s*([0-9][0-9.,]*(?:\s*(?:cm|mm|m))?)/i],
  ];
  const values = labels
    .map(([label, pattern]) => {
      const value = normalizeMeasureValue(text.match(pattern)?.[1] ?? "");
      return value ? `${label}: ${value}` : "";
    })
    .filter(Boolean);
  if (values.length >= 2) return values.join("; ");

  const dimensions = [...text.matchAll(/(?:^|[^0-9])(\d{3,4})\s*[xX]\s*(\d{2,4})(?:\s*[xX]\s*(\d{2,4}))?(?=[^0-9]|$)/g)]
    .map((match) => [match[1], match[2], match[3]].filter(Boolean).join(" x "))
    .filter(Boolean);
  const uniqueDimensions = [...new Set(dimensions)];
  if (uniqueDimensions.length) return `Medidas disponiveis: ${uniqueDimensions.join(", ")}`;

  const compact = text.match(/([0-9][0-9.,\s]*(?:x|X|Ã—)\s*[0-9][0-9.,\s]*(?:(?:x|X|Ã—)\s*[0-9][0-9.,\s]*)?(?:\s*(?:cm|mm|m))?)/i)?.[1] ?? "";
  return normalizeMeasureValue(compact);
}

function extractFeelingMeasurementInfo(html: string): string {
  if (!/feelingestofados\.com\.br|Feeling Estofados/i.test(html)) return "";

  const text = cleanText(html);
  const depths = new Set<string>();
  for (const match of text.matchAll(/profundidade\s*(?:de|-)?\s*(\d+[,.]?\d*)\s*m\b/gi)) {
    const value = match[1]?.replace(".", ",") ?? "";
    if (value) depths.add(`${value} m`);
  }
  for (const match of html.matchAll(/Profundidade[-_\s]*(1(?:15|60|95)|\d{2,3})/gi)) {
    const raw = match[1] ?? "";
    if (raw.length === 3) depths.add(`${raw[0]},${raw.slice(1)} m`);
  }

  const explicitDimensions = [...text.matchAll(/(?:medidas?|dimens[oõ]es?|tamanho)\s*:?\s*([0-9][0-9.,\s]*(?:x|X|Ã—)\s*[0-9][0-9.,\s]*(?:(?:x|X|Ã—)\s*[0-9][0-9.,\s]*)?(?:\s*(?:cm|mm|m))?)/gi)]
    .map((match) => normalizeMeasureValue(match[1] ?? ""))
    .filter(Boolean);
  if (explicitDimensions.length) return `Medidas disponiveis: ${[...new Set(explicitDimensions)].join(", ")}`;
  if (depths.size) return `Profundidades disponiveis: ${[...depths].join(", ")}`;

  return "";
}

function extractNeoboxMeasurementInfo(html: string): string {
  if (!/neoboxmoveis\.com\.br|especification--title/i.test(html)) return "";

  const rows = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\binner--list\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .map((match) => match[0] ?? "");
  for (const row of rows) {
    const title = cleanText(row.match(/<p\b[^>]*class=["'][^"']*\bespecification--title\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    if (!/dimens|medidas?|measurements?|dimensions?/i.test(title)) continue;
    const value = cleanText(row.match(/<p\b[^>]*class=["'][^"']*\bespecification--text\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const normalized = normalizeMeasureValue(value);
    if (normalized) return normalized;
  }

  const text = cleanText(html);
  const match = text.match(/(?:dimens(?:oes|oes|ões|ões)|medidas?)\s*([A-Z\sx:]*\d+[0-9.,\s]*(?:x|X|Ã—)\s*\d+[0-9.,\s]*(?:(?:x|X|Ã—)\s*\d+[0-9.,\s]*)?(?:cm|mm|m)?)/i);
  return normalizeMeasureValue(match?.[1] ?? "");
}

function extractMeasurementInfo(html: string): string {
  const americaMeasurement = extractAmericaMeasurementInfo(html);
  if (americaMeasurement) return americaMeasurement;

  const essenzaMeasurement = extractEssenzaMeasurementInfo(html);
  if (essenzaMeasurement) return essenzaMeasurement;

  const doimoMeasurement = extractDoimoMeasurementInfo(html);
  if (doimoMeasurement) return doimoMeasurement;

  const casocaMeasurement = extractCasocaMeasurementInfo(html);
  if (casocaMeasurement) return casocaMeasurement;

  const greenhouseMeasurement = extractGreenhouseMeasurementInfo(html);
  if (greenhouseMeasurement) return greenhouseMeasurement;

  const feelingMeasurement = extractFeelingMeasurementInfo(html);
  if (feelingMeasurement) return feelingMeasurement;

  const neoboxMeasurement = extractNeoboxMeasurementInfo(html);
  if (neoboxMeasurement) return neoboxMeasurement;

  const text = cleanText(html);
  const patterns = [
    /(?:tamanho|medidas?|dimens[oõ]es?)\s*:?\s*([0-9][0-9.,\s]*(?:x|X|×)\s*[0-9][0-9.,\s]*(?:(?:x|X|×)\s*[0-9][0-9.,\s]*)?(?:\s*(?:cm|mm|m))?)/i,
    /(?:largura|comprimento|profundidade|altura)\s*:?\s*([0-9][0-9.,\s]*(?:cm|mm|m)?(?:\s*[xX×]\s*[0-9][0-9.,\s]*(?:cm|mm|m)?){1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const measurement = normalizeMeasureValue(match?.[1] ?? "");
    if (measurement) return measurement;
  }

  return "";
}

function appendUniqueSentence(base: string, sentence: string): string {
  const cleanSentence = cleanProductDescription(sentence);
  if (!cleanSentence) return base;
  if (normalizeKey(base).includes(normalizeKey(cleanSentence))) return base;
  const withPunctuation = /[.!?]$/.test(cleanSentence) ? cleanSentence : `${cleanSentence}.`;
  return [base, withPunctuation].filter(Boolean).join(" ").trim();
}

function comfortLabel(kind: string, value: number): string {
  const normalizedKind = normalizeKey(kind);
  if (normalizedKind.includes("sentar")) {
    if (value <= 2) return "sentar mais reto, adequado a composições formais e de recepção";
    if (value >= 4) return "sentar mais relaxado, indicado para áreas de estar prolongado e salas de TV";
    return "sentar equilibrado, entre postura formal e conforto descontraído";
  }
  if (normalizedKind.includes("ambiente")) {
    if (value <= 2) return "uso voltado a livings, recepções e ambientes sociais";
    if (value >= 4) return "uso voltado a home, salas de TV e ambientes mais despojados";
    return "uso versátil entre living e home";
  }
  if (normalizedKind.includes("aparencia")) {
    if (value <= 2) return "aparência lisa, com acabamento mais retilíneo e organizado";
    if (value >= 4) return "aparência mais aconchegante, com volume macio e aspecto ondulado";
    return "aparência equilibrada, entre linhas limpas e volume acolhedor";
  }
  return "";
}

function extractComfortProfile(html: string): string[] {
  const profile: string[] = [];
  const signals = extractComfortSignals(html);
  for (const [kind, value] of Object.entries(signals)) {
    const label = comfortLabel(kind, value);
    if (label) profile.push(label);
  }

  return [...new Set(profile)];
}

function extractComfortSignals(html: string): ComfortSignals {
  const section = extractSectionById(html, "regua-conforto");
  if (!section) return {};

  const signals: ComfortSignals = {};
  const cardRegex = /<div[^>]*class=["'][^"']*single-conforto[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
  for (const match of section.matchAll(cardRegex)) {
    const card = match[1] ?? "";
    const title = normalizeKey(cleanText(card.match(/<h2[^>]*>([\s\S]*?)(?:<img|<\/h2>)/i)?.[1]));
    const value = Number(card.match(/aria-valuenow=["']?(\d+)/i)?.[1] ?? 0);
    if (!value) continue;
    if (title.includes("sentar")) signals.sentar = value;
    if (title.includes("ambiente")) signals.ambiente = value;
    if (title.includes("aparencia")) signals.aparencia = value;
  }

  return signals;
}

function extractProductDescription(html: string, metadata: Record<string, unknown>, name: string): string {
  const metaDescription = typeof metadata?.description === "string" ? metadata.description : "";
  const htmlDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    ?? "";
  let base = extractGeneralProductInfo(html, name) || cleanProductDescription(metaDescription || htmlDescription);
  const comfort = extractComfortProfile(html);
  const designerName = extractDesignCredit(html);
  const measurement = extractMeasurementInfo(html);

  if (designerName && !normalizeKey(base).includes(normalizeKey(designerName))) {
    base = appendUniqueSentence(base, `Design assinado por ${designerName}`);
  }
  if (measurement) {
    const measurementLabel = extractDoimoMeasurementInfo(html)
      ? "Medidas disponiveis (L x P x H)"
      : "Medidas";
    base = appendUniqueSentence(base, `${measurementLabel}: ${measurement}`);
  }

  if (!comfort.length) return base;
  const technicalSentence = `Para especificação, ${sentenceCase(comfort.join(", "))}.`;
  if (!base) return `${name}. ${technicalSentence}`;
  return appendUniqueSentence(base, technicalSentence);
}

function extractFallbackProductName(html: string, metadata: Record<string, unknown>, productUrl: string, brandName?: string): string {
  const americaName = cleanText(stringField(extractAmericaProductData(html), "name"));
  if (americaName) return americaName;

  if (isNeoboxUrl(productUrl)) {
    const neoboxName = extractNeoboxProductName(html);
    if (neoboxName) return neoboxName;
  }

  if (isPontoVirgulaUrl(productUrl)) {
    const pontoVirgulaName = extractPontoVirgulaProductName(html, productUrl);
    if (pontoVirgulaName) return pontoVirgulaName;
  }

  const metaTitle = typeof metadata?.title === "string" ? metadata.title : "";
  let title = cleanText(
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      || metaTitle
      || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
  )
    .replace(/\s*[-|]\s*Century\s*$/i, "")
    .replace(/^Mesa\s+de\s+Cabeceira\s+/i, "")
    .replace(/^Mesa\s+/i, "")
    .trim();

  if (brandName) {
    title = title
      .replace(new RegExp(`\\s*[-|]\\s*${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i"), "")
      .trim();
  }

  return cleanImportedProductName(title) || titleCaseFromSlug(productUrl);
}

function normalizeImageUrl(url: string, baseUrl: string): string {
  let normalized = absoluteUrl(url, baseUrl).split("#")[0];
  if (isCenturyUrl(baseUrl)) {
    normalized = normalized.replace("/wp-content/webp-express/webp-images/", "/wp-content/");
    normalized = normalized.replace(/\.webp(\?.*)?$/i, "");
  }
  if (isEssenzaUrl(baseUrl)) {
    normalized = normalized.replace(/_([0-9]{3,4})x([0-9]{3,4})_[a-z](?=\.(?:jpe?g|png|webp)$)/i, "");
  }
  if (isTissotUrl(baseUrl)) {
    normalized = normalized.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, "");
  }
  if (isJhoviniUrl(baseUrl)) {
    normalized = normalized.replace(/\/fotos\/produtos\/pq_/i, "/fotos/produtos/gd_");
  }
  if (isDoimoUrl(baseUrl)) {
    normalized = normalized.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, "");
  }
  if (isFeelingUrl(baseUrl)) {
    normalized = normalized
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\\//g, "/")
      .replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, "");
  }
  if (isPontoVirgulaUrl(baseUrl)) {
    normalized = normalized
      .replace(/\\u002[fF]/g, "/")
      .replace(/\\\//g, "/")
      .replace("/wp-content/webp-express/webp-images/", "/wp-content/")
      .replace(/\.webp(\?.*)?$/i, "");
  }
  if (isGreenhouseUrl(baseUrl)) {
    normalized = normalized.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/");
    const wixOriginal = normalized.match(/^(https?:\/\/static\.wixstatic\.com\/media\/[^/?#]+\.(?:jpe?g|png|webp))(?:\/v1\/[^?#]+)?/i)?.[1];
    if (wixOriginal) normalized = wixOriginal;
  }
  return normalized;
}

function isVideoAssetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(mp4|webm|mov|m4v|avi|m3u8)(?:\?|$)/i.test(lower)
    || /(?:^|\/\/)(?:video|videos)\./i.test(lower)
    || /\/video\//i.test(lower)
    || /youtube\.com|youtu\.be|vimeo\.com|wistia\.com|streamable\.com/i.test(lower);
}

function looksLikeProductImage(url: string, baseUrl: string): boolean {
  const lower = url.toLowerCase();
  if (isVideoAssetUrl(url)) return false;
  const isAmericaProductAsset = isAmericaUrl(baseUrl)
    && /admin\.americamoveis\.com\/uploads\/product\/\d+\//.test(lower)
    && !/\/(?:productcategory|productcollection|design)\//.test(lower);
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(lower) && !isAmericaProductAsset) return false;
  if (/teste-cor/.test(lower)) return false;
  if (isCenturyUrl(baseUrl)) {
    if (!/\/wp-content\/uploads\//.test(lower)) return false;
    if (/-\d+x\d+\./.test(lower)) return false;
  }
  if (isAmericaUrl(baseUrl) && !isAmericaProductAsset) return false;
  if (isEssenzaUrl(baseUrl)) {
    if (!/\/upload\//.test(lower)) return false;
    if (/_400x400_[a-z]\./.test(lower)) return false;
  }
  if (isFolioUrl(baseUrl) && !/\/assets\/uploads\//.test(lower)) return false;
  if (isTissotUrl(baseUrl)) {
    if (!/\/wp-content\/uploads\//.test(lower)) return false;
    if (/\/elementor\/thumbs\//.test(lower)) return false;
    if (/designer-|\/designer\//.test(lower)) return false;
  }
  if (isJhoviniUrl(baseUrl)) {
    if (!/\/fotos\/produtos\//.test(lower)) return false;
    if (/\/fotos\/designers\//.test(lower)) return false;
  }
  if (isDoimoUrl(baseUrl) && !/\/wp-content\/uploads\//.test(lower)) return false;
  if (isCasocaUrl(baseUrl)) {
    if (!/\/media\/catalog\/product\//.test(lower)) return false;
    if (/\/media\/casoca\/brands\//.test(lower)) return false;
  }
  if (isGreenhouseUrl(baseUrl)) {
    if (!/static\.wixstatic\.com\/media\//.test(lower)) return false;
    if (/video|thumbnailurl|poster/i.test(lower)) return false;
    if (/f1a99a_74feb70f752b4dbeb5060a08aff427be|f1a99a_d363eb8487be42ffabb399b597e5cd35|01c3aff52f2a4dffa526d7a9843d46ea|0fdef751204647a3bbd7eaa2827ed4f9/.test(lower)) return false;
  }
  if (isFeelingUrl(baseUrl)) {
    if (!/feelingestofados\.com\.br\/wp-content\/uploads\//.test(lower)) return false;
    if (/certificado|garantia|manual|catalogo|cat[aá]logo|logo|favicon|icon|icone|ultracel|configura[cç]|vista|acabamento|tecido|amostra|placeholder|cropped/.test(lower)) return false;
  }

  if (isNeoboxUrl(baseUrl) && !/neoboxmoveis\.com\.br\/public\/uploads\//.test(lower)) return false;
  if (isPontoVirgulaUrl(baseUrl)) {
    if (!/pontovirgula\.com\/wp-content\/uploads\//.test(lower)) return false;
    if (/logo|favicon|icon|icone|arrow|collapse|tecido|acabamento|amostra|placeholder|cropped|captura-de-tela|-\d+x\d+(?=\.(?:jpe?g|png|webp))/i.test(lower)) return false;
  }

  return ![
    "logo",
    "selo",
    "icon",
    "icone",
    "arrow",
    "fav",
    "cropped",
    "pintura",
    "laca",
    "aco",
    "madeira",
    "tecido",
    "acabamento",
    "whatsapp",
    "sprite",
    "placeholder",
    "avatar",
    "payment",
    "banner",
    "related",
    "designer",
  ].some((fragment) => lower.includes(fragment));
}

function extractAmericaImagesFromGallery(gallery: unknown, productUrl: string, maxImages: number): string[] {
  const candidates: string[] = [];
  const galleryItems = Array.isArray(gallery) ? gallery : [];

  for (const item of galleryItems) {
    const image = asRecord(item);
    const bestImage = stringField(image, "original")
      || stringField(image, "large")
      || stringField(image, "zoom")
      || stringField(image, "miniature");
    if (bestImage) candidates.push(bestImage);
  }

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates.filter(Boolean)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractAmericaProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const product = extractAmericaProductData(html);
  if (!product) return [];

  const images = extractAmericaImagesFromGallery(product.gallery, productUrl, maxImages);
  if (images.length >= maxImages) return images;

  const fallbackCandidates = [stringField(product, "cover"), cardImage].filter(Boolean);
  const seen = new Set(images);
  for (const candidate of fallbackCandidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractBalancedJsonObject(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  const objectStart = source.indexOf("{", markerIndex);
  if (objectStart < 0) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(objectStart, index + 1);
    }
  }

  return "";
}

function extractCasocaProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const galleryJson = extractBalancedJsonObject(html, "\"mage/gallery/gallery\"");

  if (galleryJson) {
    try {
      const gallery = JSON.parse(galleryJson);
      const data = Array.isArray(gallery?.data) ? gallery.data : [];
      for (const item of data) {
        const record = asRecord(item);
        candidates.push(stringField(record, "full") || stringField(record, "img") || stringField(record, "thumb"));
      }
    } catch {
      // Use visible image candidates below when Magento gallery JSON cannot be parsed.
    }
  }

  const productOnlySection = extractProductImageSection(html, productUrl);
  candidates.push(...collectImageCandidates(productOnlySection || html));
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates.filter(Boolean)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function collectJsonLdImageCandidates(value: unknown): string[] {
  const candidates: string[] = [];
  if (!value) return candidates;

  if (typeof value === "string") {
    candidates.push(value);
    return candidates;
  }

  if (Array.isArray(value)) {
    for (const item of value) candidates.push(...collectJsonLdImageCandidates(item));
    return candidates;
  }

  const record = asRecord(value);
  if (!record) return candidates;

  const typeValue = record["@type"];
  const typeText = Array.isArray(typeValue) ? typeValue.join(" ") : String(typeValue || "");
  if (/\bVideoObject\b/i.test(typeText)) return candidates;
  const isImageObject = /\bImageObject\b/i.test(typeText);
  for (const key of ["thumbnailUrl", "contentUrl", "url", "image"]) {
    const nested = record[key];
    if (isImageObject || key === "thumbnailUrl" || key === "image") {
      candidates.push(...collectJsonLdImageCandidates(nested));
    }
  }

  if (Array.isArray(record["@graph"])) {
    candidates.push(...collectJsonLdImageCandidates(record["@graph"]));
  }

  return candidates;
}

function extractTissotStructuredImageCandidates(html: string): string[] {
  const candidates: string[] = [];
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdRegex)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] ?? ""));
      candidates.push(...collectJsonLdImageCandidates(parsed));
    } catch {
      // Ignore malformed structured data and use visible carousel images below.
    }
  }

  const featuredImage = html.match(/"featuredImage"\s*:\s*"([^"]+)"/i)?.[1];
  if (featuredImage) candidates.push(featuredImage.replace(/\\\//g, "/"));

  return candidates;
}

function extractGreenhouseStructuredImageCandidates(html: string): string[] {
  const candidates: string[] = [];
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(jsonLdRegex)) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1] ?? ""));
      candidates.push(...collectJsonLdImageCandidates(parsed));
    } catch {
      // Use visible gallery images below when Wix emits escaped or partial JSON.
    }
  }

  const ogImage = html.match(/<meta\b[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (ogImage) candidates.push(ogImage);

  return candidates;
}

function stripVideoMarkup(html: string): string {
  return html
    .replace(/<video\b[\s\S]*?<\/video>/gi, " ")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<a\b[^>]*href=["'][^"']*(?:youtube\.com|youtu\.be|vimeo\.com|wistia\.com)[^"']*["'][\s\S]*?<\/a>/gi, " ")
    .replace(/<img\b[^>]*(?:youtube\.com|youtu\.be|ytimg\.com|vimeo\.com|wistia\.com)[^>]*>/gi, " ")
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?\bVideoObject\b[\s\S]*?<\/script>/gi, " ");
}

function extractTissotProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const imageLimit = Math.min(maxImages, TISSOT_IMAGE_LIMIT);
  const candidates: string[] = [];
  const carousel = extractBetween(
    html,
    /<div\b[^>]*class=["'][^"']*\belementor-widget-image-carousel\b[^"']*["'][^>]*>/i,
    /<div\b[^>]*class=["'][^"']*\belementor-author-box\b|<div\b[^>]*class=["'][^"']*\bjet-listing-grid\b|<footer\b/i,
  );

  if (carousel) candidates.push(...collectImageCandidates(carousel));
  candidates.push(...extractTissotStructuredImageCandidates(html));
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= imageLimit) break;
  }

  return images;
}

function extractGreenhouseProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const gallery = extractBetween(
    html,
    /<div\b[^>]*data-hook=["']product-gallery-root["'][^>]*>/i,
    /<div\b[^>]*data-hook=["']product-page-media-overlay["']|<h1\b[^>]*data-hook=["']product-title["']|<h2\b[^>]*data-hook=["']info-section-title["']|<footer\b/i,
  );

  candidates.push(...extractGreenhouseStructuredImageCandidates(html));
  candidates.push(...collectImageCandidates(stripVideoMarkup(gallery || html)));
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractJhoviniProductSection(html: string): string {
  return extractBetween(
    html,
    /<section\b[^>]*id=["']produto["'][^>]*>/i,
    /<section\b[^>]*id=["'](?:video_produto|veja_outros)["'][^>]*>|<footer\b/i,
  );
}

function extractJhoviniProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const section = extractJhoviniProductSection(html);
  const candidates: string[] = [];

  if (section) {
    const principal = section.match(/<span\b[^>]*class=["'][^"']*\bprincipal\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1];
    if (principal) candidates.push(principal);

    for (const match of section.matchAll(/<li\b[^>]*data-src=["']([^"']+)["'][^>]*>/gi)) {
      candidates.push(match[1]);
    }

    for (const match of section.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) {
      candidates.push(match[1]);
    }
  }

  const ogImage = html.match(/<meta\b[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (ogImage) candidates.push(ogImage);
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractDoimoProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const detailsSection = extractDoimoProductDetailsSection(html);
  const beforeRelated = detailsSection || extractBetween(
    html,
    /<main\b|<body\b/i,
    /Produtos\s+relacionados|<section\b[^>]*class=["'][^"']*\brelated\b[^"']*["'][^>]*>|<footer\b/i,
  );

  candidates.push(...collectImageCandidates(beforeRelated || html));
  if (cardImage) candidates.unshift(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractBetween(html: string, startPattern: RegExp, endPattern: RegExp): string {
  const start = startPattern.exec(html);
  if (!start || start.index === undefined) return "";

  const tail = html.slice(start.index);
  const afterOpening = tail.slice(start[0].length);
  const end = endPattern.exec(afterOpening);
  return end?.index === undefined ? tail : tail.slice(0, start[0].length + end.index);
}

function extractProductImageSection(html: string, productUrl: string): string {
  if (isCasocaUrl(productUrl)) {
    return extractBetween(
      html,
      /<(?:div|section)\b[^>]*(?:data-gallery-role=["']gallery-placeholder["']|class=["'][^"']*(?:gallery-placeholder|product\s+media|fotorama|product-info-main)[^"']*["'])[^>]*>/i,
      /<(?:section|div)\b[^>]*(?:id|class)=["'][^"']*(related|relacionad|recommend|similar|footer|product-info-price|description)[^"']*["'][^>]*>|<footer\b/i,
    );
  }

  if (isFolioUrl(productUrl)) {
    return extractBetween(
      html,
      /<div\b[^>]*id=["']single-products["'][^>]*>/i,
      /<div\b[^>]*id=["']produtos["'][^>]*>|<footer\b/i,
    );
  }

  if (isEssenzaUrl(productUrl)) {
    return extractBetween(
      html,
      /<div\b[^>]*class=["'][^"']*\bgallery-post\b[^"']*["'][^>]*>/i,
      /<div\b[^>]*class=["'][^"']*\bspace-60\b[^"']*["'][^>]*>|<div\b[^>]*class=["'][^"']*\brow\s+details\b[^"']*["'][^>]*>|<div\b[^>]*class=["'][^"']*\bacabamentos\b[^"']*["'][^>]*>|<footer\b/i,
    );
  }

  if (isCenturyUrl(productUrl)) {
    const productGallery = extractBetween(
      html,
      /<div\b[^>]*class=["'][^"']*\bslider-for1\b[^"']*["'][^>]*>/i,
      /<\/section>|<section\b[^>]*(?:id|class)=["'][^"']*(relacionad|related|acabamento|finish|ambiente|ambient)[^"']*["'][^>]*>|<footer\b/i,
    );
    if (productGallery) return productGallery;

    return extractBetween(
      html,
      /<(?:section|div)\b[^>]*(?:id|class)=["'][^"']*(produto|product|galeria|gallery)[^"']*["'][^>]*>/i,
      /<(?:section|div)\b[^>]*(?:id|class)=["'][^"']*(relacionad|related|acabamento|finish|ambiente|ambient|composi[cç][aã]o|composition)[^"']*["'][^>]*>|<footer\b/i,
    );
  }

  if (isJhoviniUrl(productUrl)) {
    return extractJhoviniProductSection(html);
  }

  return extractBetween(
    html,
    /<(?:main|section|div)\b[^>]*(?:id|class)=["'][^"']*(product|produto|gallery|galeria|single)[^"']*["'][^>]*>/i,
    /<(?:section|div)\b[^>]*(?:id|class)=["'][^"']*(related|relacionad|recommend|similar|footer)[^"']*["'][^>]*>|<footer\b/i,
  );
}

function extractFeelingProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const featured = html.match(/"featuredImage"\s*:\s*"([^"]+)"/i)?.[1]
    || html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || "";
  if (featured) candidates.push(featured);
  if (cardImage) candidates.push(cardImage);

  const productName = normalizeKey(
    cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || titleCaseFromSlug(productUrl)),
  );
  const slug = normalizeKey(titleCaseFromSlug(productUrl));
  const allCandidates = collectImageCandidates(html)
    .filter((url) => {
      const normalized = normalizeImageUrl(url, productUrl);
      const key = normalizeKey(deepDecodeUriComponent(normalized));
      if (!looksLikeProductImage(normalized, productUrl)) return false;
      if (/imagemdoproduto|produto/.test(key)) return true;
      if (productName && key.includes(productName)) return true;
      if (slug && key.includes(slug)) return true;
      if (/sofa|sof[aá]|poltrona|mesa|cama|cadeira|banco|puff/.test(key)) return true;
      return false;
    });
  candidates.push(...allCandidates);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates.filter(Boolean)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractNeoboxProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const gallery = extractBetween(
    html,
    /<ul\b[^>]*class=["'][^"']*\bbanner_home\b[^"']*["'][^>]*>/i,
    /<\/ul>/i,
  );

  candidates.push(...collectImageCandidates(gallery || ""));
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates.filter(Boolean)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractPontoVirgulaProductImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  const candidates: string[] = [];
  const galleryRegex = /<img\b(?=[^>]*data-fancybox=["']banner-fotos["'])([^>]*)>/gi;
  for (const match of html.matchAll(galleryRegex)) {
    const tag = match[0] ?? "";
    candidates.push(
      extractAttribute(tag, "href")
        || extractAttribute(tag, "data-src")
        || extractAttribute(tag, "src"),
    );
  }

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || "";
  if (ogImage) candidates.push(ogImage);
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates.filter(Boolean)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractImages(html: string, productUrl: string, cardImage: string | null, maxImages: number): string[] {
  if (isAmericaUrl(productUrl)) {
    const americaImages = extractAmericaProductImages(html, productUrl, cardImage, maxImages);
    if (americaImages.length) return americaImages;
  }
  if (isTissotUrl(productUrl)) {
    return extractTissotProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isJhoviniUrl(productUrl)) {
    return extractJhoviniProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isDoimoUrl(productUrl)) {
    return extractDoimoProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isCasocaUrl(productUrl)) {
    return extractCasocaProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isGreenhouseUrl(productUrl)) {
    return extractGreenhouseProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isFeelingUrl(productUrl)) {
    return extractFeelingProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isNeoboxUrl(productUrl)) {
    return extractNeoboxProductImages(html, productUrl, cardImage, maxImages);
  }
  if (isPontoVirgulaUrl(productUrl)) {
    return extractPontoVirgulaProductImages(html, productUrl, cardImage, maxImages);
  }

  const candidates: string[] = [];
  const productOnlySection = extractProductImageSection(html, productUrl);
  const imageSourceHtml = productOnlySection || html;

  const urlRegex = /https?:\/\/[^"')\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"')\s<>]*)?/gi;
  for (const match of imageSourceHtml.matchAll(urlRegex)) {
    if (!isVideoAssetUrl(match[0])) candidates.push(match[0]);
  }

  const srcRegex = /<(?:a|img|source)\b[^>]+(href|src|data-src|data-large_image|srcset)=["']([^"']+)["'][^>]*>/gi;
  for (const match of imageSourceHtml.matchAll(srcRegex)) {
    const attribute = match[1].toLowerCase();
    const value = match[2];
    if (attribute === "srcset") {
      candidates.push(...value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter((url) => !isVideoAssetUrl(url)));
    } else {
      if (!isVideoAssetUrl(value)) candidates.push(value);
    }
  }
  if (cardImage) candidates.push(cardImage);

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractGenericAmbientSection(html: string): string {
  const match = html.match(/<(section|div)\b[^>]*(?:id|class)=["'][^"']*(ambient|ambiente|lifestyle|inspiration|inspiracao|inspire|galeria-ambient)[^"']*["'][^>]*>/i);
  if (!match || match.index === undefined) return "";
  const start = match.index;
  const tail = html.slice(start);
  const next = tail.slice(match[0].length).match(/<(section|footer)\b/i);
  return next?.index === undefined ? tail : tail.slice(0, match[0].length + next.index);
}

function extractSectionById(html: string, id: string): string {
  const sectionRegex = new RegExp(`<section\\b[^>]*id=["']${id}["'][^>]*>`, "i");
  const match = sectionRegex.exec(html);
  if (!match || match.index === undefined) return "";

  const start = match.index;
  const afterOpeningTag = html.slice(start + match[0].length);
  const nextSection = /<section\b|<footer\b/i.exec(afterOpeningTag);
  if (!nextSection || nextSection.index === undefined) return html.slice(start);

  return html.slice(start, start + match[0].length + nextSection.index);
}

function collectImageCandidates(html: string): string[] {
  const candidates: string[] = [];
  const urlRegex = /https?:\/\/[^"')\s<>]+?\.(?:jpe?g|png|webp)(?:\?[^"')\s<>]*)?/gi;
  for (const match of html.matchAll(urlRegex)) {
    if (!isVideoAssetUrl(match[0])) candidates.push(match[0]);
  }

  const attrRegex = /<(?:a|img|source)\b[^>]+(href|src|data-src|data-large_image|srcset)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(attrRegex)) {
    const attribute = match[1].toLowerCase();
    const value = match[2];
    if (attribute === "srcset") {
      candidates.push(...value.split(",").map((part) => part.trim().split(/\s+/)[0]).filter((url) => !isVideoAssetUrl(url)));
    } else {
      if (!isVideoAssetUrl(value)) candidates.push(value);
    }
  }

  return candidates;
}

function extractAmericaAmbientImages(html: string, productUrl: string, maxImages: number): string[] {
  const product = extractAmericaProductData(html);
  if (!product) return [];
  return extractAmericaImagesFromGallery(product.galleryEnvironment, productUrl, maxImages);
}

function extractNeoboxAmbientImages(html: string, productUrl: string, maxImages: number): string[] {
  const section = extractSectionById(html, "sec-prod-details")
    || extractBetween(
      html,
      /<section\b[^>]*class=["'][^"']*\bsection--content\b[^"']*\bsection--gray\b[^"']*["'][^>]*>/i,
      /<section\b[^>]*class=["'][^"']*\bsection--black\b|<footer\b/i,
    );
  if (!section) return [];

  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of collectImageCandidates(section)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function extractAmbientImages(html: string, productUrl: string, maxImages: number): string[] {
  if (isAmericaUrl(productUrl)) {
    return extractAmericaAmbientImages(html, productUrl, maxImages);
  }
  if (isNeoboxUrl(productUrl)) {
    return extractNeoboxAmbientImages(html, productUrl, maxImages);
  }
  if (isTissotUrl(productUrl)) {
    return [];
  }
  if (isJhoviniUrl(productUrl)) {
    return [];
  }

  const section = isCenturyUrl(productUrl)
    ? extractSectionById(html, "gallery-ambientes-produto")
    : extractGenericAmbientSection(html);
  if (!section) return [];

  const imageCandidateHtml = isGreenhouseUrl(productUrl) ? stripVideoMarkup(section) : section;
  const seen = new Set<string>();
  const images: string[] = [];
  for (const candidate of collectImageCandidates(imageCandidateHtml)) {
    const normalized = normalizeImageUrl(candidate, productUrl);
    if (seen.has(normalized) || !looksLikeProductImage(normalized, productUrl)) continue;
    seen.add(normalized);
    images.push(normalized);
    if (images.length >= maxImages) break;
  }

  return images;
}

function formatMetricDimension(value: string, divisor: number): string {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return "";
  if (divisor > 1) return (number / divisor).toFixed(2);
  return number.toFixed(number % 1 === 0 ? 0 : 2);
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function deepDecodeUriComponent(value: string): string {
  let decoded = value;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = safeDecodeUriComponent(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function extractDimensionLabel(rawLabel: string, url: string): string {
  const source = safeDecodeUriComponent(`${rawLabel} ${url}`)
    .replace(/\.[a-z0-9]{2,5}(?:\?.*)?$/i, " ")
    .replace(/[_-]+/g, " ");
  const match = source.match(/(?:^|[^0-9])(\d{2,4}(?:[,.]\d+)?)\s*[xX]\s*(\d{2,4}(?:[,.]\d+)?)(?:\s*[xX]\s*(\d{2,4}(?:[,.]\d+)?))?(?=[^0-9]|$)/);
  if (!match) return "";

  const rawDimensions = [match[1], match[2], match[3]].filter((value): value is string => Boolean(value));
  const maxDimension = Math.max(...rawDimensions.map((value) => Number(value.replace(",", "."))));
  const divisor = maxDimension >= 1000 ? 1000 : maxDimension >= 20 ? 100 : 1;
  const dimensions = rawDimensions
    .filter((value): value is string => Boolean(value))
    .map((value) => formatMetricDimension(value, divisor))
    .filter(Boolean);
  return dimensions.length >= 2 ? dimensions.join("x") : "";
}

function extractCleanDownloadName(rawLabel: string, url: string): string {
  const label = cleanText(rawLabel).replace(/\.(?:skp|max|3ds|obj|fbx|rfa|rvt|3dm|dwg|dxf|pdf|zip|rar|7z)\s*$/i, "").trim();
  if (label && !/^(?:skp|max|dwg|pdf|zip|rar|7z)$/i.test(label)) return label;

  const filename = safeDecodeUriComponent(url.split("?")[0].split("/").pop() || "")
    .replace(/\.(?:skp|max|3ds|obj|fbx|rfa|rvt|3dm|dwg|dxf|pdf|zip|rar|7z)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!filename || /^[a-z0-9]{8,}$/i.test(filename)) return "";
  return filename;
}

function isFinishCatalogSignal(value: string): boolean {
  const key = normalizeKey(value);
  return /\bacabamentos?\b/.test(key)
    || /\bcatalogos?\s+(?:grupo\s+)?bell\s*arte\b/.test(key)
    || /\bcatalog(?:o|ue)?\s+de\s+acabamentos?\b/.test(key);
}

function inferDownloadLabel(rawLabel: string, url: string, type: DownloadType): string {
  const label = cleanText(rawLabel);
  if (isFinishCatalogSignal(label)) return "Acabamentos";
  if (type === "3d" && /drive\.google\.com\/drive\/folders/i.test(url) && /greenhousemoveis\.com\.br|blocos?\s*3d/i.test(label)) {
    const dimension = extractDimensionLabel(label, url);
    return dimension ? `Bloco 3D ${dimension}` : "Bloco 3D";
  }
  if (type === "3d" && /drive\.google\.com\/drive\/folders/i.test(url)) return "Bloco 3D";
  if (type === "3d" && isJhoviniUrl(url)) {
    const dimension = extractDimensionLabel(label, url);
    if (dimension) return `Bloco 3D ${dimension}`;
    const cleanName = extractCleanDownloadName(label, url);
    if (cleanName) return `Bloco 3D ${cleanName}`;
    return "Bloco 3D";
  }
  if (/3dwarehouse|sketchup/i.test(url)) return "SKP";
  if (/skp/i.test(label) || /skp/i.test(url)) return "SKP";
  if (/max/i.test(label) || /max/i.test(url)) return "MAX";
  if (/dwg/i.test(label) || /dwg/i.test(url)) return "DWG";
  if (/\.7z(\?|$)/i.test(url)) return "7Z";
  if (type === "tech_sheet") return "Ficha Técnica";
  if (type === "3d" && /3d\s*drawing|blocos?\s*3d|arquivos?\s*3d/i.test(label)) return "Bloco 3D";
  if (type === "2d") return "Bloco 2D";
  return label || "Bloco 3D";
}

function normalizeDownloadCandidate(rawUrl: string, productUrl: string): string | null {
  let cleaned = decodeHtml(rawUrl)
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .trim()
    .replace(/^['"(]+|['")]+$/g, "");

  const duplicateHttps = cleaned.indexOf("https://", cleaned.startsWith("https://") ? "https://".length : 0);
  const duplicateHttp = cleaned.indexOf("http://", cleaned.startsWith("http://") ? "http://".length : 0);
  const duplicateIndex = [duplicateHttps, duplicateHttp].filter((index) => index > 0).sort((a, b) => a - b)[0];
  if (duplicateIndex) cleaned = cleaned.slice(0, duplicateIndex);

  if (!cleaned || /^#|^javascript:|^mailto:|^tel:/i.test(cleaned)) return null;
  try {
    return absoluteUrl(cleaned, productUrl);
  } catch {
    return null;
  }
}

function decodeBase64(value: string): string {
  try {
    return atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return "";
  }
}

function extractAttribute(attrs: string, name: string): string {
  const match = new RegExp(`${name}=["']([^"']+)["']`, "i").exec(attrs);
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function extractCasocaAttachmentUrl(attrs: string): string | null {
  const rawConversion = extractAttribute(attrs, "data-conversion");
  if (!rawConversion) return null;

  try {
    const conversion = JSON.parse(decodeBase64(rawConversion)) as Record<string, unknown>;
    const encodedUrl = typeof conversion.ast === "string" ? conversion.ast : "";
    const decodedUrl = encodedUrl ? decodeBase64(encodedUrl) : "";
    return decodedUrl && /^https?:\/\//i.test(decodedUrl) ? decodedUrl : null;
  } catch {
    return null;
  }
}

function inferDownloadTypeFromText(haystack: string): DownloadType | null {
  if (isFinishCatalogSignal(haystack)) return "tech_sheet";
  if (/manual|manuais|instru[cÃ§][oÃµ]es|instrucoes/i.test(haystack)) return null;
  if (/drive\.google\.com\/file\/d\//i.test(haystack) && /ficha|t[eé]cnica|technical\s*sheet|spec\s*sheet|datasheet|data\s*sheet/i.test(haystack)) return "tech_sheet";
  if (/drive\.google\.com\/file\/d\//i.test(haystack) && /blocos?\s*3d|arquivos?\s*3d|\b3d\b|\bskp\b|\bobj\b|\bmax\b/i.test(haystack)) return "3d";
  if (/drive\.google\.com\/file\/d\//i.test(haystack) && /blocos?\s*2d|arquivos?\s*2d|\b2d\b|\bdwg\b|\bdxf\b|autocad|cad/i.test(haystack)) return "2d";
  if (/\.(skp|max|3ds|obj|fbx|rfa|rvt|3dm)(?:\?|$)|3dwarehouse|sketchup/i.test(haystack)) return "3d";
  if (/\.pdf(?:\?|$)|ficha|t[eÃ©]cnica|technical\s*sheet|spec\s*sheet|datasheet|data\s*sheet/i.test(haystack)) return "tech_sheet";
  if (/\.(dwg|dxf)(?:\?|$)|\bdwg\b|\bdxf\b|autocad/i.test(haystack)) return "2d";
  if (/\.(zip|rar|7z)(?:\?|$)/i.test(haystack) && /bloco\s*3d|download\s*3d|data-tipo=["']?bloco\s*3d|\b3d\b|skp|max/i.test(haystack)) return "3d";
  if (/\.(zip|rar|7z)(?:\?|$)/i.test(haystack) && /bloco\s*2d|download\s*2d|data-tipo=["']?bloco\s*2d|\b2d\b|cad/i.test(haystack)) return "2d";
  return null;
}

function isGreenhouseDownloadUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (isVideoAssetUrl(url)) return false;
  if (/drive\.google\.com\/(?:file\/d\/|drive\/folders\/|open\?|uc\?)/i.test(lower)) return true;
  if (/\.(pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?|$)/i.test(lower)) return true;
  if (/dropbox\.com|wetransfer\.com|we\.tl|onedrive\.live\.com|1drv\.ms/i.test(lower)) return true;
  return false;
}

function inferGreenhouseDownloadType(haystack: string, href: string): DownloadType | null {
  if (isVideoAssetUrl(href) || /\b(video|v[ií]deo|mp4|webm|mov|m3u8)\b/i.test(haystack)) return null;
  return inferDownloadTypeFromText(`${haystack} ${href}`)
    || (/\.pdf(?:\?|$)|ficha|t[eé]cnica|technical\s*sheet|spec\s*sheet|datasheet|data\s*sheet/i.test(`${haystack} ${href}`) ? "tech_sheet" : null)
    || (/\.dwg|\.dxf|\b2d\b|\bcad\b|autocad/i.test(`${haystack} ${href}`) ? "2d" : null)
    || "3d";
}

function downloadTypeFromFileExtension(url: string): DownloadType | null {
  const path = safeDecodeUriComponent(url.split(/[?#]/)[0] || "");
  if (/\.(dwg|dxf)$/i.test(path)) return "2d";
  if (/\.(skp|max|3ds|obj|fbx|rfa|rvt|3dm)$/i.test(path)) return "3d";
  if (/\.(zip|rar|7z)$/i.test(path)) return "3d";
  if (/\.pdf$/i.test(path)) return "tech_sheet";
  return null;
}

function hasDownloadFileExtension(url: string): boolean {
  return Boolean(downloadTypeFromFileExtension(url));
}

function inferFeelingDownloadType(haystack: string, href: string): DownloadType | null {
  const source = `${haystack} ${href}`;
  if (isVideoAssetUrl(href) || /\b(video|v[ií]deo|mp4|webm|mov|m3u8)\b/i.test(source)) return null;
  if (/garantia|certificado|manual/i.test(source)) return null;
  const typeFromExtension = downloadTypeFromFileExtension(href);
  if (typeFromExtension) return typeFromExtension;
  if (/\bvista\s*2d\b|\b2d\b|autocad|cad/i.test(source)) return "2d";
  if (/sketchup|\b3d\b/i.test(source)) return "3d";
  if (/ficha|t[eé]cnica|technical\s*sheet|spec\s*sheet|datasheet|data\s*sheet/i.test(source)) return "tech_sheet";
  return inferDownloadTypeFromText(source);
}

function inferNeoboxDownloadType(haystack: string, href: string): DownloadType | null {
  const source = `${haystack} ${href}`;
  if (isVideoAssetUrl(href) || /\b(video|video|mp4|webm|mov|m3u8)\b/i.test(source)) return null;
  const typeFromExtension = downloadTypeFromFileExtension(href);
  if (typeFromExtension) return typeFromExtension;
  if (/\b3d\s*drawing\b|blocos?\s*3d|arquivos?\s*3d|\b3d\b|sketchup|\bskp\b|\bmax\b/i.test(source)) return "3d";
  if (/\b2d\s*drawing\b|blocos?\s*2d|arquivos?\s*2d|\b2d\b|\bdwg\b|\bdxf\b|autocad|cad/i.test(source)) return "2d";
  if (/ficha|tecnica|technical\s*sheet|spec\s*sheet|datasheet|pdf/i.test(normalizeKey(source))) return "tech_sheet";
  return inferDownloadTypeFromText(source);
}

function inferPontoVirgulaDownloadType(haystack: string, href: string): DownloadType | null {
  const source = `${haystack} ${href}`;
  if (isVideoAssetUrl(href) || /\b(video|v[ií]deo|youtube|vimeo|mp4|webm|mov|m3u8)\b/i.test(source)) return null;
  const hrefPath = safeDecodeUriComponent(href.split(/[?#]/)[0] || "");
  if (/\.pdf$/i.test(hrefPath)) return "tech_sheet";
  if (/\.(dwg|dxf)$/i.test(hrefPath) || /\b(?:dwg|dxf|2d|cad)\b/i.test(hrefPath)) return "2d";
  if (/\.(skp|max|3ds|obj|fbx|rfa|rvt|3dm)$/i.test(hrefPath) || /\b(?:3d|skp|sketchup|max)\b/i.test(hrefPath)) return "3d";
  if (/blocos?\s*2d|data-tipo=["']?bloco\s*2d|\b2d\b|\bdwg\b|\bdxf\b|autocad|cad/i.test(source)) return "2d";
  if (/blocos?\s*3d|data-tipo=["']?bloco\s*3d|\b3d\b|\bskp\b|sketchup|\bmax\b/i.test(source)) return "3d";
  if (/ficha|t[eé]cnica|technical\s*sheet|spec\s*sheet|datasheet|\.pdf(?:\?|$)/i.test(source)) return "tech_sheet";
  return inferDownloadTypeFromText(source);
}

function extractDownloads(html: string, productUrl: string): ProductDownload[] {
  const downloads: ProductDownload[] = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const attrs = `${match[1]} ${match[3]}`;
    const casocaAttachmentUrl = isCasocaUrl(productUrl) ? extractCasocaAttachmentUrl(attrs) : null;
    const href = normalizeDownloadCandidate(casocaAttachmentUrl || match[2] || "", productUrl);
    if (!href) continue;
    if (/3dwarehouse\.sketchup\.com\/by\//i.test(href)) continue;

    const labelText = cleanText(match[4]);
    const anchorContext = cleanText(html.slice(Math.max(0, (match.index ?? 0) - 260), (match.index ?? 0) + 520));
    const casoca3dHint = casocaAttachmentUrl && /sketchup|blocos?\s*3d|download\s+bloco|data-aig=["']?sketchup/i.test(`${attrs} ${labelText} ${anchorContext}`)
      ? "download bloco sketchup 3d"
      : "";
    const haystack = `${attrs} ${labelText} ${anchorContext} ${href} ${casoca3dHint}`;
    const pontoVirgulaHaystack = `${attrs} ${labelText} ${href}`;
    if (/manual|manuais|instru[cç][oõ]es|instrucoes/i.test(haystack)) continue;

    if (isFeelingUrl(productUrl) && /garantia|certificado/i.test(haystack)) continue;

    const downloadType = (isDoimoUrl(productUrl) || isGreenhouseUrl(productUrl)) && /drive\.google\.com\/drive\/folders/i.test(href) && /arquivos?\s*3d|blocos?\s*3d|\b3d\b/i.test(haystack)
      ? "3d"
      : isFeelingUrl(productUrl)
      ? inferFeelingDownloadType(haystack, href)
      : isNeoboxUrl(productUrl)
      ? inferNeoboxDownloadType(haystack, href)
      : isPontoVirgulaUrl(productUrl)
      ? inferPontoVirgulaDownloadType(pontoVirgulaHaystack, href) || inferPontoVirgulaDownloadType(haystack, href)
      : inferDownloadTypeFromText(haystack);

    const hasDownloadFile = hasDownloadFileExtension(href);
    const isExternalModel = /3dwarehouse\.sketchup\.com/i.test(href);
    const isDoimoDriveFolder = isDoimoUrl(productUrl) && downloadType === "3d" && /drive\.google\.com\/drive\/folders/i.test(href);
    const isGreenhouseDriveFolder = isGreenhouseUrl(productUrl) && downloadType === "3d" && /drive\.google\.com\/drive\/folders/i.test(href);
    const isGreenhouseDriveFile = isGreenhouseUrl(productUrl) && /drive\.google\.com\/file\/d\//i.test(href) && (downloadType === "tech_sheet" || downloadType === "3d" || downloadType === "2d");
    const isCasocaGoogleDownload = isCasocaUrl(productUrl) && (downloadType === "3d" || downloadType === "tech_sheet") && /docs\.google\.com\/uc\?/i.test(href);
    const isNeoboxInternalDownload = isNeoboxUrl(productUrl) && /neoboxmoveis\.com\.br\/download\/\d+/i.test(href);
    if (!downloadType || (!hasDownloadFile && !(downloadType === "3d" && isExternalModel) && !isDoimoDriveFolder && !isGreenhouseDriveFolder && !isGreenhouseDriveFile && !isCasocaGoogleDownload && !isNeoboxInternalDownload)) continue;

    const labelSource = isGreenhouseUrl(productUrl)
      ? `${labelText} ${cleanText(html.slice(Math.max(0, (match.index ?? 0) - 120), match.index ?? 0))} greenhousemoveis.com.br blocos 3d`
      : `${labelText} ${anchorContext}`;
    const label = inferDownloadLabel(labelSource, href, downloadType);
    const key = `${downloadType}:${href}`;
    if (seen.has(key)) continue;
    seen.add(key);

    downloads.push({
      download_type: downloadType,
      label,
      url: href,
      display_order: downloads.length,
    });
  }

  if (isDoimoUrl(productUrl)) {
    const driveFolderRegex = /<a\b[^>]*href=["']([^"']*drive\.google\.com\/drive\/folders[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(driveFolderRegex)) {
      const href = normalizeDownloadCandidate(match[1] ?? "", productUrl);
      if (!href) continue;

      const context = cleanText(`${match[2] ?? ""} ${html.slice(Math.max(0, (match.index ?? 0) - 220), (match.index ?? 0) + 420)}`);
      if (!/arquivos?\s*3d|blocos?\s*3d|\b3d\b/i.test(context)) continue;

      const key = `3d:${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      downloads.push({
        download_type: "3d",
        label: inferDownloadLabel(context, href, "3d"),
        url: href,
        display_order: downloads.length,
      });
    }
  }

  if (isGreenhouseUrl(productUrl)) {
    const driveFolderRegex = /<a\b[^>]*href=["']([^"']*drive\.google\.com\/drive\/folders[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(driveFolderRegex)) {
      const href = normalizeDownloadCandidate(match[1] ?? "", productUrl);
      if (!href) continue;

      const context = cleanText(`${match[2] ?? ""} ${html.slice(Math.max(0, (match.index ?? 0) - 260), (match.index ?? 0) + 480)}`);
      if (!/blocos?\s*3d|arquivos?\s*3d|\b3d\b/i.test(context)) continue;

      const key = `3d:${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      downloads.push({
        download_type: "3d",
        label: inferDownloadLabel(`${cleanText(html.slice(Math.max(0, (match.index ?? 0) - 120), match.index ?? 0))} greenhousemoveis.com.br blocos 3d`, href, "3d"),
        url: href,
        display_order: downloads.length,
      });
    }

    const registerGreenhouseDownload = (rawHref: string, rawLabel: string, rawContext: string) => {
      const href = normalizeDownloadCandidate(rawHref, productUrl);
      if (!href || !isGreenhouseDownloadUrl(href)) return;

      const context = cleanText(`${rawLabel} ${rawContext} ${href}`);
      const downloadType = inferGreenhouseDownloadType(context, href);
      if (!downloadType) return;

      const key = `${downloadType}:${href}`;
      if (seen.has(key)) return;
      seen.add(key);

      downloads.push({
        download_type: downloadType,
        label: inferDownloadLabel(context, href, downloadType),
        url: href,
        display_order: downloads.length,
      });
    };

    const greenhouseAnchorRegex = /<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(greenhouseAnchorRegex)) {
      const context = html.slice(Math.max(0, (match.index ?? 0) - 360), (match.index ?? 0) + 720);
      registerGreenhouseDownload(match[2] ?? "", cleanText(match[4] ?? ""), `${match[1] ?? ""} ${match[3] ?? ""} ${context}`);
    }

    const markdownLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi;
    for (const match of html.matchAll(markdownLinkRegex)) {
      const context = html.slice(Math.max(0, (match.index ?? 0) - 360), (match.index ?? 0) + 720);
      registerGreenhouseDownload(match[2] ?? "", cleanText(match[1] ?? ""), context);
    }

    const rawGreenhouseUrlRegex = /https?:\/\/(?:drive\.google\.com|www\.dropbox\.com|dropbox\.com|wetransfer\.com|we\.tl|onedrive\.live\.com|1drv\.ms)[^\s"'<>)]*/gi;
    for (const match of html.matchAll(rawGreenhouseUrlRegex)) {
      const context = html.slice(Math.max(0, (match.index ?? 0) - 360), (match.index ?? 0) + 720);
      registerGreenhouseDownload(match[0] ?? "", "", context);
    }
  }

  if (isFeelingUrl(productUrl)) {
    const registerFeelingDownload = (rawHref: string, rawLabel: string, rawContext: string) => {
      const href = normalizeDownloadCandidate(rawHref, productUrl);
      if (!href || !hasDownloadFileExtension(href)) return;

      const context = cleanText(`${rawLabel} ${rawContext} ${href}`);
      if (/garantia|certificado|manual/i.test(context) || isVideoAssetUrl(href)) return;

      const downloadType = inferFeelingDownloadType(context, href);
      if (!downloadType) return;

      const key = `${downloadType}:${href}`;
      if (seen.has(key)) return;
      seen.add(key);

      downloads.push({
        download_type: downloadType,
        label: inferDownloadLabel(context, href, downloadType),
        url: href,
        display_order: downloads.length,
      });
    };

    const feelingMarkdownLinkRegex = /\[([^\]]*)\]\((https?:\/\/[^)\s]+?\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?[^)\s]*)?)\)/gi;
    for (const match of html.matchAll(feelingMarkdownLinkRegex)) {
      const context = html.slice(Math.max(0, (match.index ?? 0) - 260), (match.index ?? 0) + 520);
      registerFeelingDownload(match[2] ?? "", cleanText(match[1] ?? ""), context);
    }

    const feelingRawFileRegex = /https?:\/\/[^\s"'<>)]*?\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?[^\s"'<>)]*)?/gi;
    for (const match of html.matchAll(feelingRawFileRegex)) {
      const context = html.slice(Math.max(0, (match.index ?? 0) - 260), (match.index ?? 0) + 520);
      registerFeelingDownload(match[0] ?? "", "", context);
    }
  }

  const rawFileRegex = /((?:https?:)?\/\/[^\s"'<>]+\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?[^\s"'<>]*)?|\/[^\s"'<>]+\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?[^\s"'<>]*)?|[^\s"'<>]+\.(?:pdf|zip|dwg|dxf|skp|max|rar|7z|3ds|obj|fbx|rfa|rvt|3dm)(?:\?[^\s"'<>]*)?)/gi;
  for (const match of html.matchAll(rawFileRegex)) {
    const rawCandidate = match[1] ?? "";
    if (
      isJhoviniUrl(productUrl)
      && !/^(?:https?:)?\/\//i.test(rawCandidate)
      && !rawCandidate.startsWith("/")
      && !/^arquivos\/produtos\//i.test(rawCandidate)
    ) {
      continue;
    }

    const href = normalizeDownloadCandidate(rawCandidate, productUrl);
    if (!href || /3dwarehouse\.sketchup\.com\/by\//i.test(href)) continue;
    if (isFeelingUrl(productUrl) && /garantia|certificado|manual/i.test(href)) continue;

    const start = Math.max(0, (match.index ?? 0) - 180);
    const context = cleanText(html.slice(start, (match.index ?? 0) + 220));
    const downloadType = isFeelingUrl(productUrl)
      ? inferFeelingDownloadType(context, href)
      : isPontoVirgulaUrl(productUrl)
      ? inferPontoVirgulaDownloadType(context, href)
      : inferDownloadTypeFromText(`${context} ${href}`);
    if (!downloadType) continue;

    const label = inferDownloadLabel("", href, downloadType);
    const key = `${downloadType}:${href}`;
    if (seen.has(key)) continue;
    seen.add(key);

    downloads.push({
      download_type: downloadType,
      label,
      url: href,
      display_order: downloads.length,
    });
  }

  return downloads.sort((a, b) => {
    const rank = { tech_sheet: 0, "2d": 1, "3d": 2 } as const;
    return rank[a.download_type] - rank[b.download_type] || a.display_order - b.display_order;
  }).map((download, display_order) => ({ ...download, display_order }));
}

async function uploadExternalImage(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  productSlug: string,
  index: number,
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Falha ao baixar imagem ${imageUrl}`);

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";

  const path = `imports/century/${productSlug}/${String(index + 1).padStart(2, "0")}-${crypto.randomUUID()}.${extension}`;
  const blob = await response.blob();
  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
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

async function loadExistingCategoryNames(supabase: ReturnType<typeof createClient>): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("categories")
    .select("name");

  if (error) throw error;
  return new Map((data ?? []).map((category: { name: string }) => [normalizeKey(category.name), category.name]));
}

async function resolveSelectedCategoryName(
  supabase: ReturnType<typeof createClient>,
  categoryNames: Map<string, string>,
  categoryId: unknown,
  categoryName: unknown,
): Promise<string> {
  const requestedId = typeof categoryId === "string" ? categoryId.trim() : "";
  if (requestedId) {
    const { data, error } = await supabase
      .from("categories")
      .select("name")
      .eq("id", requestedId)
      .maybeSingle();
    if (error) throw error;
    if (data?.name) return data.name;
  }

  const requestedName = typeof categoryName === "string" ? cleanText(categoryName) : "";
  if (!requestedName) return "";
  const existing = categoryNames.get(normalizeKey(requestedName));
  if (existing) return existing;
  throw new Error(`Categoria selecionada nao cadastrada: ${requestedName}`);
}

function resolveExistingCategoryName(categoryNames: Map<string, string>, categoryName: string, productSignal = ""): string {
  const normalized = normalizeProductCategory(categoryName, productSignal);
  const existing = categoryNames.get(normalizeKey(normalized));
  if (existing) return existing;
  if (normalizeKey(normalized) === "cabeceiras") {
    const camas = categoryNames.get(normalizeKey("Camas"));
    if (camas) return camas;
  }

  throw new Error(`Categoria nao cadastrada: ${normalized}. O importador nao cria categorias novas.`);
}

async function ensureBrandCategory(
  supabase: ReturnType<typeof createClient>,
  brandId: string,
  categoryName: string,
) {
  const cleanCategoryName = cleanText(categoryName);
  if (!brandId || !cleanCategoryName) return;

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("name", cleanCategoryName)
    .maybeSingle();
  if (categoryError) throw categoryError;
  if (!category?.id) return;

  const { data: existing, error: existingError } = await supabase
    .from("brand_categories")
    .select("brand_id")
    .eq("brand_id", brandId)
    .eq("category_id", category.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { error: insertError } = await supabase
    .from("brand_categories")
    .insert({ brand_id: brandId, category_id: category.id });
  if (insertError) throw insertError;
}

async function upsertProduct(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  brandId: string,
  name: string,
  matchCategory = "",
): Promise<{ id: string; action: "created" | "updated" }> {
  const { data: existingProducts, error: listError } = await supabase
    .from("products")
    .select("id, name, category")
    .eq("brand_id", brandId);

  if (listError) throw listError;
  const normalizedMatchCategory = normalizeKey(matchCategory);
  const sameNameProducts = (existingProducts ?? [])
    .filter((product: { id: string; name: string; category?: string | null }) => normalizeProductNameForMatch(product.name) === normalizeProductNameForMatch(name));
  const existing = normalizedMatchCategory
    ? sameNameProducts.find((product: { id: string; name: string; category?: string | null }) => normalizeKey(product.category || "") === normalizedMatchCategory)
    : sameNameProducts[0];

  if (existing) {
    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id, action: "updated" };
  }

  const { data, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id, action: "created" };
}

async function replaceDownloads(
  supabase: ReturnType<typeof createClient>,
  productId: string,
  downloads: ProductDownload[],
) {
  const { error: deleteError } = await supabase
    .from("product_downloads")
    .delete()
    .eq("product_id", productId);

  if (deleteError) throw deleteError;
  if (!downloads.length) return;

  const rows = downloads.map((download) => ({ ...download, product_id: productId }));
  const { error: insertError } = await supabase.from("product_downloads").insert(rows);
  if (insertError) throw insertError;
}

async function loadClassificationEntities(supabase: ReturnType<typeof createClient>) {
  const [stylesRes, environmentsRes] = await Promise.all([
    supabase.from("design_style_tags").select("id, name"),
    supabase.from("environments").select("id, name"),
  ]);

  if (stylesRes.error) throw stylesRes.error;
  if (environmentsRes.error) throw environmentsRes.error;

  const styleTags = (stylesRes.data ?? []) as NamedEntity[];
  const environments = (environmentsRes.data ?? []) as NamedEntity[];
  const missingStyles = ["Org\u00e2nico", "Natural", "Sofisticado", "Robusto"]
    .filter((name) => !styleTags.some((style) => normalizeKey(style.name) === normalizeKey(name)));
  const missingEnvironments = [
    { name: "Gourmet", icon: "utensils-crossed" },
    { name: "Living", icon: "sofa" },
    { name: "Home TV", icon: "tv" },
  ].filter((environment) => !environments.some((existing) => normalizeKey(existing.name) === normalizeKey(environment.name)));

  if (missingStyles.length > 0) {
    const { data, error } = await supabase
      .from("design_style_tags")
      .upsert(missingStyles.map((name) => ({ name })), { onConflict: "name" })
      .select("id, name");
    if (error) throw error;
    styleTags.push(...((data ?? []) as NamedEntity[]));
  }

  if (missingEnvironments.length > 0) {
    const { data, error } = await supabase
      .from("environments")
      .insert(missingEnvironments)
      .select("id, name");
    if (error) throw error;
    environments.push(...((data ?? []) as NamedEntity[]));
  }

  return {
    styleTags,
    environments,
  };
}

function idsForExistingNames(names: string[], entities: NamedEntity[]): string[] {
  const entityByName = new Map(entities.map((entity) => [normalizeKey(entity.name), entity.id]));
  const ids: string[] = [];
  for (const name of names) {
    const id = entityByName.get(normalizeKey(name));
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function idsForExistingIds(ids: string[], entities: NamedEntity[], limit = 2): string[] {
  const existingIds = new Set(entities.map((entity) => entity.id));
  const resolved: string[] = [];
  for (const id of ids) {
    if (existingIds.has(id) && !resolved.includes(id)) resolved.push(id);
    if (resolved.length >= limit) break;
  }
  return resolved;
}

function namesForIds(ids: string[], entities: NamedEntity[]): string[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity.name]));
  return ids.map((id) => byId.get(id)).filter((name): name is string => Boolean(name));
}

function uniqueLimited(names: string[], limit = 2): string[] {
  const result: string[] = [];
  for (const name of names) {
    if (!name || result.some((existing) => normalizeKey(existing) === normalizeKey(name))) continue;
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

function inferEnvironmentNames(categoryName: string, name: string, description: string, signals: ComfortSignals): string[] {
  const haystack = normalizeKey(`${categoryName} ${name} ${description}`);
  const names: string[] = [];
  const add = (value: string) => {
    if (!names.some((existing) => normalizeKey(existing) === normalizeKey(value))) names.push(value);
  };

  if (signals.ambiente !== undefined && signals.ambiente <= 2) {
    add("Sala de Estar");
  }

  if (/\bbanqueta|banquetas|banco alto|balcao|bancada|bar|gourmet|cozinha americana\b/.test(haystack)) {
    add("Gourmet");
  }
  if (/\bcadeira|cadeiras|cadeira de jantar|cadeiras de jantar\b/.test(haystack)) {
    add("Sala de Jantar");
    add("Gourmet");
  }
  if (/\bpoltrona|poltronas|puff|pufe|chaise\b/.test(haystack)) {
    add("Living");
    add("Sala de Estar");
  }
  if (/\bsofa|sofas\b/.test(haystack)) {
    if (/\brobusto|tv|home|reclinavel|retratil|profundo|conforto prolongado\b/.test(haystack)) add("Home TV");
    if (/\borganico|curvo|moderno|living|social|gourmet\b/.test(haystack)) add("Living");
    add("Sala de Estar");
  }
  if (/\b(mesa de centro|mesas de centro|mesa lateral|mesas laterais|rack|estante)\b/.test(haystack)) {
    add("Sala de Estar");
  }
  if (/\b(mesa de jantar|mesas de jantar|cadeira de jantar|cadeiras de jantar|aparador de jantar|aparadores de jantar)\b/.test(haystack)) {
    add("Sala de Jantar");
  }
  if (/\b(cama|camas|cabeceira|cabeceiras|mesa de cabeceira|mesas de cabeceira|criado|criados|criado mudo|criados mudos)\b/.test(haystack)) {
    add("Quarto");
  }
  if (/\b(escrivaninha|escrivaninhas|mesa de trabalho|mesas de trabalho|escritorio|home office)\b/.test(haystack)) {
    add("Home Office");
  }

  return uniqueLimited(names);
}

function inferStyleNames(name: string, categoryName: string, description: string, styleTags: NamedEntity[]): string[] {
  const haystack = normalizeKey(`${name} ${categoryName} ${description}`);
  const inferred: string[] = [];

  for (const style of styleTags) {
    const styleKey = normalizeKey(style.name);
    if (styleKey && ` ${haystack} `.includes(` ${styleKey} `)) {
      inferred.push(style.name);
    }
  }

  if (/\borganico|organica|curvo|curva|arredondado|oval|fluido\b/.test(haystack)) inferred.push("Org\u00e2nico", "Contempor\u00e2neo");
  if (/\brobusto|volumoso|macio|acolhedor|profundo|confortavel\b/.test(haystack)) inferred.push("Robusto", "Sofisticado");
  if (/\bmoderno|minimalista|linha reta|linhas retas|geometrico|clean\b/.test(haystack)) inferred.push("Moderno", "Minimalista");
  if (/\bmadeira|natural|palha|fibra|couro|linho|artesanal\b/.test(haystack)) inferred.push("Natural", "R\u00fastico");
  if (/\bclassico|classica|capitone|capiton[eê]|moldura|ornamento\b/.test(haystack)) inferred.push("Cl\u00e1ssico");
  if (/\bmetal|aco|ferro|industrial\b/.test(haystack)) inferred.push("Industrial");

  const existingNames = new Set(styleTags.map((style) => normalizeKey(style.name)));
  return uniqueLimited(inferred.filter((style) => existingNames.has(normalizeKey(style))));
}

function namesMatchingOptions(names: string[] | undefined, options: string[], limit = 2): string[] {
  if (!Array.isArray(names)) return [];
  const byKey = new Map(options.map((name) => [normalizeKey(name), name]));
  const matched: string[] = [];
  for (const name of names) {
    const exact = byKey.get(normalizeKey(String(name || "")));
    if (exact && !matched.some((existing) => normalizeKey(existing) === normalizeKey(exact))) matched.push(exact);
    if (matched.length >= limit) break;
  }
  return matched;
}

function inferBrandNameFromUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (/americamoveis\.com(\.br)?$/i.test(host)) return "America Moveis";
  if (/(meucentury|centurybrazil)\.com$/i.test(host)) return "Century";
  if (/essenzamoveis\.com\.br$/i.test(host)) return "Essenza";
  if (/folioliving\.com\.br$/i.test(host)) return "Folio";
  if (/tissot\.com\.br$/i.test(host)) return "Tissot";
  if (/jhovini\.com\.br$/i.test(host)) return "Jhovini";
  if (/doimobrasil\.com\.br$/i.test(host)) return "Doimo";
  if (/casoca\.com\.br$/i.test(host) && /\/cgs(?:\.html|\/|$)/i.test(new URL(url).pathname)) return "CGS";
  if (/casoca\.com\.br$/i.test(host) && /\/grupo-bellarte(?:\.html|\/|$)/i.test(new URL(url).pathname)) return "Bell'Arte";
  if (/greenhousemoveis\.com\.br$/i.test(host)) return "Green House";
  if (/feelingestofados\.com\.br$/i.test(host)) return "Feeling";
  if (/neoboxmoveis\.com\.br$/i.test(host)) return "Neobox";
  if (/pontovirgula\.com$/i.test(host)) return "Ponto Vírgula";

  const first = host.split(".")[0] || "Marca";
  return first
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function replaceProductRelation(
  supabase: ReturnType<typeof createClient>,
  table: "product_style_tags" | "product_environments",
  column: "style_tag_id" | "environment_id",
  productId: string,
  ids: string[],
) {
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (ids.length === 0) return;

  const rows = ids.map((id) => ({ product_id: productId, [column]: id }));
  const { error: insertError } = await supabase.from(table).insert(rows);
  if (insertError) throw insertError;
}

Deno.serve(async (req) => {
  let stage = "iniciando";
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    stage = "validando admin";
    const auth = await requireAdmin(req);
    if ("response" in auth) return auth.response;
    const { data: rateLimit } = await auth.supabase.rpc("check_rate_limit", {
      _action: "admin:bulk-import-products:v3",
      _scope: auth.user.id,
      _max_hits: 80,
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

    stage = "lendo parametros";
    const {
      categoryUrl,
      maxImages = 8,
      brandName = "",
      brandSegment = "high",
      categoryId = "",
      categoryName: requestedCategoryName = "",
      environmentIds = [],
      environmentNames = [],
      startIndex = 0,
      limit = 6,
      productLinks: providedProductLinks = [],
    } = await req.json();
    if (!categoryUrl || typeof categoryUrl !== "string") {
      return new Response(JSON.stringify({ error: "categoryUrl e obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedUrl = new URL(categoryUrl);
    const resolvedBrandName = cleanText(String(brandName || "")) || inferBrandNameFromUrl(parsedUrl.toString());

    const cachedProductLinks: ProductLink[] = Array.isArray(providedProductLinks)
      ? providedProductLinks
        .map((link) => asRecord(link))
        .filter((link): link is Record<string, unknown> => Boolean(link) && typeof link.url === "string")
        .map((link) => ({
          url: String(link.url),
          nameFromCard: cleanImportedProductName(String(link.nameFromCard || "")) || titleCaseFromSlug(String(link.url)),
          imageFromCard: typeof link.imageFromCard === "string" ? link.imageFromCard : null,
        }))
        .filter((link) => {
          try {
            return new URL(link.url).hostname === parsedUrl.hostname;
          } catch {
            return false;
          }
        })
      : [];
    const hasCachedProductLinks = cachedProductLinks.length > 0;

    stage = hasCachedProductLinks ? "usando lista de produtos em cache" : "carregando pagina da categoria";
    const categoryPage = hasCachedProductLinks
      ? { html: "", markdown: "", metadata: {} }
      : await scrape(parsedUrl.toString());
    stage = "extraindo produtos da categoria";
    const isSingleProductImport = hasCachedProductLinks ? false : isLikelyProductPage(categoryPage.html, parsedUrl.toString());
    const categoryExtractionHtml = !hasCachedProductLinks && !isSingleProductImport && isNeoboxCategoryUrl(parsedUrl.toString())
      ? await loadNeoboxCategoryHtmlWithPagination(categoryPage.html, parsedUrl.toString())
      : categoryPage.html;
    const directProductName = isSingleProductImport
      ? extractFallbackProductName(categoryPage.html, categoryPage.metadata, parsedUrl.toString(), resolvedBrandName)
      : "";
    const rawCategoryName = hasCachedProductLinks
      ? extractCategoryTitle("", parsedUrl.toString())
      : isSingleProductImport
      ? inferCategoryFromProductName(directProductName, extractCategoryTitle(categoryPage.html, parsedUrl.toString()))
      : extractCategoryTitle(categoryExtractionHtml, parsedUrl.toString());
    const allProductLinks = (hasCachedProductLinks
      ? cachedProductLinks
      : isSingleProductImport
      ? [{ url: parsedUrl.toString(), nameFromCard: directProductName, imageFromCard: null }]
      : extractCategoryProductLinks(categoryExtractionHtml, parsedUrl.toString())).slice(0, 200);
    const safeStartIndex = Math.max(0, Number(startIndex) || 0);
    const requestedLimit = Math.min(12, Math.max(1, Number(limit) || 6));
    const safeLimit = isGreenhouseUrl(parsedUrl.toString()) || isFeelingUrl(parsedUrl.toString())
      ? 1
      : isNeoboxUrl(parsedUrl.toString())
      ? Math.min(2, requestedLimit)
      : isPontoVirgulaUrl(parsedUrl.toString())
      ? Math.min(1, requestedLimit)
      : requestedLimit;
    const productLinks = allProductLinks.slice(safeStartIndex, safeStartIndex + safeLimit);

    stage = "preparando marca e categoria";
    const brandId = await ensureBrand(auth.supabase, resolvedBrandName, brandSegment);
    const categoryNames = await loadExistingCategoryNames(auth.supabase);
    const selectedCategoryName = await resolveSelectedCategoryName(auth.supabase, categoryNames, categoryId, requestedCategoryName);
    const categoryName = selectedCategoryName || resolveExistingCategoryName(categoryNames, rawCategoryName, directProductName);
    const { styleTags, environments } = await loadClassificationEntities(auth.supabase);
    const selectedEnvironmentIds = idsForExistingIds(
      Array.isArray(environmentIds) ? environmentIds.map((id) => String(id)) : [],
      environments,
      2,
    );
    const selectedEnvironmentNamesFromIds = namesForIds(selectedEnvironmentIds, environments);
    const selectedEnvironmentNames = selectedEnvironmentNamesFromIds.length > 0
      ? selectedEnvironmentNamesFromIds
      : namesMatchingOptions(
      Array.isArray(environmentNames) ? environmentNames.map((name) => String(name)) : [],
      environments.map((environment) => environment.name),
      2,
    );

    const products: ImportedProductResult[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const productLink of productLinks) {
      stage = `importando produto ${productLink.nameFromCard || productLink.url}`;
      const productResult: ImportedProductResult = {
        name: productLink.nameFromCard,
        url: productLink.url,
        imageCount: 0,
        downloads: { techSheet: false, file2d: false, threeDCount: 0 },
        warnings: [],
      };

      try {
        const isGreenhouseProduct = isGreenhouseUrl(productLink.url);
        const isFeelingProduct = isFeelingUrl(productLink.url);
        const isPontoVirgulaProduct = isPontoVirgulaUrl(productLink.url);
        const useGreenhouseCardOnly = isGreenhouseProduct && !isSingleProductImport;
        const productPage = isGreenhouseProduct
          ? await scrapeGreenhouseProductDetails(productLink.url)
          : isFeelingProduct
          ? await scrapeFeelingProductDetails(productLink.url)
          : await scrape(productLink.url);
        const extractedProductName = extractFallbackProductName(productPage.html, productPage.metadata, productLink.url, resolvedBrandName);
        const name = cleanImportedProductName(isGreenhouseUrl(productLink.url)
          ? extractedProductName || productLink.nameFromCard
          : isPontoVirgulaProduct
          ? extractedProductName || productLink.nameFromCard
          : productLink.nameFromCard || extractedProductName);
        productResult.name = name;

        const description = useGreenhouseCardOnly
          ? extractProductDescription(productPage.html, productPage.metadata, name)
            || `${name} da Green House Moveis e uma peca de mobiliario outdoor indicada para projetos residenciais e corporativos.`
          : extractProductDescription(productPage.html, productPage.metadata, name);
        const rawProductCategoryName = isSingleProductImport
          ? extractCategoryTitle(productPage.html, productLink.url)
          : rawCategoryName;
        let productCategoryName = selectedCategoryName || resolveExistingCategoryName(categoryNames, rawProductCategoryName, `${name} ${description} ${productLink.url}`);
        await ensureBrandCategory(auth.supabase, brandId, productCategoryName);
        const imageSourceHtml = productPage.html;
        const comfortSignals = isGreenhouseProduct ? {} : extractComfortSignals(productPage.html);
        const requestedMaxImages = isGreenhouseUrl(productLink.url)
          ? Math.min(Number(maxImages) || 5, 5)
          : isFeelingUrl(productLink.url)
          ? Math.min(Number(maxImages) || 5, 5)
          : Number(maxImages) || 8;
        const mainImageLimit = isTissotUrl(productLink.url)
          ? Math.min(requestedMaxImages, TISSOT_IMAGE_LIMIT)
          : requestedMaxImages;
        const imageUrls = extractImages(imageSourceHtml, productLink.url, productLink.imageFromCard, mainImageLimit);
        const ambientImageLimit = isGreenhouseUrl(productLink.url) || isFeelingUrl(productLink.url) || isPontoVirgulaUrl(productLink.url) ? 1 : 3;
        const ambientImageUrls = extractAmbientImages(productPage.html, productLink.url, ambientImageLimit)
          .filter((imageUrl) => !imageUrls.includes(imageUrl));
        const downloads = extractDownloads(productPage.html, productLink.url);
        const techSheet = downloads.find((download) => download.download_type === "tech_sheet" && !isFinishCatalogSignal(download.label))?.url ?? null;
        const file2d = downloads.find((download) => download.download_type === "2d")?.url ?? null;
        const file3d = downloads.find((download) => download.download_type === "3d" && /skp/i.test(`${download.label} ${download.url}`))?.url
          ?? downloads.find((download) => download.download_type === "3d")?.url
          ?? null;
        const finishLink = isGreenhouseProduct ? extractGreenhouseFinishLink(productPage.html) : null;

        const productSlug = slugify(name);
        const allImageUrls = [...imageUrls, ...ambientImageUrls];
        let uploadedMainImages: string[] = [];
        let uploadedAmbientImagesLimited: string[] = [];
        if (isGreenhouseUrl(productLink.url) || isFeelingUrl(productLink.url) || isPontoVirgulaUrl(productLink.url)) {
          uploadedMainImages = imageUrls;
          uploadedAmbientImagesLimited = ambientImageUrls.slice(0, ambientImageLimit);
        } else {
          const uploadedByIndex: Array<string | null> = [];
          for (const [index, imageUrl] of allImageUrls.entries()) {
            try {
              uploadedByIndex.push(await uploadExternalImage(
                auth.supabase,
                imageUrl,
                index < imageUrls.length ? productSlug : `${productSlug}/ambientadas`,
                index < imageUrls.length ? index : index - imageUrls.length,
              ));
            } catch (error) {
              console.warn("image upload failed", imageUrl, error);
              uploadedByIndex.push(null);
            }
          }
          const uploadedAmbientImages = uploadedByIndex.slice(imageUrls.length).filter(Boolean) as string[];
          uploadedMainImages = uploadedByIndex.slice(0, imageUrls.length).filter(Boolean) as string[];
          uploadedAmbientImagesLimited = uploadedAmbientImages.slice(0, ambientImageLimit);
        }

        if (uploadedMainImages.length < Math.min(5, mainImageLimit)) productResult.warnings.push("menos_de_5_imagens");
        if (!file2d) productResult.warnings.push("sem_bloco_2d");
        if (!file3d) productResult.warnings.push("sem_bloco_3d");

        const productPayload: Record<string, unknown> = {
          name,
          brand_id: brandId,
          category: productCategoryName,
          description: description || null,
          images: uploadedMainImages,
          ambient_images: uploadedAmbientImagesLimited,
          file_2d: file2d,
          file_3d: file3d,
          tech_sheet: techSheet,
        };
        if (finishLink) productPayload.finish_link = finishLink;

        const upsert = await upsertProduct(auth.supabase, productPayload, brandId, name, isFeelingProduct ? productCategoryName : "");
        productResult.action = upsert.action;
        productResult.categoryName = productCategoryName;
        productResult.imageCount = uploadedMainImages.length;
        productResult.ambientImageCount = uploadedAmbientImagesLimited.length;
        productResult.downloads = {
          techSheet: Boolean(techSheet),
          file2d: Boolean(file2d),
          threeDCount: downloads.filter((download) => download.download_type === "3d").length,
        };
        if (upsert.action === "created") created += 1;
        else updated += 1;

        try {
          await replaceDownloads(auth.supabase, upsert.id, downloads);
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro desconhecido";
          console.warn("download relation update failed", upsert.id, message);
          productResult.warnings.push(`downloads_nao_salvos: ${message}`);
        }

        let inferredEnvironmentNames = selectedEnvironmentNames;
        if (inferredEnvironmentNames.length === 0) {
          inferredEnvironmentNames = inferEnvironmentNames(productCategoryName, name, description, comfortSignals);
        }
        const inferredStyleNames = inferStyleNames(name, productCategoryName, description, styleTags);
        const environmentIds = selectedEnvironmentIds.length > 0
          ? selectedEnvironmentIds
          : idsForExistingNames(inferredEnvironmentNames, environments);
        const styleIds = idsForExistingNames(
          inferredStyleNames,
          styleTags,
        );

        try {
          await Promise.all([
            replaceProductRelation(auth.supabase, "product_environments", "environment_id", upsert.id, environmentIds),
            replaceProductRelation(auth.supabase, "product_style_tags", "style_tag_id", upsert.id, styleIds),
          ]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "erro desconhecido";
          console.warn("classification relation update failed", upsert.id, message);
          productResult.warnings.push(`classificacao_nao_salva: ${message}`);
        }

        productResult.environmentCount = environmentIds.length;
        productResult.environmentNames = namesForIds(environmentIds, environments);
        productResult.styleCount = styleIds.length;
        if (environmentIds.length === 0) productResult.warnings.push("sem_ambiente");
        if (styleIds.length === 0) productResult.warnings.push("sem_estilo");
      } catch (error) {
        if (error instanceof SourceRateLimitError && isPontoVirgulaUrl(productLink.url)) {
          return new Response(JSON.stringify({
            success: true,
            category: categoryName,
            found: allProductLinks.length,
            batchFound: productLinks.length,
            startIndex: safeStartIndex,
            nextStartIndex: safeStartIndex,
            hasMore: safeStartIndex < allProductLinks.length,
            productLinks: allProductLinks,
            created,
            updated,
            failed,
            sourceRateLimited: true,
            retryAfterMs: error.retryAfterMs,
            message: `A Ponto Virgula bloqueou temporariamente a leitura do produto ${productLink.nameFromCard || productLink.url}. A importacao vai pausar e tentar o mesmo item novamente.`,
            productsWithoutFiveImages: products.filter((product) => product.warnings.includes("menos_de_5_imagens")).length,
            productsWithout2d: products.filter((product) => product.warnings.includes("sem_bloco_2d")).length,
            productsWithout3d: products.filter((product) => product.warnings.includes("sem_bloco_3d")).length,
            products,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        failed += 1;
        productResult.error = error instanceof Error ? error.message : "Erro desconhecido";
      }

      products.push(productResult);
    }

    return new Response(JSON.stringify({
      success: true,
      category: categoryName,
      found: allProductLinks.length,
      batchFound: productLinks.length,
      startIndex: safeStartIndex,
      nextStartIndex: safeStartIndex + productLinks.length,
      hasMore: safeStartIndex + productLinks.length < allProductLinks.length,
      productLinks: allProductLinks,
      created,
      updated,
      failed,
      productsWithoutFiveImages: products.filter((product) => product.warnings.includes("menos_de_5_imagens")).length,
      productsWithout2d: products.filter((product) => product.warnings.includes("sem_bloco_2d")).length,
      productsWithout3d: products.filter((product) => product.warnings.includes("sem_bloco_3d")).length,
      products,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("bulk-import-century-category error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: `${stage}: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
