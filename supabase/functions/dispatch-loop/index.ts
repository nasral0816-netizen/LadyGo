import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("LADYGO_DISPATCH_SECRET") ?? "";
  const supplied = req.headers.get("x-ladygo-dispatch-secret") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (expected.length < 32 || !supabaseUrl || !serviceRoleKey) {
    return json({ error: "Dispatch service is not configured" }, 503);
  }
  if (!constantTimeEqual(expected, supplied)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: orders, error: listError } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "new")
      .is("driver_id", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (listError) throw listError;

    let attempted = 0;
    let offered = 0;
    const failures: string[] = [];

    for (const order of orders ?? []) {
      attempted++;
      const { data: driverId, error } = await supabase.rpc(
        "ladygo_dispatch_next_driver",
        { p_order_id: order.id },
      );
      if (error) {
        failures.push(order.id);
        console.error("Dispatch attempt failed", { orderId: order.id, code: error.code });
        continue;
      }
      if (driverId) offered++;
    }

    return json({
      ok: failures.length === 0,
      scanned: orders?.length ?? 0,
      attempted,
      offersCreated: offered,
      failedOrderIds: failures,
    }, failures.length ? 207 : 200);
  } catch (error) {
    console.error("Dispatch loop failed", error);
    return json({ error: "Dispatch loop failed" }, 500);
  }
});
