(function(root){'use strict';
 const CODES=['overlap','version','validation','network','backup','save'];
 function classify(message){
  const text=String(message||'');
  return /중복/.test(text)?'overlap':/버전 충돌/.test(text)?'version':/백업|저장공간/.test(text)?'backup':/Failed to fetch|Network|network|timeout|연결/.test(text)?'network':/시각|형식|시간을 확인/.test(text)?'validation':'save';
 }
 function create({staffId,storage,rpc,isCurrent,uuid,onDelivery=()=>{}}){
  const key='schedule_issue_outbox_v1_'+staffId;let records=[],busy=false;
  try{const saved=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(saved))records=saved.filter(x=>x&&/^[0-9a-f-]{36}$/i.test(x.id)&&CODES.includes(x.code)&&typeof x.resolved==='boolean').map(x=>({id:x.id,code:x.code,count:Math.max(0,Math.min(10000,Number(x.count)||0)),resolved:x.resolved,delivered:x.delivered===true}));}catch{}
  function persist(){try{storage.setItem(key,JSON.stringify(records));}catch{ /* Keep the in-memory queue when device storage is unavailable. */ }}
  async function flush(){
   if(busy||!isCurrent())return;busy=true;
   try{for(const record of records.filter(x=>!x.delivered)){
    if(!isCurrent())return;
    const resolved=record.resolved;
    const {data,error}=await rpc('schedule_save_issue_report',{p_issue_key:record.id,p_code:record.code,p_resolved:resolved,p_pending_count:record.count});
    if(!isCurrent())return;
    if(error||!data?.ok)throw Error('오류 보고 전송 대기');
    if(record.resolved===resolved){record.delivered=true;persist();onDelivery(resolved);}
   }}catch{onDelivery(null);}finally{busy=false;}
  }
  function open(message,count){
   if(!isCurrent())return;
   let record=records.find(x=>!x.resolved);
   if(!record){record={id:uuid(),code:classify(message),count:Math.max(0,Math.min(10000,Number(count)||0)),resolved:false,delivered:false};records.push(record);persist();}
   else if(record.delivered)onDelivery(false);
   // An unresolved incident keeps its key across retries, reloads and offline recovery.
   return flush();
  }
  function resolve(){
   if(!isCurrent())return;
   for(const record of records.filter(x=>!x.resolved)){record.resolved=true;record.delivered=false;}
   // Retain undelivered transitions; old delivered history is held by the server.
   records=records.filter(x=>!x.resolved||!x.delivered);persist();return flush();
  }
  return {open,resolve,flush};
 }
 const api={classify,create};if(typeof module==='object'&&module.exports)module.exports=api;else root.ScheduleErrorReporting=api;
})(typeof window==='object'?window:globalThis);
