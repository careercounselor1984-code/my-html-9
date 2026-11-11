/* Read-only personal dates alongside the consultation calendar. */
(()=>{'use strict';
if(new URLSearchParams(location.search).get('mini')==='1')return;
function init(){
 const api=window.GoodJobCalendarWorkspace,calendar=document.getElementById('calendar');
 if(!api||!calendar)return;
 const bar=document.createElement('div');bar.className='calendar-together no-print';bar.hidden=true;
 const title=document.createElement('strong');title.textContent='함께 보기';bar.append(title);
 const checks={};let rows=[],scope='',generation=0,loadedAt=0,loading=false,message='';
 for(const [kind,label] of [['todo','내 할 일'],['iap','내담자 일정']]){
  const wrap=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=false;
  input.onchange=()=>{if(!Object.values(checks).some(x=>x.checked)){generation++;loading=false;rows=[];loadedAt=0;message='';paint()}else refresh(true)};
  checks[kind]=input;wrap.append(input,document.createTextNode(label));bar.append(wrap);
 }
 const status=document.createElement('span');status.className='together-status';status.setAttribute('role','status');bar.append(status);
 calendar.closest('.sheet').querySelector('.sheet-head').after(bar);
 const labels={due:'지정일',trainingStart:'훈련 시작',trainingEnd:'훈련 종료',serviceEnd:'기간만료',jobCertExpire:'구직인증 만료',rediagnosisStart:'재진단 시작',rediagnosisEnd:'재진단 종료',rediagnosis:'재진단 지정일',workStart:'출근 예정',attendanceNotice:'출석통보',custom:'중요일'};
 function snapshot(){return api.snapshot()}
 function eligible(s){return s.authenticated&&!s.team&&!s.aux&&api.togetherScope()}
 function clear(){generation++;rows=[];loadedAt=0;loading=false;message='';scope='';}
 function items(){
  const out=[];
  if(checks.todo.checked)for(const r of rows){const p=r.payload||{};if(r.kind==='todo'&&!p.done&&p.entryType!=='memo'&&window.PrivatePlanner.validDate(p.dueDate))out.push({date:p.dueDate,kind:'todo',text:'할 일 · '+String(p.text||'내용 없음')});}
  if(checks.iap.checked)for(const e of window.ClientTimeline.eventsFor(rows)){out.push({date:e.date,kind:'iap',text:'내담자 · '+e.name+' · '+(labels[e.kind]||e.kind)+(e.detail?' · '+e.detail:'')});}
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
 }
 function box(list){const div=document.createElement('div');div.className='together-items together-added no-print';for(const item of list){const n=document.createElement('div');n.className='together-item together-'+item.kind;n.textContent=item.text;div.append(n);}return div;}
 function paint(){
  calendar.querySelectorAll('.together-added').forEach(n=>n.remove());
  const s=snapshot(),allowed=eligible(s);bar.hidden=!allowed;
  status.textContent=allowed?message:'';
  if(!allowed||!Object.values(checks).some(x=>x.checked))return;
  const all=items(),forDay=date=>all.filter(x=>x.date===date);
  // Date-only items stay above the time slots and never occupy appointment time.
  calendar.querySelectorAll('.desktop-week').forEach((week,index)=>{const head=week.querySelector('thead');if(!head)return;const tr=document.createElement('tr');tr.className='together-added no-print';tr.append(document.createElement('td'));let count=0;
   for(let i=0;i<5;i++){const td=document.createElement('td'),list=forDay(s.dates[index*5+i]);count+=list.length;td.append(box(list));tr.append(td);}if(count)head.append(tr);
  });
  calendar.querySelectorAll('.monthday[data-date]').forEach(day=>{const list=forDay(day.dataset.date);if(list.length)day.append(box(list))});
  calendar.querySelectorAll('.day-agenda').forEach(agenda=>{const date=s.view==='personalDay'?s.date:(agenda.querySelector('.agenda-head strong')?.textContent||'').slice(0,10),list=forDay(date);if(list.length)agenda.querySelector('.agenda-head')?.after(box(list));});
 }
 async function refresh(force=false){
  const s=snapshot(),next=eligible(s);
  if(!next){if(scope)clear();paint();return;}
  if(next!==scope){clear();scope=next;}
  if(!Object.values(checks).some(x=>x.checked)){paint();return;}
  if(loading||!force&&Date.now()-loadedAt<30000){paint();return;}
  const request=++generation;loading=true;message='불러오는 중…';paint();
  try{const result=await api.togetherRows();if(request!==generation||next!==eligible(snapshot()))return;rows=result;loadedAt=Date.now();message='';}
  catch(error){if(request!==generation)return;rows=[];message='불러오지 못했습니다. 체크를 다시 선택해 주세요.';}
  finally{if(request===generation){loading=false;paint();}}
 }
 window.addEventListener('goodjob:mini-update',()=>refresh());
 window.addEventListener('focus',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true)});
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
