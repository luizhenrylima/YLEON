import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function requestIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

async function enforceRateLimit(supabase: any, req: Request, userId: string) {
  const ip = requestIp(req);
  const { data, error } = await supabase.rpc("check_rate_limit", {
    _action: "admin:create-seller",
    _scope: `${userId}:${ip || "unknown"}`,
    _max_hits: 12,
    _window_seconds: 600,
    _block_seconds: 1800,
    _actor_user_id: userId,
    _ip_address: ip,
  });
  if (error) {
    console.error("rate-limit error:", error);
    return null;
  }
  if (data?.allowed === false) return jsonResponse({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, 429);
  return null;
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { response: jsonResponse({ error: "Supabase environment is not configured" }, 500) };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) {
    return { response: jsonResponse({ error: "Unauthorized" }, 401) };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: isAdmin, error: roleError } = await adminClient.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || !isAdmin) {
    return { response: jsonResponse({ error: "Admin only" }, 403) };
  }

  return { supabase: adminClient, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAdmin(req);
    if ("response" in auth) return auth.response;
    const limited = await enforceRateLimit(auth.supabase, req, auth.user.id);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const fullName = cleanText(body.fullName);
    const email = cleanText(body.email).toLowerCase();
    const password = String(body.password ?? "");

    if (!fullName) return jsonResponse({ error: "Nome do vendedor e obrigatorio" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: "Email invalido" }, 400);
    if (password.length < 6) return jsonResponse({ error: "A senha precisa ter pelo menos 6 caracteres" }, 400);

    const { data: createdUser, error: createError } = await auth.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError) return jsonResponse({ error: createError.message }, 400);

    const userId = createdUser.user?.id;
    if (!userId) return jsonResponse({ error: "Usuario nao foi criado" }, 500);

    const profilePayload = {
      user_id: userId,
      full_name: fullName,
      approved: true,
      seller_id: null,
    };

    const { data: profile, error: profileError } = await auth.supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" })
      .select("*")
      .single();
    if (profileError) throw profileError;

    const { data: role, error: roleError } = await auth.supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "vendedor" }, { onConflict: "user_id,role" })
      .select("*")
      .single();
    if (roleError) throw roleError;

    return jsonResponse({ success: true, profile, role });
  } catch (error) {
    console.error("create-seller error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
