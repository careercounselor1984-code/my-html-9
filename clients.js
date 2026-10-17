/* Independent client dates. This module never reads or writes schedule_events. */
(function(root){'use strict';
const validDate=v=>root.PrivatePlanner.validDate(v);
const states={active:'참여 중',employed:'취업',paused:'일시 중지',ended:'종료·중단'};
function excluded(payload,event){const rule=payload?.eventRules?.[event.key];if(rule&&typeof rule.excluded==='boolean')return rule.excluded;return ['employed','paused','ended'].includes(payload?.clientStatus)&&validDate(payload.statusDate)&&event.date>=payload.statusDate}
const labels={rediagnosis:'재진단 지정일',due:'지정일',trainingStart:'훈련 시작',trainingEnd:'훈련 종료',serviceEnd:'기간만료 예정'};
function trainingFromState(state){
 const source=(state?.jobRows||[]).filter(r=>/직업훈련/.test(String(r.kind||''))&&validDate(r.start)&&validDate(r.end)&&r.start<=r.end).map(r=>({name:String(r.name||r.org||'직업훈련'),org:String(r.org||''),start:r.start,end:r.end})).sort((a,b)=>a.name.localeCompare(b.name)||a.org.localeCompare(b.org)||a.start.localeCompare(b.start));
 const out=[];
 for(const row of source){const prev=out.at(-1),next=prev?new Date(prev.end+'T12:00:00'):null;if(next)next.setDate(next.getDate()+1);if(prev&&prev.name===row.name&&prev.org===row.org&&new Date(row.start+'T12:00:00')<=next){if(row.end>prev.end)prev.end=row.end}else out.push({...row})}
 return out;
}
function savedClientIaps(storage){
 try{const db=JSON.parse(storage.getItem('iap_participant_records_v1')||'{}');return Object.entries(db.records||{}).map(([key,r])=>{const f=r.state?.fields||{};return {regNo:String(r.regNo||key),iapDate:f['#iapDate']||'',type:f['name:userType:2']===true?'2':'1',serviceEnd:validDate(f['#svcEnd'])?f['#svcEnd']:'',trainings:trainingFromState(r.state)}}).filter(r=>r.regNo&&validDate(r.iapDate)).sort((a,b)=>a.regNo.localeCompare(b.regNo))}catch{return []}
}
function eventsFor(rows,includeExcluded=false){
 const events=[];
 for(const row of rows.filter(r=>r.kind==='iap')){const p=row.payload||{},name=String(p.name||'이름 미입력');const push=(date,kind,detail,key)=>{const event={rowId:row.id,name,regNo:String(p.regNo||''),date,kind,detail,key};if(validDate(date)&&(includeExcluded||!excluded(p,event)))events.push(event)};
  (Array.isArray(p.dates)?p.dates:[]).slice(0,6).forEach((date,i)=>push(date,'due',(i+1)+'회차'+(i===0?' · IAP 수립일':''),'due:'+(i+1)));
  for(const [i,t] of (Array.isArray(p.trainings)?p.trainings:[]).entries()){const key='training:'+(t.id||i);push(t.start,'trainingStart',String(t.name||'직업훈련'),key+':start');push(t.end,'trainingEnd',String(t.name||'직업훈련'),key+':end')}
  push(p.serviceEnd,'serviceEnd','취업지원서비스 만료일','serviceEnd');push(p.rediagnosisDate,'rediagnosis','취업역량 재진단','rediagnosis');
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko')||a.kind.localeCompare(b.kind));
}
root.ClientTimeline={trainingFromState,savedClientIaps,eventsFor,excluded,states};
if(typeof module!=='undefined'){module.exports=root.ClientTimeline;return}
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
let client=null,identity=null,userId='',rows=[],editing=null,busy=false,loaded=false,loading=false,epoch=0,loadSeq=0,filter='all',view='list',focusDate=keyDate(new Date());
function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error)}
function gate(text){$('gate').hidden=false;$('workspace').hidden=true;$('gate').querySelector('h2').textContent='직원 로그인 필요';$('gateMessage').textContent=text}
function clearPrivate(){epoch++;loadSeq++;userId='';identity=null;rows=[];editing=null;loaded=false;loading=false;busy=false;$('workspace').hidden=true;$('timeline').innerHTML='';$('roster').innerHTML='';$('filters').innerHTML='';$('identity').textContent='';$('savedIap').innerHTML='';$('trainingRows').innerHTML='';$('clientForm').reset();$('remainingEvents').innerHTML='';$('lifecycleHistory').innerHTML='';if($('clientDialog').open)$('clientDialog').close();message('')}
async function authenticate(){
 const token=++epoch;
 try{const {data,error}=await client.auth.getSession();if(error)throw error;const session=data?.session;if(token!==epoch)return;if(!session){clearPrivate();gate('상담일정표에서 직원 계정으로 로그인한 뒤 이 화면을 열어주세요.');return}
  const {data:staff,error:staffError}=await client.rpc('schedule_claim_identity');if(staffError)throw staffError;if(token!==epoch)return;if(!staff?.id||staff.mustChangePassword){clearPrivate();gate('상담일정표에서 직원 인증과 비밀번호 변경을 완료해 주세요.');return}
  if(userId!==session.user.id){rows=[];loaded=false;$('timeline').innerHTML='';$('roster').innerHTML=''}
  userId=session.user.id;identity=staff;$('identity').textContent=staff.center+' · '+staff.name+'의 내담자 일정';$('gate').hidden=true;$('workspace').hidden=false;await load();
 }catch(error){if(token!==epoch)return;clearPrivate();gate('계정 확인 실패: '+error.message)}
}
async function load(){
 if(!userId||!identity||busy)return;const token=epoch,seq=++loadSeq,uid=userId;loading=true;loaded=false;message('내담자 일정 불러오는 중…');
 try{let all=[];for(let start=0;;start+=200){const {data,error}=await client.from('schedule_private_items').select('id,kind,item_date,payload,updated_at').eq('user_id',uid).eq('kind','iap').order('id').range(start,start+199);if(error)throw error;if(token!==epoch||seq!==loadSeq)return;all=all.concat(data||[]);if((data||[]).length<200)break}rows=all;loaded=true;message('본인 전용 · 서버 저장 자료');paint()}catch(error){if(token===epoch&&seq===loadSeq)message('불러오기 실패: '+error.message,true)}finally{if(token===epoch&&seq===loadSeq)loading=false}
}
async function mutate(record){
 if(busy||loading||!loaded||!userId)throw Error('계정과 저장 상태를 확인한 후 다시 시도하세요.');const token=epoch,uid=userId,row=editing;busy=true;loadSeq++;setButtons(true);message('저장 중…');
 try{let q=client.from('schedule_private_items');if(row){q=record?q.update({...record,updated_at:new Date().toISOString()}):q.delete();q=q.eq('id',row.id).eq('user_id',uid).eq('kind','iap').eq('updated_at',row.updated_at)}else q=q.insert({...record,user_id:uid});const {data,error}=await q.select('id,kind,item_date,payload,updated_at');if(error)throw error;if(token!==epoch)throw Error('계정이 변경되어 작업을 중단했습니다.');if(!data?.length)throw Error('다른 기기에서 수정된 자료입니다. 취소 후 새로고침해 주세요.');if(row)rows=rows.filter(r=>r.id!==row.id);if(record)rows.push(data[0]);message('서버 저장 완료 ✓');paint();$('clientDialog').close()}catch(error){if(token===epoch)message('저장 실패: '+error.message,true);throw error}finally{if(token===epoch){busy=false;setButtons(false)}}
}
function setButtons(disabled){$('saveClient').disabled=disabled;$('deleteClient').disabled=disabled;$('cancelEditor').disabled=disabled;$('closeEditor').disabled=disabled}
function monthRange(){return root.WorkPeriods.range(focusDate,view)}
function syncPeriodControls(){const monthView=view==='list'||view==='month';$('month').value=focusDate.slice(0,7);$('clientDay').value=focusDate;$('clientMonthWrap').hidden=!monthView;$('clientDayWrap').hidden=monthView;$('clientWeekday').hidden=monthView;$('clientWeekday').textContent='('+['일','월','화','수','목','금','토'][new Date(focusDate+'T12:00:00').getDay()]+')';$('clientRange').textContent=root.WorkPeriods.periodLabel(focusDate,view);$('thisMonth').textContent=monthView?'이번 달':view==='week'?'이번 주':'오늘';const unit=monthView?'달':view==='week'?'주':'날짜';$('prevMonth').setAttribute('aria-label','이전 '+unit);$('nextMonth').setAttribute('aria-label','다음 '+unit);document.querySelectorAll('[data-client-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clientView===view)));try{localStorage.setItem('goodjob_clients_view',view)}catch{}}
function matches(p,search){return [p?.name,p?.regNo].join(' ').toLowerCase().includes(search)}
function paint(){
 if(!userId||!identity)return;const range=monthRange();if(!range)return;const search=$('search').value.trim().toLowerCase(),mine=rows.filter(r=>matches(r.payload,search)),all=eventsFor(mine).filter(e=>e.date>=range[0]&&e.date<=range[1]);
 const cards=[['all','전체'],...Object.entries(labels)];$('filters').innerHTML=cards.map(([kind,label])=>'<button type="button" class="filter-card '+(kind===filter?'active':'')+'" data-filter="'+kind+'" aria-pressed="'+(kind===filter)+'"><span>'+label+(kind==='all'?'<small>조회 기간의 확인 일정</small>':'')+'</span><b>'+(kind==='all'?all.length:all.filter(e=>e.kind===kind).length)+'</b></button>').join('');
 const visible=filter==='all'?all:all.filter(e=>e.kind===filter);$('resultTitle').textContent=(matchMedia('(max-width:700px)').matches?'':root.WorkPeriods.periodLabel(focusDate,view)+' · ')+(filter==='all'?'전체 내담자 일정':labels[filter]);$('resultCount').textContent=visible.length+'건 · '+new Set(visible.map(e=>e.rowId)).size+'명';
 let html='',day='';for(const e of visible){if(day!==e.date){if(day)html+='</div></section>';day=e.date;const d=new Date(day+'T12:00:00');html+='<section class="day-group"><div class="day-heading"><strong>'+Number(day.slice(5,7))+'/'+Number(day.slice(-2))+'</strong><small>'+['일','월','화','수','목','금','토'][d.getDay()]+'요일</small>'+(day===keyDate(new Date())?'<small class="today">오늘</small>':'')+'</div><div class="event-list">'}html+='<div class="client-event"><span class="badge '+e.kind+'">'+labels[e.kind]+'</span><strong>'+escape(e.name)+'</strong><span class="detail">'+escape(e.detail)+'</span><button type="button" data-edit="'+escape(e.rowId)+'">확인·수정</button></div>'}if(day)html+='</div></section>';if(view==='month'||view==='week'){html=root.WorkPeriods.calendar(focusDate,view,(date,inRange)=>{if(!inRange)return '';const entries=visible.filter(e=>e.date===date);return entries.length?entries.map(e=>'<button type="button" class="period-event" data-edit="'+escape(e.rowId)+'"><span class="badge '+e.kind+'">'+labels[e.kind]+'</span><strong>'+escape(e.name)+'</strong><small>'+escape(e.detail)+'</small></button>').join(''):'<div class="period-empty">일정 없음</div>'})}$('timeline').innerHTML=html||'<div class="empty">'+(loaded?'조회 조건에 해당하는 일정이 없습니다.<br>내담자 일정을 등록하거나 조회 기간·종류를 변경해 보세요.':'저장 자료를 불러오는 중입니다.')+'</div>';
 $('rosterTitle').textContent='등록한 내담자 관리 · '+mine.length+'명';$('roster').innerHTML=mine.sort((a,b)=>String(a.payload.name||'').localeCompare(String(b.payload.name||''),'ko')).map(r=>'<div class="person-row"><div><strong>'+escape(r.payload.name||'이름 미입력')+'</strong> <span class="client-state">'+escape(states[r.payload.clientStatus]||states.active)+'</span><small>'+(r.payload.regNo?'IAP '+escape(r.payload.regNo):'등록번호 미입력')+'</small></div><button type="button" data-edit="'+escape(r.id)+'">상태·일정 수정</button></div>').join('')||'<div class="empty">등록한 내담자가 없습니다.</div>';
}
function addTraining(value={}){
 const box=document.createElement('div');box.className='training-row';box.dataset.trainingId=value.id||crypto.randomUUID();box.innerHTML='<button type="button" class="remove-training">삭제</button><label>훈련과정명<input class="training-name" maxlength="150" value="'+escape(value.name||'')+'" placeholder="훈련과정명"></label><div class="training-fields"><label>훈련 시작일<input type="date" class="training-start" value="'+escape(validDate(value.start)?value.start:'')+'"></label><label>훈련 종료일<input type="date" class="training-end" value="'+escape(validDate(value.end)?value.end:'')+'"></label></div>';box.querySelector('button').onclick=()=>box.remove();$('trainingRows').append(box);
}
function setCycles(dates){for(let i=0;i<6;i++)$('cycle'+i).value=validDate(dates?.[i])?dates[i]:'';cycleSummary()}
function cycleSummary(){$('dateSummary').textContent='· '+Array.from({length:6},(_,i)=>$('cycle'+i).value).filter(Boolean).length+'개 등록'}
function calculate(){const date=$('iapDate').value;if(!validDate(date)){$('formStatus').textContent='IAP 수립일을 먼저 입력하세요.';return}if($('clientType').value!=='1'){$('formStatus').textContent='Ⅱ유형은 지정일을 자동 계산하지 않습니다. 필요한 실제 날짜를 직접 입력하세요.';return}if(Array.from({length:6},(_,i)=>$('cycle'+i).value).some(Boolean)&&!confirm('입력한 지정일을 수립일 기준으로 다시 계산할까요?'))return;setCycles(Array.from({length:6},(_,i)=>root.PrivatePlanner.monthDate(date,i)));$('formStatus').textContent='표준 주기로 계산했습니다. 변경된 지정일은 실제 날짜로 수정하세요.'}
function openEditor(row){
 if(!loaded||loading||busy){message('자료를 불러온 뒤 다시 시도하세요.',true);return}editing=row||null;$('clientForm').reset();$('trainingRows').innerHTML='';$('formStatus').textContent='';setButtons(false);$('editorTitle').textContent=row?'내담자 일정 수정':'내담자 일정 등록';$('deleteClient').hidden=!row;
 const saved=savedClientIaps(localStorage);$('savedIap').innerHTML='<option value="">직접 입력 / 저장된 등록번호 선택</option>'+saved.map((r,i)=>'<option value="'+i+'">'+escape(r.regNo)+' · '+escape(r.iapDate)+'</option>').join('');
 $('savedIap').onchange=()=>{const n=$('savedIap').value;if(n==='')return;const data=saved[Number(n)];if(!data)return;if((editing||$('personName').value||$('serviceEnd').value||$('trainingRows').children.length)&&!confirm('선택한 IAP의 수립일·만료일·훈련정보로 바꿀까요? 이름은 유지합니다.'))return;$('regNo').value=data.regNo;$('iapDate').value=data.iapDate;$('clientType').value=data.type;$('serviceEnd').value=data.serviceEnd;setCycles(data.type==='1'?Array.from({length:6},(_,i)=>root.PrivatePlanner.monthDate(data.iapDate,i)):[]);$('trainingRows').innerHTML='';data.trainings.forEach(addTraining)};
 if(row){const p=row.payload||{};$('personName').value=p.name||'';$('regNo').value=p.regNo||'';$('iapDate').value=validDate(p.iapDate)?p.iapDate:'';$('clientType').value=p.type||'1';$('serviceEnd').value=validDate(p.serviceEnd)?p.serviceEnd:'';$('memo').value=p.memo||'';setCycles(p.dates||[]);(Array.isArray(p.trainings)?p.trainings:[]).forEach(addTraining)}else setCycles([]);
 $('rediagnosisDate').value=row?.payload?.rediagnosisDate||'';$('clientStatus').value=row?.payload?.clientStatus||'active';$('statusDate').value=row?.payload?.statusDate||keyDate(new Date());$('changeReason').value='';$('lifecycleSection').open=false;$('remainingEvents').innerHTML='';renderLifecycle();$('clientDialog').showModal();
}
function readForm(){
 const name=$('personName').value.trim(),regNo=$('regNo').value.trim(),iapDate=$('iapDate').value,serviceEnd=$('serviceEnd').value,type=$('clientType').value,dates=Array.from({length:6},(_,i)=>$('cycle'+i).value);
 if(!name)throw Error('내담자 이름을 입력하세요.');if([iapDate,serviceEnd,...dates].some(v=>v&&!validDate(v)))throw Error('날짜를 확인하세요.');
 if(regNo&&rows.some(r=>r.id!==editing?.id&&r.payload.regNo===regNo))throw Error('이미 등록한 IAP 번호입니다. 내담자 관리에서 수정하세요.');
 const trainings=[...$('trainingRows').querySelectorAll('.training-row')].map(box=>({id:box.dataset.trainingId,name:box.querySelector('.training-name').value.trim(),start:box.querySelector('.training-start').value,end:box.querySelector('.training-end').value})).filter(t=>t.name||t.start||t.end);
 if(trainings.some(t=>!t.name||!validDate(t.start)||!validDate(t.end)||t.start>t.end))throw Error('훈련과정명과 시작·종료일을 확인하세요.');
 if(!dates.some(Boolean)&&!trainings.length&&!serviceEnd&&!$('rediagnosisDate').value)throw Error('지정일, 훈련일정, 기간만료 예정일 중 하나 이상 입력하세요.');
 const payload={...(editing?.payload||{}),name,regNo,iapDate,serviceEnd,rediagnosisDate:$('rediagnosisDate').value,type,dates,trainings,memo:$('memo').value.trim()};applyLifecycle(payload);if(new TextEncoder().encode(JSON.stringify(payload)).length>=19500)throw Error('변경 이력과 메모의 저장 용량을 초과했습니다. 기존 기록은 유지됩니다. 관리자에게 이력 보관을 요청하세요.');return {kind:'iap',item_date:iapDate||serviceEnd||trainings[0]?.start||dates.find(Boolean)||payload.rediagnosisDate,payload};
}
function draftPayload(){return {...(editing?.payload||{}),name:$('personName').value,dates:Array.from({length:6},(_,i)=>$('cycle'+i).value),serviceEnd:$('serviceEnd').value,rediagnosisDate:$('rediagnosisDate').value,trainings:[...$('trainingRows').querySelectorAll('.training-row')].map(box=>({id:box.dataset.trainingId,name:box.querySelector('.training-name').value,start:box.querySelector('.training-start').value,end:box.querySelector('.training-end').value}))}}
function renderLifecycle(propose=false){
 const cutoff=$('statusDate').value||keyDate(new Date()),status=$('clientStatus').value,payload={...draftPayload(),clientStatus:status,statusDate:cutoff};
 const previous=new Map([...$('remainingEvents').querySelectorAll('[data-event-key]')].map(cb=>[cb.dataset.eventKey,cb.checked]));
 const events=eventsFor([{id:editing?.id||'draft',kind:'iap',payload}],true);
 const candidates=events.filter(e=>e.date>=cutoff||excluded(editing?.payload,e));
 $('remainingEvents').innerHTML=candidates.map(e=>{const checked=propose?(status!=='active'):previous.has(e.key)?previous.get(e.key):excluded(payload,e);return '<label class="lifecycle-event"><input type="checkbox" data-event-key="'+escape(e.key)+'" '+(checked?'checked':'')+'><span>'+escape(root.WorkPeriods.dateLabel(e.date))+' · '+escape(labels[e.kind])+'<small>'+escape(e.detail)+'</small></span></label>'}).join('')||'<p>정리할 남은 일정이 없습니다.</p>';
 $('lifecycleHistory').innerHTML=(Array.isArray(payload.changeHistory)?payload.changeHistory:[]).slice().reverse().map(h=>'<li><strong>'+escape(String(h.at||'').slice(0,10))+' · '+escape(states[h.to]||states.active)+'</strong><div>'+escape(h.reason||'일정 수정')+'</div><small>'+escape(h.summary||'')+'</small>'+((h.changes||[]).map(c=>'<div>'+escape(labels[c.kind]||c.kind)+' · '+escape(c.action)+' · '+escape(c.from||'없음')+' → '+escape(c.to||'없음')+'</div>').join(''))+'</li>').join('')||'<li>변경 이력이 없습니다.</li>';
}
function applyLifecycle(payload){
 const old=editing?.payload||{},next=$('clientStatus').value,date=$('statusDate').value,reason=$('changeReason').value.trim();
 if(!states[next]||!validDate(date)||payload.rediagnosisDate&&!validDate(payload.rediagnosisDate))throw Error('상태 적용일과 재진단 날짜를 확인하세요.');
 payload.clientStatus=next;payload.statusDate=date;payload.eventRules={...(old.eventRules||{})};
 for(const cb of $('remainingEvents').querySelectorAll('[data-event-key]')){const previous=payload.eventRules[cb.dataset.eventKey];const originalEvent=eventsFor([{kind:'iap',payload}],true).find(e=>e.key===cb.dataset.eventKey);const implicit=originalEvent?excluded({...old,clientStatus:next,statusDate:date},originalEvent):false;if((previous&&previous.excluded!==cb.checked)||(!previous&&cb.checked!==implicit))payload.eventRules[cb.dataset.eventKey]={excluded:cb.checked,reason:reason||states[next],at:new Date().toISOString()}}
 const before=eventsFor([{kind:'iap',payload:old}],true),after=eventsFor([{kind:'iap',payload}],true);
 const snapshot=p=>JSON.stringify({state:p.clientStatus||'active',date:p.statusDate||'',rules:p.eventRules||{},events:eventsFor([{kind:'iap',payload:p}],true)});
 if(next!=='active'&&!reason&&!editing)throw Error('상태 변경 사유를 입력하세요.');
 if(editing&&snapshot(old)!==snapshot(payload)){
  if((next!==(old.clientStatus||'active')||((next!=='active'||old.statusDate)&&date!==old.statusDate)||JSON.stringify(old.eventRules||{})!==JSON.stringify(payload.eventRules))&&!reason)throw Error('상태·일정 변경 사유를 입력하세요.');
  const removed=after.filter(e=>excluded(payload,e)).length,changes=[];for(const key of new Set([...before,...after].map(e=>e.key))){const a=before.find(e=>e.key===key),b=after.find(e=>e.key===key),was=a?excluded(old,a):false,now=b?excluded(payload,b):false;if(!a||!b||a.date!==b.date||a.detail!==b.detail||was!==now)changes.push({key,kind:(b||a).kind,from:a?.date||'',to:b?.date||'',action:!b?'일정 제거':now?'제외':was?'복구':a?'일정 변경':'일정 추가'})}
  payload.changeHistory=[...(Array.isArray(old.changeHistory)?old.changeHistory:[]),{at:new Date().toISOString(),by:identity?.id||'',from:old.clientStatus||'active',to:next,effectiveDate:date,reason:reason||'일정 날짜·내용 변경',summary:'전체 '+after.length+'건 중 제외 '+removed+'건',previousEffectiveDate:old.statusDate||'',changes}];
 }
}
async function boot(){
 $('clientStatus').onchange=()=>renderLifecycle(true);$('statusDate').onchange=()=>renderLifecycle(true);$('lifecycleSection').addEventListener('toggle',()=>{if($('lifecycleSection').open)renderLifecycle()});$('restoreEvents').onclick=()=>{$('clientStatus').value='active';renderLifecycle(true);$('changeReason').focus()};$('clientForm').addEventListener('change',e=>{if(!e.target.closest('#lifecycleSection'))renderLifecycle()});
 $('month').value=keyDate(new Date()).slice(0,7);$('cycleFields').innerHTML=Array.from({length:6},(_,i)=>'<label>'+(i+1)+'회차'+(i===0?' · 수립일':' 지정일')+'<input type="date" id="cycle'+i+'"></label>').join('');
 for(let i=0;i<6;i++)$('cycle'+i).onchange=cycleSummary;
 $('filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;paint()}};$('search').oninput=paint;
 $('clientViews').onclick=e=>{const button=e.target.closest('[data-client-view]');if(button){view=button.dataset.clientView;syncPeriodControls();paint()}};
 $('month').onchange=()=>{if(!/^\d{4}-\d{2}$/.test($('month').value)||!validDate($('month').value+'-01'))return;focusDate=$('month').value+'-01';syncPeriodControls();paint()};
 $('clientDay').onchange=()=>{if(!validDate($('clientDay').value))return;focusDate=$('clientDay').value;syncPeriodControls();paint()};
 const move=n=>{focusDate=root.WorkPeriods.shift(focusDate,view,n);syncPeriodControls();paint()};$('prevMonth').onclick=()=>move(-1);$('nextMonth').onclick=()=>move(1);$('thisMonth').onclick=()=>{focusDate=keyDate(new Date());syncPeriodControls();paint()};$('refresh').onclick=()=>load();$('addClient').onclick=()=>openEditor();
 for(const node of [$('timeline'),$('roster')])node.onclick=e=>{const day=e.target.closest('[data-period-day]');if(day){focusDate=day.dataset.periodDay;view='day';syncPeriodControls();paint();return}const b=e.target.closest('[data-edit]');if(b)openEditor(rows.find(r=>r.id===b.dataset.edit))};
 try{const saved=localStorage.getItem('goodjob_clients_view');if(['list','month','week','day'].includes(saved))view=saved}catch{}syncPeriodControls();
 $('addTraining').onclick=()=>addTraining();$('calculateDates').onclick=calculate;$('closeEditor').onclick=$('cancelEditor').onclick=()=>{if(!busy)$('clientDialog').close()};$('clientDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('clientForm').onsubmit=async e=>{e.preventDefault();try{const record=readForm();await mutate(record)}catch(error){$('formStatus').textContent=error.message}};
 $('deleteClient').onclick=async()=>{if(!editing||!confirm('내담자 일정관리에서 삭제할까요? 원본 IAP와 상담 예약은 유지됩니다.'))return;try{await mutate(null)}catch(error){$('formStatus').textContent=error.message}};
 window.addEventListener('pageshow',e=>{if(e.persisted){clearPrivate();authenticate()}});
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
 if(!root.supabase?.createClient){gate('로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');return}
 const remember=()=>{try{return localStorage.getItem('goodjob_schedule_remember_v1')!=='0'}catch{return true}},storage={getItem:key=>{try{return (remember()?localStorage:sessionStorage).getItem(key)}catch{return null}},setItem:(key,value)=>{try{(remember()?localStorage:sessionStorage).setItem(key,value)}catch{}},removeItem:key=>{try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}}};
 client=root.supabase.createClient('https://hnhccnyitrlzqprnredi.supabase.co','sb_publishable_3tzdh4GuDjdx9GX8K9B4dQ_4gUaZAds',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'sb-hnhccnyitrlzqprnredi-auth-token',storage}});
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clearPrivate();gate('로그아웃되었습니다. 상담일정표에서 다시 로그인해 주세요.')}else if(event==='SIGNED_IN')setTimeout(()=>authenticate(),0)});
 document.addEventListener('visibilitychange',async()=>{if(document.visibilityState!=='visible'||busy||$('clientDialog').open)return;const {data}=await client.auth.getSession();if(data?.session?.user.id!==userId){clearPrivate();authenticate()}else load()});
 await authenticate();
}
boot().catch(error=>{clearPrivate();gate('화면을 준비하지 못했습니다: '+error.message)});
})(typeof window==='undefined'?globalThis:window);

