/* Independent daily checklist; no appointment data is accessed. */
(function(){'use strict';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
let identity=null,client=null,planner=null,authChanged=()=>{},epoch=0,periodView='day',sessionUserId='',reminders=null,currentFilter='period',suggestionItems=[];
function clear(){epoch++;identity=null;sessionUserId='';reminders?.reset();suggestionItems=[];$('taskSuggestions').hidden=true;planner?.reset();planner?.sync();$('taskWorkspace').hidden=true;$('taskIdentity').textContent=''}
function gate(text){$('taskGate').hidden=false;$('taskWorkspace').hidden=true;$('taskGateMessage').textContent=text;$('taskGate').querySelector('h2').textContent='직원 로그인 필요'}
async function authenticate(){const request=++epoch;try{const {data,error}=await client.auth.getSession();if(error)throw error;if(request!==epoch)return;if(!data?.session){clear();gate('상담일정표에서 직원 계정으로 로그인한 뒤 이 화면을 열어주세요.');return}const {data:staff,error:staffError}=await client.rpc('schedule_claim_identity');if(staffError)throw staffError;if(request!==epoch)return;if(!staff?.id||staff.mustChangePassword){clear();gate('상담일정표에서 직원 인증과 비밀번호 변경을 완료해 주세요.');return}identity=staff;sessionUserId=data.session.user.id;$('taskIdentity').textContent=staff.center+' · '+staff.name+'의 할 일';$('taskGate').hidden=true;$('taskWorkspace').hidden=false;planner.sync();try{const raw=sessionStorage.getItem('goodjob_link_task_draft_v1');if(raw){sessionStorage.removeItem('goodjob_link_task_draft_v1');const draft=JSON.parse(raw);if(Date.now()-draft.at<5*60000&&Date.now()>=draft.at&&draft.owner===staff.name&&draft.center===staff.center&&draft.source?.kind==='schedule')planner.prefillLinked(draft);else $('taskDeviceStatus').textContent='로그인한 계정 또는 작성 시간이 달라 일정 연결 초안이 적용되지 않았습니다.'}}catch{}reminders?.refresh();refreshSuggestions()}catch(error){if(request!==epoch)return;clear();gate('계정 확인 실패: '+error.message)}}
const suggestionKinds={serviceEnd:'기간만료',rediagnosisEnd:'재진단 종료기한',rediagnosisDate:'재진단 지정일',jobCertExpire:'구직인증 만료',due:'구촉수당 지정일'};
async function fetchPrivateKind(kind,uid){let all=[];for(let start=0;start<3000;start+=200){const {data,error}=await client.from('schedule_private_items').select('id,kind,item_date,payload').eq('user_id',uid).eq('kind',kind).order('id').range(start,start+199);if(error)throw error;all.push(...(data||[]));if((data||[]).length<200)break}return all}
async function refreshSuggestions(){
 if(!identity||!client||!sessionUserId)return;
 const token=epoch,uid=sessionUserId,box=$('taskSuggestions'),list=$('suggestionList');
 $('suggestionStatus').textContent='내담자 일정 확인 중…';box.hidden=false;
 try{
  const [clients,tasks]=await Promise.all([fetchPrivateKind('iap',uid),fetchPrivateKind('todo',uid)]);
  if(token!==epoch||uid!==sessionUserId)return;
  const today=dateKey(new Date()),until=window.WorkPeriods.add(today,7),items=[];
  const add=(row,key,date,label)=>{const p=row.payload||{};if(!window.PrivatePlanner.validDate(date)||date<today||date>until)return;
   if(p.eventRules?.[key]?.excluded===true||p.eventChecks?.[key]?.checked&&p.eventChecks[key].date===date)return;
   if(tasks.some(t=>t.payload?.source?.kind==='client'&&t.payload.source.rowId===row.id&&t.payload.source.key===key))return;
   items.push({id:row.id,key,date,text:String(p.name||'이름 미입력')+' · '+label+' 확인',label})};
  for(const row of clients){
   const p=row.payload||{};if(['employed','paused','ended'].includes(p.clientStatus))continue;
   add(row,'serviceEnd',p.serviceEnd,suggestionKinds.serviceEnd);
   add(row,'rediagnosisEnd',p.rediagnosisEnd,suggestionKinds.rediagnosisEnd);
   add(row,'rediagnosis',p.rediagnosisDate,suggestionKinds.rediagnosisDate);
   add(row,'jobCertExpire',p.jobCertExpire,suggestionKinds.jobCertExpire);
   if(p.type==='1')for(let i=1;i<6;i++)add(row,'due:'+(i+1),p.dates?.[i],suggestionKinds.due+' '+(i+1)+'회차');
  }
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.text.localeCompare(b.text,'ko'));
  suggestionItems=items;list.innerHTML=items.length?items.slice(0,8).map((v,i)=>'<div class="task-suggestion-item"><div><strong>'+escape(v.text)+'</strong><small>'+escape(v.date)+' · 원본 내담자 일정</small></div><button type="button" data-suggestion="'+i+'">＋ 할 일</button></div>').join(''):'<p class="task-suggestion-empty">향후 7일에 새로 제안할 미연결 업무가 없습니다.</p>';
  $('suggestionStatus').textContent=items.length>8?'8건 표시 · 전체 '+items.length+'건 (원본 내담자 일정관리에서도 추가 가능)':'확인용 제안 · 담당자 본인 자료';
 }catch(error){if(token!==epoch)return;list.replaceChildren();$('suggestionStatus').textContent='확인 업무 불러오기 실패: '+error.message}
}
async function addSuggestion(button){
 const item=suggestionItems[Number(button.dataset.suggestion)];if(!item||!identity||!sessionUserId)return;
 const text=prompt('할 일 내용을 확인하세요. 취소하면 등록하지 않습니다.',item.text);if(text===null||!text.trim())return;
 const token=epoch,uid=sessionUserId;button.disabled=true;
 try{
  const source={kind:'client',rowId:item.id,key:item.key,date:item.date};
  const payload={text:text.trim(),entryType:'task',dueDate:item.date,done:false,reminderEnabled:false,remindAt:'',source};
  const {error}=await client.from('schedule_private_items').insert({kind:'todo',user_id:uid,item_date:item.date,payload});
  if(error)throw error;if(token!==epoch||uid!==sessionUserId)return;
  await planner.reload();await refreshSuggestions();
 }catch(e){$('suggestionStatus').textContent='업무 등록 실패: '+e.message;button.disabled=false}
}
$('suggestionList').onclick=e=>{const b=e.target.closest('[data-suggestion]');if(b)addSuggestion(b)};
$('suggestionRefresh').onclick=refreshSuggestions;
try{const saved=localStorage.getItem('goodjob_tasks_view');if(['day','week','month'].includes(saved))periodView=saved}catch{}
const settings=document.querySelector('.mobile-settings'),mobile=matchMedia('(max-width:700px)');settings.open=!mobile.matches;mobile.addEventListener('change',()=>{settings.open=!mobile.matches});
$('taskDay').value=dateKey(new Date());
planner=window.PrivatePlanner.mount({escape,dateKey,state:()=>({active:!!identity,identity,client,view:'personalDay',periodView,date:$('taskDay').value,owner:identity?.name||'',center:identity?.center||'',preview:false,executive:false,shared:false}),focus:date=>{$('taskDay').value=date;refreshTaskView()},showDay:date=>{$('taskDay').value=date;periodView='day';refreshTaskView()},onFilter:(value,label)=>{currentFilter=value;$('taskViews').hidden=value!=='period';document.querySelector('.navline').hidden=value!=='period';$('taskRange').textContent=value==='period'?window.WorkPeriods.periodLabel($('taskDay').value,periodView):label+' · 오늘 기준'},remindersEnabled:()=>reminders?.enabled(),subscribeAuth:fn=>{authChanged=fn}});
function refreshTaskView(){if(!window.PrivatePlanner.validDate($('taskDay').value))$('taskDay').value=dateKey(new Date());const date=$('taskDay').value;$('taskWeekday').textContent='('+['일','월','화','수','목','금','토'][new Date(date+'T12:00:00').getDay()]+')';$('taskRange').textContent=window.WorkPeriods.periodLabel(date,periodView);$('taskToday').textContent=periodView==='month'?'이번 달':periodView==='week'?'이번 주':'오늘';$('taskPrev').setAttribute('aria-label','이전 '+(periodView==='month'?'달':periodView==='week'?'주':'날짜'));$('taskNext').setAttribute('aria-label','다음 '+(periodView==='month'?'달':periodView==='week'?'주':'날짜'));document.body.classList.toggle('period-wide',periodView!=='day');document.querySelectorAll('[data-task-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.taskView===periodView)));try{localStorage.setItem('goodjob_tasks_view',periodView)}catch{}planner.sync()}
$('taskViews').onclick=e=>{const button=e.target.closest('[data-task-view]');if(button){periodView=button.dataset.taskView;refreshTaskView()}};
$('taskDay').onchange=refreshTaskView;
const move=n=>{$('taskDay').value=window.WorkPeriods.shift($('taskDay').value,periodView,n);refreshTaskView()};$('taskPrev').onclick=()=>move(-1);$('taskNext').onclick=()=>move(1);$('taskToday').onclick=()=>{$('taskDay').value=dateKey(new Date());refreshTaskView()};
refreshTaskView();
if(!window.supabase?.createClient){gate('로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');return}
const remember=()=>{try{return localStorage.getItem('goodjob_schedule_remember_v1')!=='0'}catch{return false}},storage={getItem:key=>{try{if(!remember())return sessionStorage.getItem(key);const pending=sessionStorage.getItem(key);if(pending!==null){localStorage.setItem(key,pending);if(localStorage.getItem(key)===pending)sessionStorage.removeItem(key);return pending}return localStorage.getItem(key)}catch{try{return sessionStorage.getItem(key)}catch{return null}}},setItem:(key,value)=>{try{(remember()?localStorage:sessionStorage).setItem(key,value)}catch{}},removeItem:key=>{try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}}};
client=window.supabase.createClient('https://hnhccnyitrlzqprnredi.supabase.co','sb_publishable_3tzdh4GuDjdx9GX8K9B4dQ_4gUaZAds',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'sb-hnhccnyitrlzqprnredi-auth-token',storage}});
reminders=window.TaskReminders({client:()=>client,uid:()=>sessionUserId});
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();authChanged(event);gate('로그아웃되었습니다. 상담일정표에서 다시 로그인해 주세요.')}else if(event==='SIGNED_IN')setTimeout(()=>authenticate(),0)});
$('taskDeviceNotify').onclick=()=>reminders.toggle().catch(error=>{$('taskDeviceStatus').textContent=error.message});
document.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{if(!planner.canLeave()){event.preventDefault();alert('할 일을 저장 중입니다. 저장 완료 후 이동해 주세요.')}}));
window.addEventListener('beforeunload',event=>{if(!planner.canLeave()){event.preventDefault();event.returnValue=''}});
window.addEventListener('pageshow',event=>{if(event.persisted){clear();authenticate()}});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='goodjob:open-task'&&typeof event.data.taskId==='string')planner.openTask(event.data.taskId)});
authenticate();
})();

