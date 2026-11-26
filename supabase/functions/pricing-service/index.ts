import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const FREE = ["luggage_help","text_only","quiet_ride","wheelchair"];
const PAID:Record<string,number>={child_seat:45,pet:35,bulky_luggage:35};
const n=(v:unknown)=>Number.isFinite(Number(v))?Number(v):0;

// Try independent OSRM-compatible routing services in order. A failed provider
// must never produce an estimated/fabricated quote.
async function getDrivingRoute(routeCoords:string) {
  const providers = [
    { name: "osrm-primary", url: "https://router.project-osrm.org" },
    { name: "fossgis-fallback", url: "https://routing.openstreetmap.de/routed-car" }
  ];
  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const url = `${provider.url}/route/v1/driving/${routeCoords}?overview=false&steps=false`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const route = payload?.code === "Ok" ? payload?.routes?.[0] : null;
      const distance = Number(route?.distance);
      const duration = Number(route?.duration);
      if (!Number.isFinite(distance) || !Number.isFinite(duration)
        || distance <= 0 || distance > 1000000 || duration <= 0 || duration > 86400) {
        throw new Error("invalid route response");
      }
      return { distance, duration, estimated: false };
    } catch (error) {
      console.warn("pricing route provider failed:", provider.name,
        error instanceof Error ? error.message : "unknown error");
    } finally {
      clearTimeout(timeout);
    }
  }

  // Offline-friendly fallback: estimate road distance from the straight-line
  // distance. This is explicitly marked as approximate in the returned quote.
  const coordinates = routeCoords.split(";").map((pair) => pair.split(",").map(Number));
  if (coordinates.length < 2 || coordinates.some((point) =>
    point.length !== 2 || !point.every(Number.isFinite)
    || Math.abs(point[1]) > 90 || Math.abs(point[0]) > 180)) {
    throw new Error("Не удалось определить координаты маршрута.");
  }
  const toRad = (value: number) => value * Math.PI / 180;
  // Sum every leg so intermediate stops are not lost in fallback mode.
  const straightKm = coordinates.slice(1).reduce((sum, point, index) => {
    const previous = coordinates[index];
    const dLat = toRad(point[1] - previous[1]);
    const dLon = toRad(point[0] - previous[0]);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(previous[1])) * Math.cos(toRad(point[1])) * Math.sin(dLon / 2) ** 2;
    return sum + 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }, 0);
  if (!Number.isFinite(straightKm) || straightKm <= 0 || straightKm > 500) {
    throw new Error("Не удалось оценить расстояние маршрута.");
  }
  const estimatedRoadKm = straightKm * 1.35;
  const estimatedSeconds = Math.max(60, estimatedRoadKm / 35 * 3600);
  return { distance: estimatedRoadKm * 1000, duration: estimatedSeconds, estimated: true };
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Требуется авторизация."},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const {data:who,error:authErr}=await userClient.auth.getUser();
 if(authErr||!who.user)return json({error:"Сессия недействительна."},401);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(),requestedCity=String(body.city_id||"russia_default"),tariffId=String(body.tariff_id||"economy"),action=String(body.action||"quote");
  if(action==="create_order"){
    let quoteId=String(body.price_token??"");
    const pickup={latitude:Number(body.pickup_lat),longitude:Number(body.pickup_lng)};
    const destination={latitude:Number(body.destination_lat),longitude:Number(body.destination_lng)};
    const pickupAddress=String(body.pickup_address??"").trim();
    const destinationAddress=String(body.destination_address??"").trim();
    const paymentMethod=body.payment_method==="transfer_to_driver"?"transfer_to_driver":"cash";
    const validPoint=(p:any)=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=-90&&p.latitude<=90&&p.longitude>=-180&&p.longitude<=180;
    const {data:profile,error:profileError}=await db.from("profiles").select("role").eq("id",who.user.id).maybeSingle();
    if(profileError)throw profileError;
    if(profile?.role!=="passenger" && profile?.role!=="driver" && profile?.role!=="admin")return json({error:"Этот аккаунт не может создавать поездки."},403);
    // A driver may also place an order as a passenger. Keep the profile role
    // unchanged; driver-only approval is required for accepting rides, not booking one.
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quoteId))return json({error:"Некорректная фиксация цены."},400);
    if(!validPoint(pickup)||!validPoint(destination)||pickupAddress.length<2||destinationAddress.length<2)return json({error:"Укажи корректные адреса и точки маршрута."},400);
    const {data:existing,error:existingError}=await userClient.from("orders").select("*").eq("passenger_id",who.user.id).in("status",["new","accepted","arrived","in_progress"]).maybeSingle();
    if(existingError)throw existingError;
    if(existing)return json({order:existing});
    let {data:quote,error:quoteError}=await userClient.from("price_quotes")
      .select("id,city_id,tariff_id,route_km,route_min,amount_rub,breakdown,expires_at,consumed_at,pickup_lat,pickup_lng,destination_lat,destination_lng")
      .eq("id",quoteId).eq("passenger_id",who.user.id).maybeSingle();
    if(quoteError)throw quoteError;
    if(!quote)return json({error:"Расчёт цены не найден. Построй маршрут заново."},409);

    // If the passenger cancelled the order created from this quote and taps
    // Order again, issue a fresh 4-minute token for the exact same validated
    // route/amount. This prevents a consumed quote from masquerading as a
    // network failure. Only the quote owner can renew it, and only shortly
    // after cancelling the corresponding order.
    if(quote.consumed_at || new Date(quote.expires_at).getTime()<=Date.now()){
      const {data:cancelledOrder,error:cancelledOrderError}=await db.from("orders")
        .select("id,cancelled_at,status")
        .eq("passenger_id",who.user.id)
        .eq("price_quote_id",quoteId)
        .eq("status","cancelled")
        .order("cancelled_at",{ascending:false})
        .limit(1)
        .maybeSingle();
      if(cancelledOrderError)throw cancelledOrderError;
      const cancelledAt=cancelledOrder?.cancelled_at ? new Date(cancelledOrder.cancelled_at).getTime() : 0;
      if(!cancelledOrder || !cancelledAt || Date.now()-cancelledAt>30*60*1000){
        return json({error:"Price quote expired or already used. Recalculate the route and try again."},409);
      }
      const {data:renewedQuote,error:renewError}=await db.from("price_quotes").insert({
        passenger_id:who.user.id,
        city_id:quote.city_id,
        tariff_id:quote.tariff_id,
        route_km:quote.route_km,
        route_min:quote.route_min,
        amount_rub:quote.amount_rub,
        pickup_lat:quote.pickup_lat,
        pickup_lng:quote.pickup_lng,
        destination_lat:quote.destination_lat,
        destination_lng:quote.destination_lng,
        breakdown:quote.breakdown,
        expires_at:new Date(Date.now()+240000).toISOString()
      }).select("id,city_id,tariff_id,route_km,route_min,amount_rub,breakdown,expires_at,consumed_at,pickup_lat,pickup_lng,destination_lat,destination_lng").single();
      if(renewError)throw renewError;
      quote=renewedQuote;
      quoteId=renewedQuote.id;
    }
    const routeMatchesQuote = quote.pickup_lat != null && quote.pickup_lng != null
      && quote.destination_lat != null && quote.destination_lng != null
      && Math.abs(Number(quote.pickup_lat)-pickup.latitude)<=0.00001
      && Math.abs(Number(quote.pickup_lng)-pickup.longitude)<=0.00001
      && Math.abs(Number(quote.destination_lat)-destination.latitude)<=0.00001
      && Math.abs(Number(quote.destination_lng)-destination.longitude)<=0.00001;
    if(!routeMatchesQuote)return json({error:"Маршрут изменился после расчёта цены. Построй маршрут заново."},409);
    const orderPayload={
      passenger_id:who.user.id,
      driver_id:null,
      pickup_address:pickupAddress,
      destination_address:destinationAddress,
      pickup_lat:pickup.latitude,
      pickup_lng:pickup.longitude,
      destination_lat:destination.latitude,
      destination_lng:destination.longitude,
      tariff_id:quote.tariff_id,
      estimated_price_rub:Number(quote.amount_rub),
      payment_method:paymentMethod,
      service_type:quote.tariff_id==="comfort_plus"?"courier":"ride",
      price_quote_id:quote.id,
      status:"new"
    };
    // Keep auth.uid() available to the quote-validation trigger. The SECURITY DEFINER
    // RPC performs strict ownership/role/route checks and inserts atomically without broadening RLS.
    const {data:order,error:insertError}=await userClient.rpc("ladygo_create_order_from_quote",{
      p_pickup_address:pickupAddress,
      p_destination_address:destinationAddress,
      p_pickup_lat:pickup.latitude,
      p_pickup_lng:pickup.longitude,
      p_destination_lat:destination.latitude,
      p_destination_lng:destination.longitude,
      p_payment_method:paymentMethod,
      p_price_quote_id:quote.id
    });
    if(insertError){
      if(/orders_one_active_per_passenger|duplicate key|unique constraint/i.test(insertError.message??"")){
        const {data:active,error:activeError}=await userClient.from("orders").select("*").eq("passenger_id",who.user.id).in("status",["new","accepted","arrived","in_progress"]).maybeSingle();
        if(activeError)throw activeError;
        if(active)return json({order:active});
      }
      throw insertError;
    }
    return json({order});
  }
  if(!["economy","comfort","comfort_plus"].includes(tariffId))return json({error:"Неизвестный тариф."},400);
  // Prefer a city-specific tariff when supplied; otherwise use the nationwide
  // baseline. This lets every Russian region accept quotes before local tariffs
  // are individually configured, without silently borrowing another city's rates.
  let pricingCity=requestedCity;
  let {data:t,error:te}=await db.from("city_tariff_configs").select("*").eq("city_id",pricingCity).eq("tariff_id",tariffId).eq("active",true).maybeSingle();
  if(te)throw te;
  if(!t && pricingCity!=="russia_default"){
    pricingCity="russia_default";
    const fallback=await db.from("city_tariff_configs").select("*").eq("city_id",pricingCity).eq("tariff_id",tariffId).eq("active",true).maybeSingle();
    if(fallback.error)throw fallback.error;
    t=fallback.data;
  }
  if(!t)return json({error:"Тариф пока не настроен для этого региона."},404);
  const isNationalDefault=pricingCity==="russia_default";
  const points=Array.isArray(body.points)?body.points:[];
  if(points.length<2||!points.every((p:any)=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))))return json({error:"Сначала построй маршрут на карте."},400);
  const routeCoords=points.map((p:any)=>`${n(p.longitude)},${n(p.latitude)}`).join(";");
  const route=await getDrivingRoute(routeCoords);
  const routeKm=route.distance/1000,routeMin=route.duration/60,start=points[0],end=points[points.length-1];
  // Avoid city-specific coordinate polygons. Until a proper city-boundary dataset
  // is configured, apply the intercity rate band to long routes (>35 km).
  const outside=routeKm>35;
  const perKm=outside?n(t.out_per_km_rub):n(t.city_per_km_rub),perMin=outside?n(t.out_per_min_rub):n(t.city_per_min_rub);
  const billableKm=Math.max(0,routeKm-n(t.included_km)),billableMin=Math.max(0,routeMin-n(t.included_min));
  const routeCost=n(t.min_price_rub)+billableKm*perKm+billableMin*perMin;
  const baseFareRub=60;
  const pickupKm=0,pickupMin=0,pickupCost=0;
  const opts=Array.isArray(body.options)?body.options.filter((x:string)=>FREE.includes(x)||Object.hasOwn(PAID,x)):[];
  const optionsCost=opts.reduce((sum:number,x:string)=>sum+(PAID[x]||0),0);

  // Moscow time is used consistently for KМВ tariff windows.
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23", weekday: "short"
  }).formatToParts(new Date());
  const localHour = Number(localParts.find(x=>x.type==="hour")?.value ?? 12);
  const localWeekday = localParts.find(x=>x.type==="weekday")?.value ?? "Mon";
  const nightMultiplier = localHour >= 22 || localHour < 6 ? n(t.night_multiplier) || 1 : 1;
  const peakMultiplier = (localHour >= 7 && localHour < 10) || (localHour >= 17 && localHour < 20) ? n(t.peak_multiplier) || 1 : 1;
  const weekendMultiplier = localWeekday === "Sat" || localWeekday === "Sun" ? n(t.weekend_multiplier) || 1 : 1;

  // Count fresh online drivers within 10 km of pickup. Frozen or occupied
  // drivers are excluded so the scarcity coefficient reflects dispatch capacity.
  const [presenceResult, locationsResult, frozenResult, activeOrdersResult] = await Promise.all([
    db.from("driver_presence").select("driver_id").eq("is_online", true).gte("updated_at", new Date(Date.now()-90000).toISOString()),
    db.from("driver_locations").select("driver_id,latitude,longitude,updated_at").gte("updated_at", new Date(Date.now()-90000).toISOString()),
    db.from("driver_freezes").select("driver_id").is("lifted_at", null).gt("expires_at", new Date().toISOString()),
    db.from("orders").select("driver_id").in("status", ["accepted","arrived","in_progress"]).not("driver_id","is",null)
  ]);
  if (presenceResult.error) throw presenceResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (frozenResult.error) throw frozenResult.error;
  if (activeOrdersResult.error) throw activeOrdersResult.error;
  const toRad = (v:number) => v*Math.PI/180;
  const distanceKm = (a:any,b:any) => {
    const dLat=toRad(Number(b.latitude)-Number(a.latitude)),dLon=toRad(Number(b.longitude)-Number(a.longitude));
    const h=Math.sin(dLat/2)**2+Math.cos(toRad(Number(a.latitude)))*Math.cos(toRad(Number(b.latitude)))*Math.sin(dLon/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  };
  const onlineIds = new Set((presenceResult.data||[]).map((x:any)=>x.driver_id));
  const frozenIds = new Set((frozenResult.data||[]).map((x:any)=>x.driver_id));
  const busyIds = new Set((activeOrdersResult.data||[]).map((x:any)=>x.driver_id));
  const availableDrivers = (locationsResult.data||[]).filter((x:any)=>
    onlineIds.has(x.driver_id) && !frozenIds.has(x.driver_id) && !busyIds.has(x.driver_id)
    && distanceKm(start,x)<=10
  ).length;
  const surgeThreshold = Math.max(0, Math.floor(n(t.surge_driver_threshold)));
  const surge = surgeThreshold > 0 && availableDrivers < surgeThreshold ? Math.max(1,n(t.surge_multiplier)) : 1;
  const surgeReason = surge > 1 ? `Мало свободных водителей рядом: ${availableDrivers}` : "Достаточно свободных водителей";
  const tariffSurcharge = tariffId === "comfort" ? n(t.child_surcharge_rub)
    : tariffId === "comfort_plus" ? n(t.delivery_surcharge_rub) : 0;
  const timeMultiplier = nightMultiplier * peakMultiplier * weekendMultiplier;
  const demandMultiplier = surge;
  let waitMinutes=0;
  let waitOrder:any=null;
  if(action==="recalculate_wait"){
    const {data:order,error:orderError}=await db.from("orders").select("*").eq("id",String(body.order_id||"")).maybeSingle();
    if(orderError||!order||order.driver_id!==who.user.id||order.status!=="arrived"||!order.arrived_at) return json({error:"Пересчёт ожидания доступен назначенному водителю после прибытия."},403);
    waitOrder=order;
    waitMinutes=Math.max(0,(Date.now()-new Date(order.arrived_at).getTime())/60000);
  }
  const waitCost=Math.max(0,waitMinutes-n(t.free_wait_min))*n(t.wait_per_min_rub);
  const tolls=0,discount=0;
  const subtotal=baseFareRub+routeCost+optionsCost+tariffSurcharge+tolls+waitCost-discount;
  const total=Math.round(Math.max(n(t.min_price_rub)*0.7,subtotal*timeMultiplier*demandMultiplier));
  const breakdown={tariff:t.name,city_id:pricingCity,pricing_scope:isNationalDefault?"russia_national_default":"city_specific",route_km:+routeKm.toFixed(2),route_min:Math.round(routeMin),route_estimated:route.estimated===true,included_km:n(t.included_km),included_min:n(t.included_min),billable_km:+billableKm.toFixed(2),billable_min:+billableMin.toFixed(2),min_price:n(t.min_price_rub),base_fare:baseFareRub,route_cost:+routeCost.toFixed(2),pickup_km:+pickupKm.toFixed(2),pickup_min:Math.round(pickupMin),pickup_cost:+pickupCost.toFixed(2),available_drivers_nearby:availableDrivers,surge_multiplier:surge,surge_reason:surgeReason,night_multiplier:nightMultiplier,peak_multiplier:peakMultiplier,weekend_multiplier:weekendMultiplier,time_multiplier:+timeMultiplier.toFixed(3),tariff_surcharge:+tariffSurcharge.toFixed(2),tariff_surcharge_reason:tariffId==="comfort"?"Детский тариф":tariffId==="comfort_plus"?"Доставка":"Без надбавки",options:opts,options_cost:optionsCost,tolls,discount,free_wait_min:n(t.free_wait_min),wait_minutes:waitMinutes,wait_cost:waitCost,subtotal:+subtotal.toFixed(2),total,currency:"RUB"};
  const {data:q,error:qe}=await db.from("price_quotes").insert({passenger_id:waitOrder?.passenger_id||who.user.id,city_id:pricingCity,tariff_id:tariffId,route_km:routeKm,route_min:routeMin,amount_rub:total,pickup_lat:n(start.latitude),pickup_lng:n(start.longitude),destination_lat:n(end.latitude),destination_lng:n(end.longitude),breakdown,expires_at:new Date(Date.now()+240000).toISOString()}).select("id,amount_rub,expires_at,breakdown").single();
  if(qe)throw qe;
  if(waitOrder){
    const {error:updateError}=await db.from("orders").update({price_rub:total,estimated_price_rub:total,price_quote_id:q.id,pricing_breakdown:breakdown}).eq("id",waitOrder.id).eq("driver_id",who.user.id);
    if(updateError)throw updateError;
    const {error:consumeError}=await db.from("price_quotes").update({consumed_at:new Date().toISOString()}).eq("id",q.id);
    if(consumeError)throw consumeError;
  }
  return json({price_token:q.id,amount_rub:q.amount_rub,expires_at:q.expires_at,breakdown,route_estimated:route.estimated===true});
 }catch(e){console.error("pricing-service",e);return json({error:e instanceof Error?e.message:"Ошибка расчёта цены."},400);}
});
