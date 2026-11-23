import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const unb64=(s:string)=>{const n=s.replace(/-/g,"+").replace(/_/g,"/");const v=atob(n+"=".repeat((4-n.length%4)%4));return Uint8Array.from(v,c=>c.charCodeAt(0));};
const toHex=(b:Uint8Array)=>Array.from(b).map(v=>v.toString(16).padStart(2,"0")).join("");
const distanceKm=(a:any,b:any)=>{const r=(v:number)=>v*Math.PI/180;const dl=r(b.latitude-a.latitude),dn=r(b.longitude-a.longitude);const h=Math.sin(dl/2)**2+Math.cos(r(a.latitude))*Math.cos(r(b.latitude))*Math.sin(dn/2)**2;return 6371.0088*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));};
const validPoint=(p:any)=>p&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&Number(p.latitude)>=-90&&Number(p.latitude)<=90&&Number(p.longitude)>=-180&&Number(p.longitude)<=180;
const sign=async(payload:Record<string,unknown>,secret:string)=>{const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const body=b64(enc.encode(JSON.stringify(payload)));const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(body)));return body+"."+b64(sig);};
const verify=async(token:string,secret:string)=>{const parts=token.split(".");if(parts.length!==2)throw new Error("Bad token");const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);if(!await crypto.subtle.verify("HMAC",key,unb64(parts[1]),enc.encode(parts[0])))throw new Error("Bad signature");const claims=JSON.parse(new TextDecoder().decode(unb64(parts[0])));if(!claims.exp||claims.exp<=Math.floor(Date.now()/1000))throw new Error("Expired");return claims;};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL")??"",anon=Deno.env.get("SUPABASE_ANON_KEY")??"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"",secret=Deno.env.get("LADYGO_PRICING_SECRET")??"";
  if(!url||!anon||!service||secret.length<32)return reply({error:"Pricing service is not configured"},503);
  const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(!jwt)return reply({error:"Authentication required"},401);
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+jwt}}});
  const {data:userData,error:userError}=await auth.auth.getUser(jwt);if(userError||!userData.user)return reply({error:"Invalid session"},401);
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const body=await req.json();if(JSON.stringify(body).length>16000)return reply({error:"Request too large"},413);
    const {data:profile,error:profileError}=await admin.from("profiles").select("role").eq("id",userData.user.id).maybeSingle();
    if(profileError)throw profileError;if(!profile||profile.role!=="passenger")return reply({error:"Passenger account required"},403);
    if(body.action==="quote"){
      const points=body.points;if(!Array.isArray(points)||points.length!==2||!validPoint(points[0])||!validPoint(points[1]))return reply({error:"Two valid route coordinates are required"},400);
      const tariff=String(body.tariff_id??"");
      const {data:rate,error:rateError}=await admin.from("tariff_rates").select("tariff_id,base_fare_rub,per_km_rub,per_minute_rub,minimum_fare_rub,is_active").eq("tariff_id",tariff).maybeSingle();
      if(rateError)throw rateError;if(!rate||!rate.is_active||Number(rate.per_km_rub)<=0)return reply({error:"Тариф пока не настроен администратором"},409);
      // Preliminary geodesic estimate only; not represented as a road-route distance.
      const km=Math.max(.1,Math.round(distanceKm(points[0],points[1])*1.3*1000)/1000);
      const minutes=Math.max(1,Math.ceil(km/30*60+5));
      const base=Number(rate.base_fare_rub),perKm=Number(rate.per_km_rub),perMinute=Number(rate.per_minute_rub),minimum=Number(rate.minimum_fare_rub);
      const amount=Math.round(Math.max(minimum,base+km*perKm+minutes*perMinute)*100)/100;
      if(![base,perKm,perMinute,minimum,amount].every(Number.isFinite)||amount<=0)return reply({error:"Некорректные тарифные параметры"},409);
      const id=crypto.randomUUID(),exp=Math.floor(Date.now()/1000)+90;
      const token=await sign({quote_id:id,sub:userData.user.id,tariff_id:tariff,pickup:points[0],destination:points[1],amount,distance_km:km,duration_min:minutes,exp},secret);
      const hash=toHex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(token))));
      const {error:insertError}=await admin.from("ladygo_price_quotes").insert({id,passenger_id:userData.user.id,token_hash:hash,tariff_id:tariff,pickup_lat:Number(points[0].latitude),pickup_lng:Number(points[0].longitude),destination_lat:Number(points[1].latitude),destination_lng:Number(points[1].longitude),estimated_distance_km:km,estimated_duration_min:minutes,estimated_price_rub:amount,base_fare_rub:base,per_km_rub:perKm,per_minute_rub:perMinute,minimum_fare_rub:minimum,expires_at:new Date(exp*1000).toISOString()});
      if(insertError)throw insertError;
      return reply({price_token:token,amount_rub:amount,price_rub:amount,distance_km:km,duration_min:minutes,expires_at:new Date(exp*1000).toISOString(),pricing_method:"server_geodesic_estimate"});
    }
    if(body.action==="create_order"){
      const token=String(body.price_token??""),claims=await verify(token,secret);
      if(claims.sub!==userData.user.id||!claims.quote_id)return reply({error:"Price quote does not belong to this passenger"},403);
      const idem=String(body.idempotency_key??"");if(idem.length<12||idem.length>128)return reply({error:"Invalid idempotency key"},400);
      const hash=toHex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(token))));
      const {data:order,error:orderError}=await admin.rpc("ladygo_create_order_from_quote",{p_passenger_id:userData.user.id,p_quote_id:claims.quote_id,p_token_hash:hash,p_idempotency_key:idem,p_pickup_address:String(body.pickup_address??""),p_destination_address:String(body.destination_address??""),p_payment_method:body.payment_method==="card"?"card":"cash"});
      if(orderError){if(/quote|expired|already used/i.test(orderError.message??""))return reply({error:"Price quote expired. Request a new quote."},409);if(/active order|duplicate|unique/i.test(orderError.message??""))return reply({error:"An active order already exists"},409);throw orderError;}
      return reply({order});
    }
    return reply({error:"Unsupported pricing action"},400);
  }catch(error){console.error("LadyGo pricing service error",error);return reply({error:"Unable to process pricing request"},500);}
});