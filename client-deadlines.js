/* Important dates, not appointment or benefit decisions. */
(function(root){'use strict';
const valid=v=>root.PrivatePlanner.validDate(v),add=(d,n)=>root.WorkPeriods.add(d,n);
const sourceNames={manual:'직접 기록',recipient:'수급자 목록',iap:'저장된 IAP',helper:'전산도우미',other:'기타 자료',legacy:'기존 등록'};
function checked(payload,event){const c=payload?.eventChecks?.[event.key];return !!c&&c.date===event.date&&c.checked===true}
function source(payload,event){const s=payload?.eventSources?.[event.key];return s?.date===event.date?s:null}
function issues(rows){const out=[];for(const r of rows){const p=r.payload||{};if(r.kind!=='iap'||['employed','paused','ended'].includes(p.clientStatus))continue;const reasons=[];if(!p.name)reasons.push('이름 없음');if(!p.regNo)reasons.push('등록번호 없음');if(!valid(p.serviceEnd))reasons.push('서비스 만료일 미입력');if(p.type==='1'&&!p.dates?.some(valid))reasons.push('지정일 미입력');if(reasons.length)out.push({row:r,reasons})}return out}
function select(events,queue,today,range,includeChecked=false){const end=add(today,7);return events.filter(e=>(includeChecked||!e.checked)&&(queue==='today'?e.date===today:queue==='soon'?e.date>=today&&e.date<=end:queue==='past'?e.date<today:queue==='highlighted'?e.highlighted:queue==='checked'?e.checked:queue==='period'?e.date>=range[0]&&e.date<=range[1]:true)).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko'))}
function counts(events,today){const open=events.filter(e=>!e.checked);return {today:open.filter(e=>e.date===today).length,soon:open.filter(e=>e.date>=today&&e.date<=add(today,7)).length,past:open.filter(e=>e.date<today).length,checked:events.filter(e=>e.checked).length}}
function progress(today,event){const n=Math.round((Date.parse(event.date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);return event.checked?'확인 완료':n===0?'오늘':n<0?Math.abs(n)+'일 지남':'D−'+n}
function savedRecords(storage,rows,ownerEmail=''){let helper={};if(ownerEmail)try{helper=JSON.parse(storage.getItem('goodjob_client_basic_dates_v1:'+ownerEmail)||'{}').records||{}}catch{}let db;try{db=JSON.parse(storage.getItem('iap_participant_records_v1')||'{}')}catch{return []}const out=[];for(const r of rows){const p=r.payload||{},reg=String(p.regNo||'').replace(/\s/g,'').toLowerCase(),matches=Object.entries(db.records||{}).filter(([k,v])=>String(v.regNo||k).replace(/\s/g,'').toLowerCase()===reg);const basic=helper[reg],age=basic?Date.now()-Date.parse(basic.seenAt):NaN,expiry=basic&&valid(basic.jobCertExpire)&&Number.isFinite(age)&&age>= -300000&&age<=86400000?basic.jobCertExpire:'';if(!reg||matches.length>1||!matches.length&&!expiry)continue;const saved=matches[0]?.[1]||{},st=saved.state||{},f=st.fields||{};out.push({...root.ClientTimeline.reassessmentFromState(st),regNo:p.regNo,name:p.name,type:matches.length?(f['name:userType:2']===true?'2':'1'):p.type||'',iapDate:f['#iapDate']||p.iapDate||'',serviceEnd:f['#svcEnd']||p.serviceEnd||'',jobCertExpire:expiry||(valid(f['#jobCertExpire'])?f['#jobCertExpire']:''),jobCertSource:expiry?'helper':'iap',trainings:root.ClientTimeline.trainingFromState(st),sourceAt:saved.updatedAt||'',errors:[],warnings:[]})}return out}
function mergeReassessment(p,s,changes,warnings){
 const keys=['rediagnosisStart','rediagnosisEnd'],start=s.rediagnosisStart,end=s.rediagnosisEnd;
 if(!start&&!end)return;
 if(!valid(start)||!valid(end)||start>end){warnings.push('저장된 IAP의 재진단 시작·종료일을 확인하세요.');return}
 const next={},pending=[];
 for(const key of keys){
  const previous=p.eventSources?.[key],value=s[key];
  const owned=previous?.source==='iap'&&previous.date===p[key];
  if(!p[key]||owned){next[key]=value;if(p[key]!==value)pending.push({key,label:key==='rediagnosisStart'?'재진단 시작일':'재진단 종료일',from:p[key]||'',to:value})}
  else{next[key]=p[key];if(p[key]!==value)warnings.push((key==='rediagnosisStart'?'재진단 시작일':'재진단 종료일')+'이 직접 입력한 정보와 달라 기존 값을 유지합니다.')}
 }
 if(!valid(next.rediagnosisStart)||!valid(next.rediagnosisEnd)||next.rediagnosisStart>next.rediagnosisEnd){warnings.push('재진단 기간이 맞지 않아 기존 기간을 유지합니다.');return}
 for(const c of pending){p[c.key]=c.to;changes.push(c)}
 if(pending.length){p.eventChecks={...(p.eventChecks||{})};for(const c of pending)delete p.eventChecks[c.key]}
}
function planSaved(records,rows,identity){return records.map((s,index)=>{const found=rows.filter(r=>String(r.payload?.regNo||'').replace(/\s/g,'').toLowerCase()===String(s.regNo).replace(/\s/g,'').toLowerCase()),row=found[0],p={...(row?.payload||{})},errors=[],warnings=[],changes=[];if(found.length!==1)errors.push('등록번호를 내 목록에서 먼저 확인하세요.');if(s.type&&p.type&&s.type!==p.type)errors.push('지원유형이 다릅니다. 원본을 확인하세요.');if(s.iapDate&&p.iapDate&&s.iapDate!==p.iapDate)errors.push('IAP 수립일이 다릅니다. 다른 참여 이력인지 확인하세요.');
 const fill=(key,label,value)=>{if(!value)return;if(!p[key]){changes.push({key,label,from:'',to:value});p[key]=value}else if(p[key]!==value)warnings.push(label+'이 기존 정보와 달라 기존 값을 유지합니다.')};fill('iapDate','IAP 수립일',valid(s.iapDate)?s.iapDate:'');fill('serviceEnd','서비스 만료일',valid(s.serviceEnd)?s.serviceEnd:'');fill('jobCertExpire','구직인증번호 만료일',valid(s.jobCertExpire)?s.jobCertExpire:'');
 mergeReassessment(p,s,changes,warnings);
 if(p.type==='1'&&!p.dates?.some(valid)&&valid(p.iapDate)){p.dates=Array.from({length:6},(_,i)=>root.PrivatePlanner.monthDate(p.iapDate,i));changes.push({key:'dates',label:'표준 주기 지정일 · 실제 날짜 확인 필요',from:[],to:p.dates})}
 p.trainings=[...(Array.isArray(p.trainings)?p.trainings:[])];for(const t of s.trainings||[]){const exact=p.trainings.some(x=>x.name===t.name&&x.start===t.start&&x.end===t.end);if(exact)continue;if(p.trainings.some(x=>x.name===t.name)){warnings.push(t.name+'의 기존 훈련일정을 유지합니다. 변경·추가 회차는 직접 확인하세요.');continue}const item={id:'iap-'+root.crypto.randomUUID(),name:t.name,start:t.start,end:t.end};p.trainings.push(item);changes.push({key:'training',label:'훈련일정 추가',from:'',to:t.name+' · '+t.start+' ~ '+t.end})}
 if(changes.length){p.eventSources={...(p.eventSources||{})};for(const key of ['rediagnosisStart','rediagnosisEnd'])if(changes.some(c=>c.key===key))p.eventSources[key]={date:p[key],source:'iap'};if(changes.some(c=>c.key==='dates'))p.dates.forEach((date,i)=>p.eventSources['due:'+(i+1)]={date,source:'iap',calculated:i>0});if(changes.some(c=>c.key==='jobCertExpire'))p.eventSources.jobCertExpire={date:p.jobCertExpire,source:s.jobCertSource||'iap'};if(changes.some(c=>c.key==='serviceEnd'))p.eventSources.serviceEnd={date:p.serviceEnd,source:'iap'};for(const t of p.trainings.filter(t=>String(t.id).startsWith('iap-')))for(const [part,date] of [['start',t.start],['end',t.end]]){const key='training:'+t.id+':'+part;if(!p.eventSources[key])p.eventSources[key]={date,source:'iap'}}p.sourceHistory=[...(p.sourceHistory||[]),{source:'iap',at:new Date().toISOString(),sourceAt:s.sourceAt,fields:changes.map(c=>c.label)}].slice(-12)}
 return {index,source:s,row,payload:p,itemDate:row?.item_date||p.iapDate,errors,warnings,changes,action:errors.length?'blocked':changes.length?'update':'same',selected:false};})}
root.ClientDeadlines={checked,source,sourceNames,issues,select,counts,progress,savedRecords,planSaved};if(typeof module!=='undefined')module.exports=root.ClientDeadlines;
})(typeof window==='undefined'?globalThis:window);

