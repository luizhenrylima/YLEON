// Proxy de arquivos para contornar bloqueadores de conteúdo (ERR_BLOCKED_BY_CLIENT)
// Recebe ?url=<url-codificada> e devolve o conteúdo com headers próprios.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ALLOWED_HOSTS = new Set([
  'xdqujpcoknbyyimccphs.supabase.co',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing url param', { status: 400, headers: corsHeaders });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response('Invalid url', { status: 400, headers: corsHeaders });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: corsHeaders });
    }

    const upstream = await fetch(parsed.toString());
    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
        headers: corsHeaders,
      });
    }

    // Nome de arquivo amigável a partir do path
    const pathname = parsed.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1) || 'arquivo.pdf';
    const contentType = upstream.headers.get('content-type') || 'application/pdf';

    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(`Proxy error: ${(err as Error).message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
