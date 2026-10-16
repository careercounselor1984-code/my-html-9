import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const URL_BASE = "https://careercounselor1984-code.github.io/my-html-9/";
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const deb64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=")), c=>c.charCodeAt(0));
const join = (...arrs:Uint8Array[]) => { const out=new Uint8Array(arrs.reduce((n,x)=>n+x.length,0)); let off=0;for(const arr of arrs){out.set(arr,off);off+=arr.length;}return out; };
const reply = (data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const errorReply = (message:string,status=400)=>reply({error:message},status);

async function vapid(adm:any) {
  const {data,error}=await adm.from("schedule_push_config").select("private_jwk,public_key").eq("id","main").maybeSingle();
  if(error)throw error;
  if(data)return {jwk:data.private_jwk as JsonWebKey,publicKey:data.public_key as string};
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",pair.privateKey);
  const publicKey=b64(new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey)));
  const result=await adm.from("schedule_push_config").insert({id:"main",private_jwk:jwk,public_key:publicKey});
  if(result.error && result.error.code!=="23505")throw result.error;
  if(result.error){const old=await adm.from("schedule_push_config").select("private_jwk,public_key").eq("id","main").single();if(old.error)throw old.error;return {jwk:old.data.private_jwk as JsonWebKey, publicKey:old.data.public_key as string};}
  return {jwk,publicKey};
}
async function hdfk(salt:Uint8Array, ikm:Uint8Array, info:Uint8Array, length:number) {
  const key=await crypto.subtle.importKey("raw",ikm,"HKDF",false,["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt,info},key,length*8));
}
async function pushOne(subscription:{endpoint:string,p256dh:string,auth:string},payload:string,keys:{jwk:JsonWebKey,publicKey:string}) {
  const subscriberPub=deb64(subscription.p256dh),auth=deb64(subscription.auth);
  const ephemeral=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const clientKey=await crypto.subtle.importKey("raw",subscriberPub,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const secret=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:clientKey},ephemeral.privateKey,256));
  const serverPub=new Uint8Array(await crypto.subtle.exportKey("raw",ephemeral.publicKey));
  const zero=new Uint8Array([0]);
  const ikm=await hdfk(auth,secret,join(enc.encode("WebPush: info"),zero,subscriberPub,serverPub),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hdfk(salt,ikm,join(enc.encode("Content-Encoding: aes128gcm"),zero),16);
  const nonce=await hdfk(salt,ikm,join(enc.encode("Content-Encoding: nonce"),zero),12);
  const contentKey=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const plain=join(enc.encode(payload),new Uint8Array([2]));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},contentKey,plain));
  const recordSize=new Uint8Array([0,0,16,0]); // 4096 bytes
  const body=join(salt,recordSize,new Uint8Array([serverPub.length]),serverPub,encrypted);
  const signed=await crypto.subtle.importKey("jwk",keys.jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const aud=new URL(subscription.endpoint).origin;
  const head=b64(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const token=b64(enc.encode(JSON.stringify({aud,exp:Math.floor(Date.now()/1000)+3600,sub:URL_BASE})));
  const toSign=head+"."+token;
  const signature=b64(new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},signed,enc.encode(toSign))));
  const response=await fetch(subscription.endpoint,{method:"POST",headers:{
    "Authorization":"vapid t="+toSign+"."+signature+", k="+keys.publicKey,
    "Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",
    "TTL":"3600","Urgency":"normal"
  },body});
  return response.status;
}
function allowEndpoint(raw:string){
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.port)return false;
  const h=u.hostname.toLowerCase();
  return h==="fcm.googleapis.com"||h==="updates.push.services.mozilla.com"||h.endsWith(".push.apple.com")||
    h.endsWith(".notify.windows.com")||h.endsWith(".push.services.mozilla.com");
 }catch{return false}
}

