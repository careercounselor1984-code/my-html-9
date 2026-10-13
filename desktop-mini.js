/* Compact desktop shell. No separate data store or credentials; only the authenticated calendar bridge. */
(()=>{
'use strict';
const bridge=window.goodjobMiniBridge;
if(!bridge)return;
const params=new URLSearchParams(location.search);
const miniMode=params.get('mini')==='1';
const fullUrl=new URL('./index.html',location.href).href;
const miniUrl=new URL('./index.html?mini=1',location.href).href;
function launchMini(){
 const child=window.open(miniUrl,'goodjob_desktop_mini','popup=yes,width=410,height=690,resizable=yes,scrollbars=yes');
 if(child)child.focus();
 else location.assign(miniUrl);
}
if(!miniMode){
 const target=document.querySelector('#mobileCloudActions');
 if(target){
  const btn=document.createElement('button');
  btn.id='desktopMiniLaunch';btn.type='button';btn.textContent='▣ 미니 일정표';
  btn.title='작은 창으로 내 상담 일정표 열기';
  btn.addEventListener('click',launchMini);
  target.prepend(btn);
  const quick=document.querySelector('#quickEntryOpen');
  if(quick){const launcher=btn.cloneNode(true);launcher.id='desktopMiniToolbar';launcher.addEventListener('click',launchMini);quick.insertAdjacentElement('afterend',launcher)}
 }
 return;
}
const root=document.createElement('section');
root.id='desktopMiniRoot';root.className='hide';
root.setAttribute('aria-label','좋은일자리 PC 미니 일정표');
root.innerHTML=`<header class="mini-header">
 <div><span class="mini-kicker">좋은일자리 · 상담 일정관리</span><h1 class="mini-heading" id="miniHeading">내 상담 일정</h1></div>
 <div class="mini-actions"><button type="button" id="miniPin" title="크롬 지원 환경에서 설치 없이 화면 위에 고정">항상 위에</button><button type="button" id="miniRefresh" title="서버에서 새 일정 불러오기">↻ 동기화</button><button type="button" id="miniFull" title="전체 일정표를 새 창에서 열기">전체 ↗</button></div>
 </header>
 <p class="mini-user" id="miniUser"></p>
 <div class="mini-arrival-banner" id="miniArrivalInbox" hidden><strong id="miniArrivalTitle"></strong>
  <button id="miniArrivalAck" type="button">확인</button></div>
 <div class="mini-view-controls" role="group" aria-label="조회할 상담사 범위">
  <button type="button" id="miniMine" aria-pressed="true">내 일정</button>
  <button type="button" id="miniCenter" aria-pressed="false">우리 센터 전체</button>
 </div>
 <div class="mini-window-controls" id="miniWindowControls" hidden>
  <div class="mini-window-buttons" role="group" aria-label="조회 시간 범위">
   <button type="button" id="miniNear" aria-pressed="true">현재 시간 주변</button>
   <button type="button" id="miniWhole" aria-pressed="false">하루 전체</button>
  </div>
  <small id="miniWindowLabel">현재 기준 1시간 전 ~ 2시간 후</small>
 </div>
 <nav class="mini-toolbar" aria-label="일정 날짜 이동">
  <button id="miniPrev" type="button" aria-label="이전 날짜">‹</button>
  <div><strong id="miniDate"></strong><small id="miniDayLabel"></small></div>
  <button id="miniToday" type="button">오늘</button><button id="miniNext" type="button" aria-label="다음 날짜">›</button>
 </nav>
 <section class="mini-card">
  <div class="mini-card-top"><h2>예약 · 근무 일정</h2><span class="mini-count" id="miniCount"></span></div>
  <div class="mini-events" id="miniEvents" aria-live="polite"></div>
 </section>
 <div class="mini-footer"><button id="miniAddWork" type="button">＋ 근무 일정</button><button id="miniAdd" class="mini-primary" type="button">＋ 빠른 상담등록</button></div>
 <div class="mini-sync" id="miniSync" role="status" aria-live="polite"></div>
 <p class="mini-note" id="miniNote">별도 PC앱 설치 불필요 · 서버 자동 동기화</p>`;
document.body.appendChild(root);
const dlg=document.createElement('dialog');
dlg.id='desktopMiniQuick';
dlg.setAttribute('aria-label','빠른 상담등록');
dlg.innerHTML=`<form class="mini-dialog-form" id="miniForm">
 <h2>빠른 상담등록</h2>
 <p>기존 상담 일정표에 바로 저장됩니다. 상담 구분은 ‘초기, 해석, IAP, 재진단’ 등으로 입력하세요.</p>
 <label>내담자 이름 + 상담 구분<input id="miniText" placeholder="홍길동 초기" maxlength="110" autocomplete="off" required></label>
 <label>상담 날짜<input id="miniFormDate" type="date" required></label>
 <label>상담 시작 시간<select id="miniFormTime" required></select></label>
 <p id="miniFormStatus" class="mini-dialog-status" role="status"></p>
 <div class="mini-dialog-buttons"><button type="button" id="miniCancel">취소</button><button class="primary" id="miniSave" type="submit">바로 등록</button></div>
</form>`;
document.body.appendChild(dlg);
let pipWindow=null;
const $=id=>(pipWindow&&!pipWindow.closed?pipWindow.document.getElementById(id):null)||document.getElementById(id);
function pipActive(){return !!pipWindow&&!pipWindow.closed}
function restoreMini(){
 window.goodjobMiniPiPActive=false;
 pipWindow=null;
 if(!document.body)return;
 if(root.ownerDocument!==document)document.body.appendChild(root);
 if(dlg.ownerDocument!==document)document.body.appendChild(dlg);
 $('miniPin').textContent='항상 위에';
 $('miniPin').setAttribute('aria-pressed','false');
 $('miniNote').textContent='별도 PC앱 설치 불필요 · 서버 자동 동기화';
 render();
}
function focusEditor(action){
 if(pipActive())pipWindow.close();
 window.focus();
 action();
}
async function toggleAlwaysOnTop(){
 if(pipActive()){pipWindow.close();return}
 if(!window.isSecureContext||!window.documentPictureInPicture){
  $('miniSync').textContent='이 크롬에서는 항상 위 기능을 사용할 수 없습니다. 미니창을 이용해 주세요.';
  return;
 }
 // requestWindow must be called directly from the click handler's user activation.
 let opened;
 try{
  opened=await window.documentPictureInPicture.requestWindow({width:420,height:660});
  pipWindow=opened;
  opened.document.documentElement.classList.add('desktop-mini');
  const viewport=opened.document.createElement('meta');
  viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';
  opened.document.head.appendChild(viewport);
  opened.document.title='좋은일자리 · 화면 위 일정';
  const link=opened.document.createElement('link');
  link.rel='stylesheet';link.href=new URL('./desktop-mini.css',location.href).href;
  opened.document.head.appendChild(link);
  opened.document.body.append(root,dlg);
  opened.addEventListener('pagehide',restoreMini,{once:true});
  window.goodjobMiniPiPActive=true;
  $('miniPin').textContent='고정 해제';
  $('miniPin').setAttribute('aria-pressed','true');
  $('miniNote').textContent='항상 위 표시 중 · 원래 미니창을 닫으면 함께 종료됩니다.';
  render();
  // The initiating browser window can be hidden behind other applications.
  // Keep its existing sync loop active while the always-on-top view is visible.
  bridge.refresh().catch(()=>{});
 }catch(err){
  if(opened&&!opened.closed)opened.close();
  restoreMini();
  $('miniSync').textContent='화면 위 표시 실패: '+(err?.message||String(err));
  $('miniSync').classList.add('error');
 }
}

const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
let selectedDate=today(),followsToday=true,lastToday=selectedDate,refreshing=false,saving=false;
let miniScope='mine',miniRange='near';
let arrivalsByEvent=new Map(),arrivalNamesByEvent=new Map(),arrivalBusy=false,arrivalLast=0;
function changeDay(offset){
 const p=selectedDate.split('-').map(Number);
 const d=new Date(p[0],p[1]-1,p[2]+offset);
 selectedDate=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 followsToday=false;render();
}
function eventType(e){
 if(['연차','반차','2시간 연차','반반차'].includes(e.type))return 'leave';
 return ['초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'].includes(e.type)?'consult':'work';
}
function createEventButton(e){
 const readonly=!!e.readonly;
 const el=document.createElement(readonly?'div':'button');
 if(!readonly)el.type='button';
 const kind=e.kind==='consult'?'consult':eventType(e);
 el.className='mini-event'+(kind==='consult'?'':' '+kind)+(readonly?' readonly':'');
 el.title=readonly?'다른 상담사의 일정 · 조회 전용':'클릭하여 일정 수정';
 const time=document.createElement('span');time.className='mini-event-time';time.textContent=e.allDay?'종일':(e.time||'09:00');
 const main=document.createElement('span');main.className='mini-event-main';
 const name=document.createElement('b');
 // Other counselors' titles are masked in the general schedule snapshot.
 // Display the unmasked client name ONLY for today's center arrival workflow.
 const clientName=miniScope==='center'&&kind==='consult'&&e.date===today()
   ?arrivalNamesByEvent.get(e.arrivalEventId):'';
 const title=clientName||e.title||e.type||'일정';
 name.textContent=(miniScope==='center'?(e.owner+' · '):'')+title;
 const desc=document.createElement('small');desc.textContent=(e.type||'근무 일정')+(e.allDay?' · 종일':e.end?' · '+e.end:'')+(readonly?' · 조회만 가능':'');
 main.append(name,desc);el.append(time,main);
 if(!readonly&&e.id)el.addEventListener('click',()=>focusEditor(()=>bridge.edit(e.id)));
 if(miniScope==='center'&&e.kind==='consult'&&e.date===today()&&e.arrivalEventId){
  const wrapper=document.createElement('div');wrapper.className='mini-item-row';
  wrapper.appendChild(el);
  const arrival=arrivalsByEvent.get(e.arrivalEventId);
  const check=document.createElement('button');check.type='button';
  check.className='mini-arrival'+(arrival?' done':'');
  check.textContent=arrival?'도착 '+arrival.arrivedAt:'도착';
  check.title=arrival?('도착 확인: '+arrival.markedBy):(title+' 내담자 도착 확인 · 담당: '+e.owner);
  check.disabled=!!arrival||arrivalBusy;
  if(!arrival)check.addEventListener('click',async()=>{
   if(!confirm(e.owner+' 상담사의 '+e.time+' · '+title+' 내담자가 도착했나요?'))return;
   if(arrivalBusy)return;arrivalBusy=true;check.disabled=true;check.textContent='처리 중';
   try{
    const out=await bridge.markArrival(e.arrivalEventId);
    if(out?.ok){await refreshArrivals(true);render()}
   }catch(err){alert('도착 처리 실패: '+(err?.message||String(err)))}
   finally{arrivalBusy=false;render()}
  });
  wrapper.appendChild(check);return wrapper;
 }
 return el;
}
async function refreshArrivals(force=false){
 if(miniScope!=='center'&&!force)return;
 const now=Date.now();
 if(!force&&now-arrivalLast<24000)return;
 arrivalLast=now;
 try{
  // Keep the ordinary shared schedule masked; names come from a separately authorized, date-limited RPC.
  const [items,names]=await Promise.all([bridge.arrivals(),bridge.arrivalNames()]);
  arrivalsByEvent=new Map(items.map(x=>[x.eventId,x]));
  arrivalNamesByEvent=new Map(names.filter(x=>typeof x.eventId==='string'&&typeof x.title==='string').map(x=>[x.eventId,x.title]));
  render();
 }catch(err){console.warn('도착 현황 갱신 지연',err?.message||err)}
}
function eventStartMinutes(e){const parts=String(e.time||'09:00').split(':').map(Number);return parts[0]*60+parts[1]}
function inTimeWindow(e,nowMinutes){
 if(e.allDay)return true;
 const start=eventStartMinutes(e);
 const finish=/^\d\d:\d\d$/.test(e.end||'')?Number(e.end.slice(0,2))*60+Number(e.end.slice(3)):start+30;
 return start<nowMinutes+120&&Math.max(start+1,finish)>nowMinutes-60;
}

function render(){
 const snap=bridge.snapshot();
 const gate=$('cloudGate');
 const online=!!snap.active;
 root.classList.toggle('hide',!online);
 if(gate)gate.classList.toggle('hide',online);
 if(!online){if(pipActive())pipWindow.close();return}
 $('miniUser').textContent=snap.center+' · '+snap.name;
 const inbox=typeof bridge.arrivalInbox==='function'?bridge.arrivalInbox():[];
 const inboxPanel=$('miniArrivalInbox');
 inboxPanel.hidden=!inbox.length;
 if(inbox.length)$('miniArrivalTitle').textContent=inbox.length>1?inbox.length+'건의 내담자 도착 알림 · '+inbox[0].title:inbox[0].title;
 const chunks=selectedDate.split('-').map(Number);
 const d=new Date(chunks[0],chunks[1]-1,chunks[2]);
 $('miniDate').textContent=(d.getMonth()+1)+'월 '+d.getDate()+'일 '+['일','월','화','수','목','금','토'][d.getDay()]+'요일';
 $('miniDayLabel').textContent=followsToday?'오늘 일정 · 자동 날짜 변경':'선택한 날짜의 일정';
 const currentDay=selectedDate===today();
 $('miniHeading').textContent=miniScope==='center'?'우리 센터 일정':'내 상담 일정';
 $('miniMine').setAttribute('aria-pressed',String(miniScope==='mine'));
 $('miniCenter').setAttribute('aria-pressed',String(miniScope==='center'));
 $('miniWindowControls').hidden=miniScope!=='center';
 $('miniNear').setAttribute('aria-pressed',String(miniRange==='near'));
 $('miniWhole').setAttribute('aria-pressed',String(miniRange==='whole'));
 $('miniNear').disabled=!currentDay;
 $('miniWindowLabel').textContent=!currentDay?'다른 날짜는 하루 전체 일정으로 표시합니다.':
  miniRange==='near'?'현재 기준 1시간 전 ~ 2시간 후':'오늘 전체 시간대';
 let events=(miniScope==='center'?snap.teamEvents:snap.events)||[];
 events=events.filter(e=>e.date===selectedDate);
 if(miniScope==='center'&&currentDay&&miniRange==='near'){
  const now=new Date(),nowMinutes=now.getHours()*60+now.getMinutes();
  events=events.filter(e=>inTimeWindow(e,nowMinutes));
 }
 events.sort((a,b)=>(a.allDay?'00:00':a.time||'09:00').localeCompare(b.allDay?'00:00':b.time||'09:00')||String(a.owner||'').localeCompare(String(b.owner||''),'ko'));
 $('miniCount').textContent=events.length+'건';
 const container=$('miniEvents');container.replaceChildren();
 if(!events.length){
  const empty=document.createElement('p');empty.className='mini-empty';empty.textContent=miniScope==='center'?'해당 시간대에 우리 센터 일정이 없습니다.\n하루 전체 보기로 다른 시간도 확인할 수 있어요.':'등록된 일정이 없습니다.\n＋ 빠른 상담등록으로 일정을 추가해 보세요.';
  empty.style.whiteSpace='pre-line';container.appendChild(empty);
 }else events.forEach(e=>container.appendChild(createEventButton(e)));
 $('miniSync').textContent=snap.sync||'일정 연결 상태 확인 중';
 $('miniSync').classList.toggle('error',!!snap.error);
}
function availableTimes(){
 const date=$('miniFormDate').value;
 const choices=bridge.times(date);
 const previous=$('miniFormTime').value;
 const sel=$('miniFormTime');sel.replaceChildren();
 if(!choices.length){
  const o=document.createElement('option');o.value='';o.textContent='등록 가능한 시간이 없습니다';sel.append(o);return;
 }
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='시간 선택';sel.append(placeholder);
 for(const t of choices){const o=document.createElement('option');o.value=t;o.textContent=t;sel.append(o)}
 if(choices.includes(previous))sel.value=previous;
}
function openQuick(){
 if(!bridge.snapshot().active)return;
 $('miniForm').reset();
 $('miniFormDate').value=selectedDate;
 $('miniFormStatus').textContent='';
 availableTimes();dlg.showModal();
 $('miniText').focus();
}
$('miniMine').addEventListener('click',()=>{miniScope='mine';render()});
$('miniCenter').addEventListener('click',()=>{miniScope='center';miniRange='near';render();refreshArrivals(true)});
$('miniArrivalAck').addEventListener('click',async()=>{
 const inbox=bridge.arrivalInbox();
 try{await bridge.ackArrivals(inbox.map(x=>x.key));render()}catch(e){alert('알림 확인 실패: '+(e?.message||String(e)))}
});
$('miniNear').addEventListener('click',()=>{miniRange='near';render()});
$('miniWhole').addEventListener('click',()=>{miniRange='whole';render()});
$('miniPrev').addEventListener('click',()=>changeDay(-1));
$('miniNext').addEventListener('click',()=>changeDay(1));
$('miniToday').addEventListener('click',()=>{selectedDate=today();followsToday=true;render()});
$('miniRefresh').addEventListener('click',async()=>{
 if(refreshing)return;
 refreshing=true;$('miniRefresh').disabled=true;
 try{await bridge.refresh()}catch(e){$('miniSync').textContent='동기화 실패 · '+(e.message||String(e));$('miniSync').classList.add('error')}
 finally{refreshing=false;$('miniRefresh').disabled=false;render()}
});
$('miniPin').addEventListener('click',toggleAlwaysOnTop);
if(!window.isSecureContext||!window.documentPictureInPicture)$('miniPin').hidden=true;
$('miniFull').addEventListener('click',()=>{window.open(fullUrl,'_blank','noopener')});
$('miniAdd').addEventListener('click',openQuick);
$('miniAddWork').addEventListener('click',()=>focusEditor(()=>bridge.addWork(selectedDate)));
$('miniCancel').addEventListener('click',()=>dlg.close());
$('miniFormDate').addEventListener('change',availableTimes);
$('miniForm').addEventListener('submit',async e=>{
 e.preventDefault();if(saving)return;
 const text=$('miniText').value, date=$('miniFormDate').value,time=$('miniFormTime').value;
 const btn=$('miniSave');saving=true;btn.disabled=true;btn.textContent='등록 중…';$('miniFormStatus').textContent='';
 try{
  const result=await bridge.reserve(date,time,text);
  if(result.ok){dlg.close();selectedDate=date;followsToday=(date===today());render()}
  else{$('miniFormStatus').textContent=result.message||'등록을 완료하지 못했습니다';if(result.detailOpen){dlg.close();focusEditor(()=>{})}availableTimes()}
 }catch(err){$('miniFormStatus').textContent='등록 실패: '+(err?.message||String(err))}
 finally{saving=false;btn.disabled=false;btn.textContent='바로 등록'}
});
window.addEventListener('goodjob:mini-update',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden||pipActive())render()});
setInterval(()=>{const now=today();if(now!==lastToday){lastToday=now;if(followsToday)selectedDate=now}render();refreshArrivals()},30000);
render();
})();