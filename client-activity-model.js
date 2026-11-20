/* Consultation dates and schedule change audit: pure, owner-agnostic rules. */
(function(root){'use strict';
const validDate=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const normalizeReg=value=>String(value||'').replace(/\s/g,'').toUpperCase();
const validReg=value=>/^A\d{10,30}$/.test(normalizeReg(value));
const todayLocal=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const daysBetween=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const states={active:'참여 중',employed:'취업',paused:'일시 중지',ended:'종료·중단'};
const consultMenus=new Set(['p01','p02','p03','p04','p05','p06','p07','p10','p11','p13','p16','p17','p21','p23','p30','p34']);
const recentByReg=(activity,today=todayLocal())=>{
 const latest=new Map(),count=new Map(),latestByClient=new Map(),countByClient=new Map();
 for(const row of activity||[]){
  if(row.activity_type!=='consultation'||!validDate(row.activity_date)||row.activity_date>today||!validReg(row.reg_no))continue;
  const reg=normalizeReg(row.reg_no);
  if(!latest.has(reg)||latest.get(reg).activity_date<row.activity_date)latest.set(reg,row);
  count.set(reg,(count.get(reg)||0)+1);
  if(row.client_id){const id=String(row.client_id);if(!latestByClient.has(id)||latestByClient.get(id).activity_date<row.activity_date)latestByClient.set(id,row);countByClient.set(id,(countByClient.get(id)||0)+1)}
 }
 return {latest,count,latestByClient,countByClient};
};
function attention(rows,activity,today=todayLocal(),threshold=21){
 if(!validDate(today)||!Number.isInteger(threshold)||threshold<1)throw Error('기준일 확인 필요');
 const {latest,count,latestByClient,countByClient}=recentByReg(activity,today);
 return (rows||[]).filter(row=>row.kind==='iap').map(row=>{
  const p=row.payload||{},reg=normalizeReg(p.regNo),hasOwnerRecords=(activity||[]).some(e=>e.client_id&&e.reg_no===reg),entry=latestByClient.get(String(row.id))||(!hasOwnerRecords?latest.get(reg):null),last=entry?.activity_date||'',days=last?daysBetween(last,today):null;
  const active=(!p.clientStatus||p.clientStatus==='active'),due=active&&days!==null&&days>=threshold;
  return {row,reg,last,days,registered:countByClient.get(String(row.id))||(hasOwnerRecords?0:count.get(reg)||0),status:!active?'inactive':!last?'unrecorded':due?'due':'recent',due};
 });
}
const scheduleFields=['iapDate','serviceEnd','jobCertExpire','rediagnosisStart','rediagnosisEnd','rediagnosisDate','actualDueDate'];
function fieldChanges(before={},after={}){
 const changes=[];
 for(const key of scheduleFields)if(String(before[key]||'')!==String(after[key]||'')){
  changes.push({field:key,from:String(before[key]||''),to:String(after[key]||'')});
 }
 const oldDates=Array.isArray(before.dates)?before.dates:[],newDates=Array.isArray(after.dates)?after.dates:[];
 for(let i=0;i<6;i++)if(String(oldDates[i]||'')!==String(newDates[i]||''))changes.push({field:'due:'+(i+1),from:String(oldDates[i]||''),to:String(newDates[i]||'')});
 const oldTraining=Array.isArray(before.trainings)?before.trainings:[],newTraining=Array.isArray(after.trainings)?after.trainings:[];
 for(const key of ['start','end']){
  const oldSet=oldTraining.map(t=>String(t.id||t.name||'')+':'+String(t[key]||'')).sort();
  const newSet=newTraining.map(t=>String(t.id||t.name||'')+':'+String(t[key]||'')).sort();
  if(JSON.stringify(oldSet)!==JSON.stringify(newSet))changes.push({field:'training:'+key,from:oldSet.join('; ').slice(0,400),to:newSet.join('; ').slice(0,400)});
 }
 if(before.clientStatus!==after.clientStatus||before.statusDate!==after.statusDate){
  changes.push({field:'clientStatus',from:String(before.clientStatus||'active'),to:String(after.clientStatus||'active')});
  if(before.statusDate!==after.statusDate)changes.push({field:'statusDate',from:String(before.statusDate||''),to:String(after.statusDate||'')});
 }
 return changes;
}
function consultation(payload,today=todayLocal()){
 if(!payload||!validReg(payload.regNo)||!validDate(payload.date)||payload.date>today)throw Error('실제 상담일·IAP 등록번호를 확인해 주세요.');
 if(!consultMenus.has(payload.pageId))throw Error('상담 메뉴가 아닙니다.');
 if(!/^[a-zA-Z0-9:_-]{10,180}$/.test(payload.sourceKey||''))throw Error('상담 저장 고유값을 확인해 주세요.');
 return {reg_no:normalizeReg(payload.regNo),activity_type:'consultation',source_key:payload.sourceKey,activity_date:payload.date,details:{pageId:payload.pageId}};
}
const api={validDate,validReg,normalizeReg,todayLocal,daysBetween,recentByReg,attention,fieldChanges,consultation,consultMenus,states};
root.ClientActivityModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