const schoolHolidays2026=new Set([
 "2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-02",
 "2026-05-01","2026-05-05","2026-05-25","2026-06-03","2026-07-17",
 "2026-08-17","2026-09-24","2026-09-25","2026-10-05","2026-10-09","2026-12-25"
]);
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"POST only"},405);
 try{
  const token=req.headers.get("X-Morning-Key")||"";
  if(!/^[a-f0-9]{64}$/.test(token))return reply({error:"Unauthorized"},401);
  const admin=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:valid,error:err}=await admin.rpc("schedule_director_morning_auth",{p_token:token});
  if(err||!valid)return reply({error:"Unauthorized"},401);
  const kst=new Date(Date.now()+9*3600000);
  const day=kst.toISOString().slice(0,10),hour=kst.getUTCHours(),dow=kst.getUTCDay();
  if(hour!==9||dow===0||dow===6||schoolHolidays2026.has(day))
     return reply({ok:true,skipped:"not_business_morning",day});
  const {data:next,error:nextErr}=await admin.rpc("schedule_next_business_day",{p_today:day});
  if(nextErr||!next)throw Error("Next business day query failed");
  const {data:visits,error:visitErr}=await admin.rpc("schedule_energy_access_summary",{p_start:day,p_end:next});
  if(visitErr)throw visitErr;
  const pending=(Array.isArray(visits)?visits:[]).filter((v:any)=>!v.confirmed&&[day,next].includes(v.date));
  if(!pending.length)return reply({ok:true,day,visits:0,sent:0});
  const {data:managers,error:staffErr}=await admin.from("schedule_staff")
    .select("id").eq("center","북부센터").eq("role","manager").eq("is_active",true);
  if(staffErr)throw staffErr;
  const ids=(managers||[]).map((x:any)=>x.id);
  if(!ids.length)return reply({ok:true,day,skipped:"no_north_manager"});
  const {data:subs,error:subErr}=await admin.from("schedule_push_subscriptions")
    .select("staff_id,endpoint,p256dh,auth").in("staff_id",ids);
  if(subErr)throw subErr;
  if(!subs?.length)return reply({ok:true,day,visits:pending.length,skipped:"no_subscribed_device"});
  const keys=await vapid(admin);
  let sent=0;
  for(const visit of pending){
   const phase=visit.date===day?"same_day":"previous_workday";
   const shortDate=String(visit.date).slice(5).replace("-","/");
   const names=[...new Set((Array.isArray(visit.appointments)?visit.appointments:[])
     .map((a:any)=>String(a.name||"").trim()).filter(Boolean))].sort((a:any,b:any)=>a.localeCompare(b,"ko"));
   const msg=shortDate+" 학교 등록 대상: "+(names.join(" · ")||"대상 확인 필요")+" (총 "+names.length+"명)";
   const eventKey="energy:"+visit.date+":"+phase+":"+String(visit.signature);
   for(const staffId of ids){
    const targets=(subs||[]).filter((s:any)=>s.staff_id===staffId).slice(0,4);
    if(!targets.length)continue;
    const rec=await admin.from("schedule_push_receipts").insert({event_key:eventKey,staff_id:staffId});
    if(rec.error?.code==="23505")continue;
    if(rec.error)throw rec.error;
    const payload=JSON.stringify({title:"에너지고 · 학교 등록 대상",body:msg,
      url:"https://careercounselor1984-code.github.io/my-html-9/?energySchool=1",tag:eventKey});
    for(const sub of targets){
     try{
      const status=await pushOne(sub,payload,keys);
      if(status===201||status===202)sent++;
      else if(status===404||status===410)
       await admin.from("schedule_push_subscriptions").delete().eq("endpoint",sub.endpoint);
      else console.warn("Energy push status",status);
     }catch(e){console.warn("Energy push error",String(e).slice(0,130))}
    }
   }
  }
  return reply({ok:true,day,nextBusinessDay:next,pending:pending.length,sent});
 }catch(e){
  console.error("School energy push failed",String(e).slice(0,190));
  return reply({error:"학교 출입신청 알림 전송 실패"},500);
 }
});

