import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!supabaseUrl || !anonKey) return json({ error: "Payment service is not configured" }, 503);
  if (!jwt) return json({ error: "Authentication required" }, 401);

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + jwt } },
  });
  const { data, error } = await auth.auth.getUser(jwt);
  if (error || !data.user) return json({ error: "Invalid session" }, 401);

  // Deliberate fail-closed stub: no provider, no payment intent, no charge,
  // no collection of card data. Replace only after provider/legal/security review.
  return json({
    status: "not_configured",
    code: "PAYMENT_PROVIDER_NOT_CONFIGURED",
    message: "Оплата в приложении пока не подключена. Списание средств не выполнялось.",
  }, 501);
});
