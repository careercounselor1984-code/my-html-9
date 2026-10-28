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

import { handleBoard } from './board.mjs';
Deno.serve(async (req:Request)=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});
 if(req.method!=='POST')return errorReply('POST only',405);
 try{
  const bearer=req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)return errorReply('로그인 필요',401);
  const admin=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.auth.getUser(bearer);
  if(error||!data.user)return errorReply('로그인이 만료되었습니다',401);
  const staff=await admin.from('schedule_staff').select('id,center,display_name,role,is_schedule_admin,is_active,must_change_password,managed_in_schedule').eq('auth_user_id',data.user.id).maybeSingle();
  if(staff.error||!staff.data?.is_active||staff.data.must_change_password)return errorReply('직원 인증을 완료해 주세요',403);
  const body=await req.json();
  const result=await handleBoard(admin,staff.data,body,{send:async(sub:any,payload:string)=>pushOne(sub,payload,await vapid(admin)),allowEndpoint});
  return reply(result);
 }catch(error:any){
  const status=Number(error.status)||500;
  if(status===500)console.error('Center board request failed');
  return errorReply(status===500?'센터 게시판 연결에 실패했습니다. 다시 시도해 주세요.':error.message,status);
 }
});
