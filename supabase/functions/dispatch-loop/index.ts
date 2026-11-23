Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const expectedSecret = Deno.env.get("LADYGO_DISPATCH_SECRET") ?? "";
  const receivedSecret = req.headers.get("x-ladygo-dispatch-secret") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!expectedSecret || !supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Dispatch loop is not configured" }, { status: 503 });
  }
  if (receivedSecret.length < 32 || receivedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date().toISOString();
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id")
      .eq("status", "new")
      .is("driver_id", null)
      .or("scheduled_at.is.null,scheduled_at.lte." + now)
      .order("created_at", { ascending: true })
      .limit(100);
    if (ordersError) throw ordersError;

    let offered = 0;
    let waiting = 0;
    let errors = 0;
    for (const order of orders ?? []) {
      const { data: driverId, error } = await supabase.rpc(
        "ladygo_dispatch_next_driver",
        { p_order_id: order.id },
      );
      if (error) {
        errors++;
        console.error("Dispatch attempt failed", { orderId: order.id, message: error.message });
      } else if (driverId) {
        offered++;
      } else {
        waiting++;
      }
    }

    return Response.json({
      scanned: orders?.length ?? 0,
      offered,
      waiting,
      errors,
      executed_at: now,
    });
  } catch (error) {
    console.error("Dispatch loop failed", error);
    return Response.json({ error: "Dispatch loop failed" }, { status: 500 });
  }
});
