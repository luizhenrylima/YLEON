import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function requireAdmin(req: Request, corsHeaders: Record<string, string>) {
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

export function requestIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

export async function enforceRateLimit(
  supabase: any,
  req: Request,
  userId: string,
  action: string,
  maxHits: number,
  windowSeconds: number,
  blockSeconds: number,
) {
  const ip = requestIp(req);
  const scope = `${userId}:${ip || "unknown"}`;
  const { data, error } = await supabase.rpc("check_rate_limit", {
    _action: action,
    _scope: scope,
    _max_hits: maxHits,
    _window_seconds: windowSeconds,
    _block_seconds: blockSeconds,
    _actor_user_id: userId,
    _ip_address: ip,
  });

  if (error) {
    console.error("rate-limit error:", error);
    return null;
  }

  if (data && data.allowed === false) {
    return new Response(JSON.stringify({
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      retry_after_seconds: data.retry_after_seconds || blockSeconds,
    }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}
