(function(root){
 'use strict';
 const clean=row=>{const x={...row};delete x.readonly;delete x._serverVersion;return x};
 const minutes=t=>{const m=/^(\d{2}):(\d{2})$/.exec(t||'');return m?Number(m[1])*60+Number(m[2]):NaN};
 const consultation=e=>e.kind==='consult'||(!e.kind&&['초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'].includes(e.type));
 function overlaps(a,b){
  if(a.id===b.id||a.date!==b.date||a.center!==b.center||a.owner!==b.owner||a.type==='시차'||b.type==='시차'||!(consultation(a)||consultation(b)))return false;
  if(a.allDay||b.allDay)return true;
  const start=e=>minutes(e.time),end=e=>e.end?minutes(e.end):start(e)+30;
  return start(a)<end(b)&&start(b)<end(a);
 }
 function pending(rows,base){
  const current=new Map(rows.map(e=>[e.id,e]));
  return [...rows.filter(e=>JSON.stringify(clean(e))!==base.get(e.id)).map(row=>({row,deleted:false})),
   ...[...base].filter(([id])=>!current.has(id)).map(([,value])=>({row:JSON.parse(value),deleted:true}))];
 }
 function conflicts(row,rows,base,server){
  // Compare with the proposed final state, preserving fresh server-only bookings.
  const changed=new Set(pending(rows,base).map(x=>x.row.id));
  const final=new Map(server.filter(e=>!changed.has(e.id)).map(e=>[e.id,e]));
  rows.filter(e=>changed.has(e.id)).forEach(e=>final.set(e.id,e));
  return [...final.values()].filter(e=>overlaps(row,e));
 }
 const api={pending,conflicts,isCorrectable:message=>/기존 상담 또는 근무 일정과 시간이 중복|상담 시작·종료 시각을 확인/.test(String(message||''))};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ScheduleSaveRecovery=api;
})(typeof window==='object'?window:globalThis);
