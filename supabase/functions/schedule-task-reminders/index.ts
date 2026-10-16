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
  },body,signal:AbortSignal.timeout(10000)});
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

Deno.serve(async (req:Request)=>{
 if(req.method!=="POST")return reply({error:"POST only"},405);
 try{
  const token=req.headers.get("X-Morning-Key")||"";
  if(!/^[a-f0-9]{64}$/.test(token))return reply({error:"Unauthorized"},401);
  const admin=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:allowed,error:authError}=await admin.rpc("schedule_director_morning_auth",{p_token:token});
  if(authError||!allowed)return reply({error:"Unauthorized"},401);
  const body=await req.json().catch(()=>({}));
  if(body.action==="dry_run"){
    const result=await admin.from("schedule_task_reminders").select("task_id",{count:"exact",head:true}).is("delivered_at",null).lte("remind_at",new Date().toISOString());
    if(result.error)throw result.error;
    return reply({ok:true,dryRun:true,pending:result.count||0});
  }
  const {data:due,error:claimError}=await admin.rpc("schedule_claim_task_reminders",{p_limit:40});
  if(claimError)throw claimError;
  if(!due?.length)return reply({ok:true,claimed:0,sent:0});
  const keys=await vapid(admin);let sent=0,handled=0,cursor=0;
  async function finish(job:any,delivered:boolean,reason:string){
   const result=await admin.from("schedule_task_reminders").update({
     delivered_at:delivered?new Date().toISOString():null,
     lease_until:delivered?null:new Date(Date.now()+5*60000).toISOString(),
     last_error:reason?reason.slice(0,120):null
   }).eq("task_id",job.task_id).eq("lease_token",job.lease_token);
   if(result.error)throw result.error;
  }
  async function process(job:any){
   const {data:task,error:taskError}=await admin.from("schedule_private_items").select("id,user_id,kind,payload").eq("id",job.task_id).eq("user_id",job.user_id).maybeSingle();
   if(taskError)throw taskError;
   if(!task||task.kind!=="todo"||task.payload?.entryType==="memo"||task.payload?.done||task.payload?.reminderEnabled!==true||
      new Date(task.payload?.remindAt).getTime()!==new Date(job.remind_at).getTime())return;
   const {data:staff,error:staffError}=await admin.from("schedule_staff").select("id").eq("auth_user_id",job.user_id).eq("is_active",true).eq("must_change_password",false).maybeSingle();
   if(staffError)throw staffError;
   if(!staff){await finish(job,false,"inactive_staff");return}
   const {data:devices,error:deviceError}=await admin.from("schedule_task_devices").select("endpoint,p256dh,auth").eq("user_id",job.user_id);
   if(deviceError)throw deviceError;
   if(!devices?.length){await finish(job,false,"no_opted_in_device");return}
   const subs=devices.filter((x:any)=>allowEndpoint(x.endpoint)).slice(0,4);
   if(!subs.length){await finish(job,false,"no_valid_device");return}
   // Re-check the protected record immediately before delivering a queued reminder.
   const {data:latest,error:latestError}=await admin.from("schedule_private_items").select("payload").eq("id",job.task_id).eq("user_id",job.user_id).maybeSingle();
   if(latestError)throw latestError;
   if(!latest||latest.payload?.done||latest.payload?.reminderEnabled!==true||latest.payload?.entryType==="memo"||new Date(latest.payload?.remindAt).getTime()!==new Date(job.remind_at).getTime())return;
   const eventKey="private-task:"+job.task_id+":"+new Date(job.remind_at).toISOString();
   const payload=JSON.stringify({title:"내 할 일 알림",body:"설정한 할 일의 알림 시간입니다. 눌러서 내용을 확인하세요.",url:URL_BASE+"tasks.html?task="+encodeURIComponent(job.task_id),tag:eventKey});
   const results=await Promise.allSettled(subs.map(async(sub:any)=>{
      const code=await pushOne(sub,payload,keys);
      if(code===404||code===410){await admin.from("schedule_task_devices").delete().eq("user_id",job.user_id).eq("endpoint",sub.endpoint)}
      return code===201||code===202;
   }));
   const accepted=results.filter(r=>r.status==="fulfilled"&&r.value===true).length;
   await finish(job,accepted>0,accepted?"":"delivery_not_accepted");
   sent+=accepted;handled++;
  }
  await Promise.all(Array.from({length:Math.min(4,due.length)},async()=>{
    while(cursor<due.length){const job=due[cursor++];try{await process(job)}catch(error){console.warn("Task reminder delivery failed");try{await finish(job,false,"delivery_error")}catch{}}}
  }));
  return reply({ok:true,claimed:due.length,handled,sent});
 }catch(error){console.error("Task reminder dispatcher failed");return reply({error:"알림 처리에 실패했습니다"},500)}
});

