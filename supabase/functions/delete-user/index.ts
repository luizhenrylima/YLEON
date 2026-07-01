import { enforceRateLimit, requireAdmin } from "../_shared/admin.ts";

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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAdmin(req, corsHeaders);
    if ("response" in auth) return auth.response;
    const limited = await enforceRateLimit(auth.supabase, req, auth.user.id, "admin:delete-user", 10, 600, 1800);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const userId = body.userId;
    if (!isUuid(userId)) return jsonResponse({ error: "Usuario invalido" }, 400);
    if (userId === auth.user.id) return jsonResponse({ error: "Nao e permitido excluir o proprio usuario logado" }, 400);

    const { data: targetRoles, error: rolesReadError } = await auth.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesReadError) throw rolesReadError;

    if ((targetRoles || []).some((role) => role.role === "admin")) {
      const { count, error: adminCountError } = await auth.supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (adminCountError) throw adminCountError;
      if ((count || 0) <= 1) return jsonResponse({ error: "Nao e permitido excluir o ultimo Admin do sistema" }, 400);
    }

    const { error: authDeleteError } = await auth.supabase.auth.admin.deleteUser(userId);
    if (authDeleteError && !/not found|does not exist/i.test(authDeleteError.message)) {
      throw authDeleteError;
    }

    const { error: roleDeleteError } = await auth.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (roleDeleteError) throw roleDeleteError;

    const { error: profileDeleteError } = await auth.supabase
      .from("profiles")
      .delete()
      .eq("user_id", userId);
    if (profileDeleteError) throw profileDeleteError;

    return jsonResponse({ success: true, deletedUserId: userId });
  } catch (error) {
    console.error("delete-user error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 500);
  }
});
