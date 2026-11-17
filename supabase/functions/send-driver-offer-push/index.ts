import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authorization = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authorization !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const offer = payload?.record ?? payload;
    if (!offer?.driver_id || !offer?.order_id || offer?.status !== "pending") {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL is missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const [{ data: tokens, error: tokenError }, { data: order, error: orderError }] =
      await Promise.all([
        supabase.from("driver_push_tokens")
          .select("expo_push_token, device_platform")
          .eq("driver_id", offer.driver_id),
        supabase.from("orders")
          .select("pickup_address, destination_address")
          .eq("id", offer.order_id)
          .maybeSingle(),
      ]);

    if (tokenError) throw tokenError;
    if (orderError) throw orderError;
    if (!tokens?.length || !order) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = tokens.map((token: { expo_push_token: string; device_platform: string }) => ({
      to: token.expo_push_token,
      title: "Новый заказ LadyGo",
      body: `Подача: ${order.pickup_address || "Адрес не указан"}`,
      sound: "default",
      priority: "high",
      channelId: "driver-orders",
      ttl: 25,
      data: { orderId: offer.order_id, offerId: offer.id },
    }));

    const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const result = await pushResponse.json();
    if (!pushResponse.ok) {
      return new Response(JSON.stringify({ error: result }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: messages.length, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
