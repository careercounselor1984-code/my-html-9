/* Canonical identity data. Shared by journal and schedule; no network dependency. */
(function(root){'use strict';
 const validReg=v=>/^A\d{10,30}$/.test(String(v||'').trim().toUpperCase());
 const reg=v=>String(v||'').trim().toUpperCase();
 const validDate=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v||''))return false;const d=new Date(v+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;};
 const fields=['name','jobCertNo','jobCertExpire','iapDate','serviceEnd','dueDate','type'];
 function merge(previous,incoming,source='manual',at=new Date().toISOString()){
  const no=reg(incoming?.regNo);if(!validReg(no))throw Error('전체 IAP 등록번호를 확인해 주세요.');
  if(previous?.regNo&&reg(previous.regNo)!==no)throw Error('번호 불일치');
  const out={...previous,version:1,regNo:no,values:{...previous?.values},sources:{...previous?.sources},conflicts:{...previous?.conflicts},updatedAt:at};
  for(const key of fields){if(!Object.hasOwn(incoming?.values||{},key))continue;const value=String(incoming.values[key]||'').trim();
   if(key.endsWith('Date')||['serviceEnd','jobCertExpire'].includes(key)){if(value&&!validDate(value))throw Error('날짜를 확인해 주세요.');}
   if(source==='automatic'&&!value)continue;
   const old=out.values[key];if(source==='automatic'&&old&&old!==value){out.conflicts[key]={current:old,detected:value,at};continue;}
   out.values[key]=value;if(old===value&&out.sources[key]){if(source==='automatic')out.sources[key]={...out.sources[key],verifiedAt:at};}else out.sources[key]={source,at};delete out.conflicts[key];
  }
  out.connection=source;return out;
 }
 function toSchedule(profile,old={}){
  if(!validReg(profile?.regNo))throw Error('등록번호 확인 필요');const v=profile.values||{};
  const out={...old,regNo:profile.regNo,clientLink:profile};
  for(const k of ['name','jobCertNo','jobCertExpire','iapDate','serviceEnd','type'])if(v[k])out[k]=v[k];
  if(v.dueDate){const dates=[...(old.dates||[])];if(!dates.includes(v.dueDate))out.actualDueDate=v.dueDate;}
  return out;
 }
 const api={validReg,reg,validDate,fields,merge,toSchedule};root.ClientLinkModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
