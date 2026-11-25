'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../client-activity-model.js');
const code=fs.readFileSync('clients.js','utf8');
const start=code.indexOf('async function recordActivity('),end=code.indexOf('function setButtons(disabled)',start);
assert(start>=0&&end>start);
const clients=[{id:'client-1',user_id:'uid',kind:'iap',item_date:'2026-10-01',payload:{regNo:'A12345678901',name:'테스트 내담자',iapDate:'2026-10-01',clientStatus:'active'},updated_at:'t1'}];
const history=[],replies=[];let version=1,listener,painted=0,epoch=0,forceAuditFailure=false;
const parent={postMessage:d=>replies.push(d)};
const window={parent,addEventListener:(event,fn)=>{if(event==='message')listener=fn}};
const client={
 auth:{getSession:async()=>({data:{session:{user:{id:'uid',email:'staff@example.com'}}}})},
 rpc:async(name,args)=>{
  if(name==='schedule_claim_identity')return {data:{id:'staff',center:'북부센터',mustChangePassword:false}};
  assert.equal(name,'schedule_client_commit_and_audit');
  const row=clients.find(r=>r.id===args.p_client_id&&r.user_id==='uid');
  if(!row||row.updated_at!==args.p_expected_at)return {error:{message:'다른 기기에서 수정했습니다.'}};
  if(forceAuditFailure)return {error:{message:'이력 기록 제한'}};
  const changed=A.fieldChanges(row.payload,args.p_payload);
  assert(changed.length,'atomic RPC called for meaningful changes');
  const next={...row,payload:args.p_payload,item_date:args.p_item_date,updated_at:'t'+(++version)};
  Object.assign(row,next);
  history.push({id:'audit-'+(history.length+1),user_id:'uid',client_id:row.id,
   reg_no:args.p_payload.regNo,activity_type:changed.some(c=>c.field==='clientStatus'||c.field==='statusDate')?'status_change':'date_change',
   source_key:'change:'+row.id+':'+args.p_expected_at,activity_date:'2026-11-21',
   details:{source:args.p_source,changes:args.p_changes},created_at:'2026-11-21T10:00:00Z'});
  return {data:[next],error:null};
 },
 from(table){
  const filters=[];let op='read',data;
  const q={
   select(){return q},
   eq(field,value){filters.push([field,value]);return q},
   update(payload){op='update';data=payload;return q},
   insert(payload){op='insert';data=payload;return q},
   upsert(payload){op='upsert';data=payload;return q},
   then(resolve){
    const list=table==='schedule_client_activity'?history:clients;
    const found=list.filter(r=>filters.every(([k,v])=>(k==='payload->>regNo'?r.payload?.regNo:r[k])===v));
    let result=found,error=null;
    if(op==='insert'){const row={...data,updated_at:'t'+(++version)};list.push(row);result=[row]}
    if(op==='update'){result=found.map(row=>Object.assign(row,data,{updated_at:'t'+(++version)}))}
    if(op==='upsert'){if(!list.some(x=>x.user_id===data.user_id&&x.source_key===data.source_key)){
      list.push({...data,id:'audit-'+(history.length+1),created_at:'2026-11-21T10:00:00Z'});
    }result=[]}
    resolve({data:JSON.parse(JSON.stringify(result)),error});
  }
  };return q;
 }
};
const identity={id:'staff',center:'북부센터'};
let rows=clients.slice(),activityRows=[],loaded=true,loading=false,busy=false,userId='uid';
const context={
 window,client,identity,rows,activityRows,loaded,loading,busy,userId,epoch,
 root:{ClientLinkSync:{prepare:(profile,old)=>({...old,...profile.values,regNo:profile.regNo})},ClientImport:{stableId:async()=> 'client-2'}},
 A,states:{active:'참여 중',employed:'취업',paused:'일시 중지',ended:'종료·중단'},
 keyDate:()=> '2026-11-21',
 autoEnabled:()=>false,autoSyncIap:async()=>{},
 paint:()=>{painted++},TextEncoder,crypto:{randomUUID:()=> 'unique-audit-key-0001'}
};
vm.runInNewContext(code.slice(start,end),context);
const reg='A12345678901',send=(type,extra={},origin='https://careercounselor1984-code.github.io')=>{
 const id='req-'+(replies.length+1);
 listener({source:parent,origin,
 data:{type,requestId:id,expectedEmail:'staff@example.com',...extra}});
 return id;
};
const wait=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 const c={regNo:reg,date:'2026-10-29',pageId:'p05',sourceKey:'journal:p05:aaaa:2026-10-29:'+reg};
 send('goodjob:client-consultation:v1',{regNo:reg,consultation:c},'https://other.workers.dev');await wait();
 assert.equal(replies.length,0,'unlisted origin must be ignored');
 send('goodjob:client-consultation:v1',{regNo:reg,consultation:c},'https://goodjob-north-journal.careercounselor1984.workers.dev');await wait();
 assert(replies.at(-1).ok,'consultation stored');
 assert.equal(history.filter(x=>x.activity_type==='consultation').length,1);
 assert.equal(history[0].client_id,'client-1');
 send('goodjob:client-consultation:v1',{regNo:reg,consultation:c});await wait();
 assert(replies.at(-1).ok,'idempotent resend accepted');
 assert.equal(history.filter(x=>x.activity_type==='consultation').length,1,'duplicate counseling suppressed');
 send('goodjob:client-consultation:v1',{regNo:reg,status:{value:'employed',date:'2026-11-20',reason:'실제 취업 확인',confirmed:true}});await wait();
 assert(replies.at(-1).ok,'explicit status update saved: '+JSON.stringify(replies.at(-1)));
 assert.equal(clients[0].payload.clientStatus,'employed');
 assert(history.some(x=>x.activity_type==='status_change'),'status change append-only evidence');
 const before=history.length;
 forceAuditFailure=true;
 send('goodjob:client-consultation:v1',{regNo:reg,status:{value:'paused',date:'2026-11-21',reason:'일시 중지 확인',confirmed:true}});await wait();
 assert.equal(replies.at(-1).ok,false,'audit failure must reject status update');
 assert.equal(clients[0].payload.clientStatus,'employed','atomic RPC leaves status unchanged if audit fails');
 assert.equal(history.length,before,'no partial audit on transaction failure');
 forceAuditFailure=false;
 send('goodjob:client-consultation:v1',{regNo:reg,status:{value:'ended',date:'2026-11-21',reason:'',confirmed:false}});await wait();
 assert.equal(replies.at(-1).ok,false);
 assert.equal(clients[0].payload.clientStatus,'employed','unconfirmed status cannot overwrite');
 assert.equal(history.length,before,'unconfirmed status not audited');
 const id='bad-account';
 listener({source:parent,origin:'https://careercounselor1984-code.github.io',
 data:{type:'goodjob:client-consultation:v1',requestId:id,expectedEmail:'different@example.com',regNo:reg,consultation:c}});
 await wait();assert.equal(replies.at(-1).ok,false);
 assert(painted>=2);
 console.log('PASS mocked authenticated consultation evidence, dedup, confirmed status and account guard');
})().catch(e=>{console.error(e);process.exitCode=1});
