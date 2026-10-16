/* Independent daily checklist; no appointment data is accessed. */
(function(){'use strict';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
let identity=null,client=null,planner=null,authChanged=()=>{},epoch=0;
function clear(){epoch++;identity=null;planner?.reset();planner?.sync();$('taskWorkspace').hidden=true;$('taskIdentity').textContent=''}
function gate(text){$('taskGate').hidden=false;$('taskWorkspace').hidden=true;$('taskGateMessage').textContent=text;$('taskGate').querySelector('h2').textContent='직원 로그인 필요'}
async function authenticate(){const request=++epoch;try{const {data,error}=await client.auth.getSession();if(error)throw error;if(request!==epoch)return;if(!data?.session){clear();gate('상담일정표에서 직원 계정으로 로그인한 뒤 이 화면을 열어주세요.');return}const {data:staff,error:staffError}=await client.rpc('schedule_claim_identity');if(staffError)throw staffError;if(request!==epoch)return;if(!staff?.id||staff.mustChangePassword){clear();gate('상담일정표에서 직원 인증과 비밀번호 변경을 완료해 주세요.');return}identity=staff;$('taskIdentity').textContent=staff.center+' · '+staff.name+'의 할 일';$('taskGate').hidden=true;$('taskWorkspace').hidden=false;planner.sync()}catch(error){if(request!==epoch)return;clear();gate('계정 확인 실패: '+error.message)}}
$('taskDay').value=dateKey(new Date());
planner=window.PrivatePlanner.mount({escape,dateKey,state:()=>({active:!!identity,identity,client,view:'personalDay',date:$('taskDay').value,owner:identity?.name||'',center:identity?.center||'',preview:false,executive:false,shared:false}),focus:date=>{$('taskDay').value=date;planner.sync()},subscribeAuth:fn=>{authChanged=fn}});
$('taskDay').onchange=()=>{if(!window.PrivatePlanner.validDate($('taskDay').value))$('taskDay').value=dateKey(new Date());planner.sync()};
const move=n=>{if(!window.PrivatePlanner.validDate($('taskDay').value))return;const d=new Date($('taskDay').value+'T12:00:00');d.setDate(d.getDate()+n);$('taskDay').value=dateKey(d);planner.sync()};$('taskPrev').onclick=()=>move(-1);$('taskNext').onclick=()=>move(1);$('taskToday').onclick=()=>{$('taskDay').value=dateKey(new Date());planner.sync()};
if(!window.supabase?.createClient){gate('로그인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');return}
const remember=()=>{try{return localStorage.getItem('goodjob_schedule_remember_v1')!=='0'}catch{return true}},storage={getItem:key=>{try{return (remember()?localStorage:sessionStorage).getItem(key)}catch{return null}},setItem:(key,value)=>{try{(remember()?localStorage:sessionStorage).setItem(key,value)}catch{}},removeItem:key=>{try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}}};
client=window.supabase.createClient('https://hnhccnyitrlzqprnredi.supabase.co','sb_publishable_3tzdh4GuDjdx9GX8K9B4dQ_4gUaZAds',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'sb-hnhccnyitrlzqprnredi-auth-token',storage}});
client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();authChanged(event);gate('로그아웃되었습니다. 상담일정표에서 다시 로그인해 주세요.')}else if(event==='SIGNED_IN')setTimeout(()=>authenticate(),0)});
document.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{if(!planner.canLeave()){event.preventDefault();alert('할 일을 저장 중입니다. 저장 완료 후 이동해 주세요.')}}));
window.addEventListener('beforeunload',event=>{if(!planner.canLeave()){event.preventDefault();event.returnValue=''}});
window.addEventListener('pageshow',event=>{if(event.persisted){clear();authenticate()}});
authenticate();
})();
