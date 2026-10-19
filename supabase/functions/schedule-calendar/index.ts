import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const project="hnhccnyitrlzqprnredi";
const root="https://careercounselor1984-code.github.io/my-html-9/";
const callback="https://"+project+".supabase.co/functions/v1/schedule-calendar";
const enc=new TextEncoder(),dec=new TextDecoder();
const cors={"Access-Control-Allow-Origin":"https://careercounselor1984-code.github.io","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const json=(x:any,n=200)=>new Response(JSON.stringify(x),{status:n,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
const b64=(data:Uint8Array)=>btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const deb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),x=>x.charCodeAt(0));
const sha=async(s:string)=>b64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(s))));
function creds(p:string){
 const google=p==="google";
 return {client: Deno.env.get(google?"GOOGLE_CALENDAR_CLIENT_ID":"MICROSOFT_CALENDAR_CLIENT_ID")||"",
 secret:Deno.env.get(google?"GOOGLE_CALENDAR_CLIENT_SECRET":"MICROSOFT_CALENDAR_CLIENT_SECRET")||"",
 auth:google?"https://accounts.google.com/o/oauth2/v2/auth":"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
 token:google?"https://oauth2.googleapis.com/token":"https://login.microsoftonline.com/common/oauth2/v2.0/token",
 scope:google?"https://www.googleapis.com/auth/calendar.events":"offline_access Calendars.ReadWrite User.Read"};
}
function providerValid(p:string){return p==="google"||p==="outlook"}
const keyPromise=async()=>{
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const digest=await crypto.subtle.digest("SHA-256",enc.encode("schedule-calendar-tokens:v1:"+secret));
 return crypto.subtle.importKey("raw",digest,"AES-GCM",false,["encrypt","decrypt"]);
};
async function protect(raw:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await keyPromise(),cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(raw)));
 return b64(iv)+"."+b64(cipher);
}
async function unprotect(s:string){
 const [iv,c]=s.split(".");
 if(!iv||!c)throw Error("Token data invalid");
 const buf=await crypto.subtle.decrypt({name:"AES-GCM",iv:deb64(iv)},await keyPromise(),deb64(c));
 return dec.decode(buf);
}
function dateParts(s:string){
 const d=s.replace(/-/g,"");
 return /^\d{8}$/.test(d)?d:"";
}
function offsetDay(day:string,add:number){
 const t=new Date(day+"T12:00:00Z");t.setUTCDate(t.getUTCDate()+add);return t.toISOString().slice(0,10);
}
function utcTime(date:string,clock:string){
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
 if(!m||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 return new Date(Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8,10),+m[1]-9,+m[2])).toISOString();
}
function basic(ev:any){
 const p=ev.payload||{};
 const date=String(ev.event_date||p.date||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const kind=String(p.kind||"");
 const isAll=p.allDay===true;
 const start=String(p.time||"09:00"),end=String(p.end||"");
 const startISO=isAll?null:utcTime(date,start);
 const endISO=isAll?null:utcTime(date,end||(/^\d\d:\d\d$/.test(start)?(()=>{const d=new Date(utcTime(date,start)||"");d.setUTCMinutes(d.getUTCMinutes()+30);return new Date(d.getTime()+9*3600000).toISOString().slice(11,16)})():"09:30"));
 if(!isAll&&(!startISO||!endISO))return null;
 let title="좋은일자리 일정";
 if(kind==="consult"||/상담/.test(String(p.type||"")))title="좋은일자리 상담";
 else if(kind==="off"||kind==="leave")title="좋은일자리 부재 일정";
 const startDate=date,endDate=offsetDay(date,1);
 return {id:String(ev.id),date,startISO,endISO,title,isAll,startDate,endDate};
}
function icsEsc(s:string){return s.replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/[,;]/g,x=>"\\"+x)}
function ics(items:any[]){
 const rows=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GoodJob//Schedule//KO","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:좋은일자리 상담 일정","X-WR-TIMEZONE:Asia/Seoul","REFRESH-INTERVAL;VALUE=DURATION:PT30M"];
 const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 for(const x of items){
   rows.push("BEGIN:VEVENT","UID:"+x.id+"@goodjob-schedule","DTSTAMP:"+stamp,"SUMMARY:"+icsEsc(x.title),
     "DESCRIPTION:"+icsEsc("상담 예약·변경은 좋은일자리 상담일정표에서 진행해 주세요."));
   if(x.isAll)rows.push("DTSTART;VALUE=DATE:"+dateParts(x.startDate),"DTEND;VALUE=DATE:"+dateParts(x.endDate));
   else rows.push("DTSTART:"+x.startISO.replace(/[-:]/g,"").replace(/\.\d{3}/,""),
     "DTEND:"+x.endISO.replace(/[-:]/g,"").replace(/\.\d{3}/,""));
   rows.push("END:VEVENT");
 }
 rows.push("END:VCALENDAR");
 // RFC 5545 folding for UTF-8: split by UTF-8 byte length, not JS UTF-16 characters
 const folded:string[]=[];
 for(const line of rows){
   let current="",bytes=0;
   for(const ch of line){const b=enc.encode(ch).length;if(bytes+b>73){folded.push(current);current=" ";bytes=1}current+=ch;bytes+=b}
   folded.push(current);
 }
 return folded.join("\r\n")+"\r\n";
}
function eventExternal(x:any,p:string){
 const description="좋은일자리 상담일정표에서 관리하는 일정입니다. 수정·취소는 좋은일자리 일정표에서 진행하세요.";
 if(p==="google")return {
   summary:x.title,description,visibility:"private",
   start:x.isAll?{date:x.startDate}:{dateTime:x.startISO},
   end:x.isAll?{date:x.endDate}:{dateTime:x.endISO}
 };
 return {
   subject:x.title,body:{contentType:"text",content:description},showAs:"busy",
   isAllDay:x.isAll,
   start:x.isAll?{dateTime:x.startDate+"T00:00:00",timeZone:"UTC"}:{dateTime:x.startISO.slice(0,19),timeZone:"UTC"},
   end:x.isAll?{dateTime:x.endDate+"T00:00:00",timeZone:"UTC"}:{dateTime:x.endISO.slice(0,19),timeZone:"UTC"}
 };
}
async function external(p:string,token:string,method:string,remoteId:string|null,payload?:any){
 const base=p==="google"?"https://www.googleapis.com/calendar/v3/calendars/primary/events":"https://graph.microsoft.com/v1.0/me/events";
 const path=remoteId?"/"+encodeURIComponent(remoteId):"";
 const resp=await fetch(base+path,{method,headers:{"Authorization":"Bearer "+token,
   ...(payload?{"Content-Type":"application/json"}:{})},body:payload?JSON.stringify(payload):undefined});
 if(!resp.ok){const body=(await resp.text()).slice(0,300);throw Error("Provider "+resp.status+" "+body)}
 if(method==="DELETE"||resp.status===204)return {};
 return await resp.json();
}
async function authAccess(admin:any,staff:string,p:string){
 const {data:record,error}=await admin.from("schedule_calendar_tokens").select("*").eq("staff_id",staff).eq("provider",p).maybeSingle();
 if(error)throw error;
 if(!record)return null;
 let token=await unprotect(record.access_cipher);
 if(new Date(record.expires_at).getTime()>Date.now()+120000)return token;
 const c=creds(p);
 const refresh=await unprotect(record.refresh_cipher);
 const params=new URLSearchParams({client_id:c.client,client_secret:c.secret,grant_type:"refresh_token",refresh_token:refresh});
 if(p==="outlook")params.set("scope",c.scope);
 const resp=await fetch(c.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
 if(!resp.ok)throw Error("캘린더 연결 갱신 실패: 다시 연결해 주세요.");
 const updated=await resp.json();
 token=updated.access_token;
 const {error:e}=await admin.from("schedule_calendar_tokens").update({
   access_cipher:await protect(token),
   refresh_cipher:await protect(updated.refresh_token||refresh),
   expires_at:new Date(Date.now()+Math.max(300,Number(updated.expires_in||3600))*1000).toISOString()
 }).eq("staff_id",staff).eq("provider",p);
 if(e)throw e;return token;
}
async function syncOne(admin:any,staff:string,p:string){
 const token=await authAccess(admin,staff,p);
 if(!token)return {provider:p,connected:false};
 const start=offsetDay(new Date().toISOString().slice(0,10),-14),end=offsetDay(new Date().toISOString().slice(0,10),365);
 const [eventsR,mapsR]=await Promise.all([
  admin.from("schedule_events").select("id,event_date,payload").eq("staff_id",staff).gte("event_date",start).lte("event_date",end).order("event_date",{ascending:true}).limit(500),
  admin.from("schedule_calendar_event_map").select("event_id,external_id,synced_hash").eq("staff_id",staff).eq("provider",p).limit(800)]);
 if(eventsR.error)throw eventsR.error;if(mapsR.error)throw mapsR.error;
 const events=(eventsR.data||[]).map(basic).filter(Boolean);
 const known=new Map((mapsR.data||[]).map((x:any)=>[x.event_id,x]));
 const incoming=new Set(events.map((e:any)=>e.id));
 let processed=0,created=0,updated=0,removed=0;
 // Limit API work per call, and retain mappings for past (outside window) events.
 for(const x of events){
  const signature=await sha(JSON.stringify(x));
  const prev:any=known.get(x.id);
  if(prev?.synced_hash===signature)continue;
  if(processed>=100)break;
  const method=prev?"PATCH":"POST";
  let remote:any;
  try{remote=await external(p,token,method,prev?.external_id||null,eventExternal(x,p))}
  catch(err){
   // External user deleted a synced entry: recreate it, don't alter source schedule.
   if(prev&&/\b404\b/.test(String(err))){remote=await external(p,token,"POST",null,eventExternal(x,p))}
   else throw err;
  }
  const id=String(remote?.id||prev?.external_id||"");
  if(!id)throw Error("외부 캘린더 저장 응답 오류");
  const {error}=await admin.from("schedule_calendar_event_map").upsert({
    staff_id:staff,provider:p,event_id:x.id,external_id:id,synced_hash:signature,updated_at:new Date().toISOString()
  },{onConflict:"staff_id,provider,event_id"});
  if(error)throw error;
  processed++;if(prev)updated++;else created++;
 }
 for(const [eventId,row] of known){
   if(processed>=100)break;
   if(incoming.has(eventId))continue;
   // Keep old mappings for events before the sync window, remove future ones deleted/moved away
   const {data:eventRow}=await admin.from("schedule_events").select("event_date").eq("id",eventId).maybeSingle();
   if(eventRow&&String(eventRow.event_date)<start)continue;
   try{await external(p,token,"DELETE",(row as any).external_id)}
   catch(err){if(!/\b404\b/.test(String(err)))throw err}
   const {error}=await admin.from("schedule_calendar_event_map").delete().eq("staff_id",staff).eq("provider",p).eq("event_id",eventId);
   if(error)throw error;
   processed++;removed++;
 }
 return {provider:p,connected:true,created,updated,removed,more:processed>=100};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("",{headers:cors});
 const admin=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
 const url=new URL(req.url);
 if(req.method==="GET")return json({error:"외부 일정 공유가 보안 정책으로 차단되었습니다."},403);
 if(req.method==="GET"&&url.searchParams.has("ics")){
  const token=url.searchParams.get("ics")||"";
  if(!/^[0-9a-f]{64}$/.test(token))return new Response("Not found",{status:404});
  const {data:feed}=await admin.from("schedule_calendar_feeds").select("staff_id").eq("token",token).eq("enabled",true).maybeSingle();
  if(!feed)return new Response("Feed disabled or not found",{status:404});
  const {data:staff}=await admin.from("schedule_staff").select("id").eq("id",feed.staff_id).eq("is_active",true).maybeSingle();
  if(!staff)return new Response("Inactive",{status:404});
  const now=new Date().toISOString().slice(0,10);
  const {data,error}=await admin.from("schedule_events").select("id,event_date,payload").eq("staff_id",feed.staff_id)
   .gte("event_date",offsetDay(now,-30)).lte("event_date",offsetDay(now,365)).order("event_date",{ascending:true}).limit(1200);
  if(error)return new Response("Feed unavailable",{status:503});
  return new Response(ics((data||[]).map(basic).filter(Boolean)),{headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"private, max-age=300","Content-Disposition":"inline; filename=goodjob-calendar.ics"}});
 }
 if(req.method==="GET"&&url.searchParams.has("state")){
  const fail=()=>Response.redirect(root+"?calendar=error",302);
  try{
   const state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"";
   if(!/^[0-9a-f]{64}$/.test(state)||!code||code.length>3000)return fail();
   const {data:record}=await admin.from("schedule_calendar_oauth_states").select("*").eq("state_hash",await sha(state)).maybeSingle();
   if(!record||new Date(record.expires_at).getTime()<Date.now())return fail();
   await admin.from("schedule_calendar_oauth_states").delete().eq("state_hash",record.state_hash);
   const c=creds(record.provider);if(!c.client||!c.secret)return fail();
   const params=new URLSearchParams({client_id:c.client,client_secret:c.secret,code,grant_type:"authorization_code",redirect_uri:callback,code_verifier:record.verifier});
   if(record.provider==="outlook")params.set("scope",c.scope);
   const response=await fetch(c.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
   if(!response.ok)return fail();
   const value=await response.json();
   if(!value.access_token||!value.refresh_token)return fail();
   const {error}=await admin.from("schedule_calendar_tokens").upsert({
    staff_id:record.staff_id,provider:record.provider,access_cipher:await protect(value.access_token),refresh_cipher:await protect(value.refresh_token),
    expires_at:new Date(Date.now()+Math.max(300,Number(value.expires_in||3600))*1000).toISOString(),
    connected_at:new Date().toISOString()
   },{onConflict:"staff_id,provider"});
   if(error)throw error;
   return Response.redirect(root+"?calendar=connected",302);
  }catch(e){console.warn("OAuth callback failed",String(e).slice(0,180));return fail()}
 }
 if(req.method!=="POST")return json({error:"지원하지 않는 요청"},405);
 try{
  const bearer=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]||"";
  if(!bearer)return json({error:"로그인 필요"},401);
  const {data:au,error:authErr}=await admin.auth.getUser(bearer);
  if(authErr||!au.user)return json({error:"로그인이 만료되었습니다"},401);
  const {data:actor,error:staffErr}=await admin.from("schedule_staff").select("id,is_active,must_change_password").eq("auth_user_id",au.user.id).eq("is_active",true).maybeSingle();
  if(staffErr||!actor||actor.must_change_password)return json({error:"직원 권한 없음"},403);
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||""),provider=String(body?.provider||"");
  if(action==="status")return json({providers:{google:{configured:false,connected:false},outlook:{configured:false,connected:false}},icsEnabled:false,externalSharingBlocked:true});
  if(action==="sync"||action==="sync_related")return json({ok:true,blocked:true});
  if(action!=="disconnect"&&action!=="disable_feed")return json({error:"외부 일정 공유가 보안 정책으로 차단되었습니다."},403);
  if(action==="status"){
   const {data:tokens}=await admin.from("schedule_calendar_tokens").select("provider,connected_at").eq("staff_id",actor.id);
   const {data:feed}=await admin.from("schedule_calendar_feeds").select("enabled").eq("staff_id",actor.id).maybeSingle();
   return json({providers:{
    google:{configured:!!(creds("google").client&&creds("google").secret),connected:(tokens||[]).some((x:any)=>x.provider==="google")},
    outlook:{configured:!!(creds("outlook").client&&creds("outlook").secret),connected:(tokens||[]).some((x:any)=>x.provider==="outlook")}
   },icsEnabled:!!feed?.enabled});
  }
  if(action==="feed"||action==="rotate_feed"){
   const {data:existing}=await admin.from("schedule_calendar_feeds").select("token").eq("staff_id",actor.id).maybeSingle();
   const token=action==="rotate_feed"||!existing?.token?random():existing.token;
   const {error}=await admin.from("schedule_calendar_feeds").upsert({staff_id:actor.id,token,enabled:true,rotated_at:new Date().toISOString()},{onConflict:"staff_id"});
   if(error)throw error;
   return json({ok:true,url:callback+"?ics="+token});
  }
  if(action==="disable_feed"){
   const {error}=await admin.from("schedule_calendar_feeds").update({enabled:false}).eq("staff_id",actor.id);
   if(error)throw error;return json({ok:true});
  }
  if(action==="connect"&&providerValid(provider)){
   const c=creds(provider);if(!c.client||!c.secret)return json({error:"관리자의 캘린더 서비스 등록이 아직 완료되지 않았습니다"},409);
   const state=random(),verifier=random();
   const challenge=await sha(verifier);
   const {error}=await admin.from("schedule_calendar_oauth_states").insert({
    state_hash:await sha(state),staff_id:actor.id,provider,verifier,expires_at:new Date(Date.now()+10*60000).toISOString()
   });
   if(error)throw error;
   const q=new URLSearchParams({client_id:c.client,redirect_uri:callback,response_type:"code",scope:c.scope,state,code_challenge:challenge,code_challenge_method:"S256"});
   if(provider==="google"){q.set("access_type","offline");q.set("prompt","consent")}
   return json({url:c.auth+"?"+q.toString()});
  }
  if(action==="disconnect"&&providerValid(provider)){
   const {error}=await admin.from("schedule_calendar_tokens").delete().eq("staff_id",actor.id).eq("provider",provider);
   if(error)throw error;
   // Previously created external events are not deleted automatically; user owns them in the external provider.
   return json({ok:true});
  }
  if(action==="sync_related"){
   const kind=String(body.kind||""),id=String(body.id||"");
   let target:string|null=null;
   if(kind==="booking"&&/^[a-z0-9_-]{8,85}$/i.test(id)){
    const {data:event}=await admin.from("schedule_events").select("staff_id,created_by_staff_id").eq("id",id).maybeSingle();
    if(event?.created_by_staff_id===actor.id && event.staff_id!==actor.id)target=event.staff_id;
   }else if(kind==="handoff"&&/^[0-9a-f-]{36}$/i.test(id)){
    const {data:h}=await admin.from("schedule_handoffs").select("requester_id,accepted_by,status").eq("id",id).maybeSingle();
    if(h?.accepted_by===actor.id&&h.status==="accepted")target=h.requester_id;
   }
   if(!target)return json({error:"다른 상담사의 일정 연동을 요청할 권한이 없습니다"},403);
   const results=[];
   for(const p of ["google","outlook"]){
    if(!creds(p).client||!creds(p).secret)continue;
    try{results.push(await syncOne(admin,target,p))}
    catch(e){console.warn("Related schedule sync error",p,String(e).slice(0,140))}
   }
   return json({ok:true,results});
  }
  if(action==="sync"){
   const providers=providerValid(provider)?[provider]:["google","outlook"];
   const results=[];
   for(const p of providers){
    if(!creds(p).client||!creds(p).secret)continue;
    try{results.push(await syncOne(admin,actor.id,p))}
    catch(e){console.warn("Calendar sync error",p,String(e).slice(0,140));results.push({provider:p,error:"외부 캘린더 동기화 실패. 다시 연결 또는 동기화를 시도해 주세요."})}
   }
   return json({results});
  }
  return json({error:"지원하지 않는 요청"},400);
 }catch(e){console.error("Schedule calendar edge",String(e).slice(0,200));return json({error:"캘린더 서버 처리를 완료하지 못했습니다"},500)}
});
