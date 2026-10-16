'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/schedule-task-reminders/index.ts','utf8')).replace(/^import .*;$/m,'');
async function run(options={}){
 const sent=[],writes=[],queries=[],token='a'.repeat(64),time='2026-10-16T01:00:00Z';let handler,reads=0;
 const payload={reminderEnabled:true,remindAt:time,...options.payload};
 const job={task_id:'task-a',user_id:'owner-a',remind_at:time,lease_token:'lease-a'};
 const admin={rpc:async name=>({data:name==='schedule_director_morning_auth'?!options.denied:options.empty?[]:[job]}),from(table){
  const q={table,filters:[],op:'select'};queries.push(q);
  const chain={select(){return chain},eq(k,v){q.filters.push([k,v]);return chain},is(){return chain},lte(){return chain},update(value){q.op='update';q.value=value;writes.push(q);return chain},delete(){q.op='delete';writes.push(q);return chain},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
  function result(){if(table==='schedule_task_reminders')return {count:2};if(table==='schedule_staff')return {data:options.inactive?null:{id:1}};if(table==='schedule_task_devices')return {data:options.noDevices?[]:[{endpoint:'https://fcm.googleapis.com/own',p256dh:'key',auth:'key'}]};if(table==='schedule_private_items'){reads++;return {data:{id:'task-a',user_id:'owner-a',kind:'todo',payload:reads>1&&options.cancel?{...payload,done:true}:payload}}}return {data:null}}
  return chain;
 }};
 const ctx=vm.createContext({TextEncoder,Uint8Array,Response,Request,URL,AbortSignal,Date,console:{warn(){},error(){}},createClient:()=>admin,Deno:{env:{get:()=>''},serve:f=>handler=f},atob,btoa});
 vm.runInContext(source,ctx);ctx.pushOne=async(sub,payload)=>{sent.push({sub,payload:JSON.parse(payload)});return options.status||201};ctx.vapid=async()=>({});
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{'X-Morning-Key':options.badKey?'bad':token,'Content-Type':'application/json'},body:JSON.stringify(options.dry?{action:'dry_run'}:{})}));
 return {response,body:await response.json(),sent,writes,queries};
}
(async()=>{
 assert.equal((await run({badKey:true})).response.status,401);assert.equal((await run({denied:true})).response.status,401);
 let r=await run({dry:true});assert(r.body.dryRun);assert.equal(r.sent.length,0);
 for(const options of [{payload:{done:true}},{payload:{entryType:'memo'}},{payload:{reminderEnabled:false}},{cancel:true},{inactive:true},{noDevices:true}])assert.equal((await run(options)).sent.length,0);
 r=await run();assert.equal(r.body.sent,1);assert(!JSON.stringify(r.sent[0].payload).includes('owner-a'));assert(r.sent[0].payload.url.endsWith('?task=task-a'));
 for(const q of r.queries.filter(q=>['schedule_private_items','schedule_task_devices'].includes(q.table)))assert(q.filters.some(([k,v])=>k==='user_id'&&v==='owner-a'),'all private records and devices scoped to claimed owner');
 assert(r.writes[0].value.delivered_at);assert(r.writes[0].filters.some(([k,v])=>k==='lease_token'&&v==='lease-a'));
 r=await run({status:500});assert.equal(r.body.sent,0);assert.equal(r.writes[0].value.delivered_at,null);assert(r.writes[0].value.lease_until);
 r=await run({status:410});assert(r.writes.some(q=>q.table==='schedule_task_devices'&&q.op==='delete'));
 console.log('PASS: task dispatcher authentication, owner/device isolation, opt-in, cancellation, lease-bound delivery and retries');
})().catch(e=>{console.error(e);process.exitCode=1});
