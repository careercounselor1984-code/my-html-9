/* One center, one authenticated schedule identity. No card data is persisted on PC. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),feedMode=params.get('mode')==='feed',journal=params.get('journal')==='1';
 const ORIGIN='https://careercounselor1984-code.github.io';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={memo:'공유 메모',notice:'공지',request:'인원 취합'},priorities={normal:'일반',important:'중요',urgent:'긴급'};
 const training=window.CenterBoardTraining,categories=training.categories,education=new Set();
 const norm=s=>String(s||'').replace(/\s/g,'');
 const date=s=>s?new Date(s).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'';
 let identity=null,sessionUserId='',epoch=0,expectedName='',linked=!journal,filter='open',cards=[],responses=[],people=[],selected=null,editing=null,busy=false,offset=0,total=0,hasMore=false,loading=false,client;
 document.body.classList.toggle('feed-mode',feedMode);
 const status=(message,error=false,id='status')=>{$(id).textContent=message;$(id).classList.toggle('error',error);resize()};
 function resize(){if(feedMode&&window.parent!==window)window.parent.postMessage({type:'goodjob:center-board-height',height:Math.min(260,Math.max(40,document.querySelector('main').getBoundingClientRect().height))},ORIGIN)}
 function tellParent(message){if(window.parent!==window)window.parent.postMessage(message,ORIGIN)}
 function clear(){education.clear();epoch++;identity=null;sessionUserId='';cards=[];responses=[];people=[];selected=null;editing=null;for(const id of ['cards','feed','responses','detailTools'])$(id).replaceChildren();for(const id of ['detailBody','detailTitle','detailMeta','detailStatus','composeStatus','identity'])$(id).textContent='';$('workspace').hidden=true;$('gate').hidden=false;$('detail').close();$('compose').close();$('cardForm').reset();$('respondForm').reset();resize()}
 async function call(action,payload={}){
  if(!identity||!linked)throw Error('직원 로그인 후 이용해 주세요.');
  const request=epoch;
  const {data,error}=await client.functions.invoke('center-board',{body:{action,...payload}});
  if(request!==epoch||!identity)throw Error('계정이 변경되었습니다. 다시 열어주세요.');
  if(error){let msg=error.message;try{msg=(await error.context.json()).error||msg}catch{}throw Error(msg)}
  if(!data?.ok)throw Error(data?.error||'저장 결과를 확인하지 못했습니다.');
  return data;
 }
 async function authenticate(){
  if(!linked)return;
  clear();const request=epoch;
  status('직원 계정을 확인하고 있습니다.');
  try{
   const session=await client.auth.getSession();if(session.error)throw session.error;
   if(!session.data?.session)throw Error('상담일정표에서 직원 계정으로 로그인해 주세요.');
   const result=await client.rpc('schedule_claim_identity');if(result.error)throw result.error;
   if(request!==epoch)return;
   if(!result.data?.id||result.data.mustChangePassword)throw Error('상담일정표에서 직원 인증과 비밀번호 변경을 완료해 주세요.');
   if(journal&&(!expectedName||norm(expectedName)!==norm(result.data.name)))throw Error('통합본과 일정표의 직원 계정이 다릅니다. 같은 직원으로 로그인해 주세요.');
   identity=result.data;sessionUserId=session.data.session.user.id;$('identity').textContent=identity.center+' · '+identity.name;$('gate').hidden=true;$('workspace').hidden=false;$('full').hidden=feedMode;$('feed').hidden=!feedMode;
   loading=false;await load();
   const id=params.get('card');if(id&&!feedMode)await openDetail(id);
  }catch(error){if(request!==epoch)return;clear();status(error.message,true)}
 }
 function myResponse(card){return responses.find(r=>r.card_id===card.id&&r.staff_id===identity?.id)}
 function cardResponses(card){return responses.filter(r=>r.card_id===card.id)}
 function progress(card){const rows=cardResponses(card),active=people.filter(p=>p.managed_in_schedule||rows.some(r=>r.staff_id===p.id));return {rows,active,submitted:active.filter(p=>rows.some(r=>r.staff_id===p.id)).length,total:rows.reduce((n,r)=>n+(r.quantity??0),0)}}
 function render(){
  if(feedMode){
   $('feed').innerHTML='<div class="feed-heading"><strong>'+escape(identity.center)+' · '+(cards.length?'챙길 업무 '+cards.length+'건':'센터 업무')+'</strong><button type="button" data-open="">센터 게시판 열기 →</button></div>'+cards.slice(0,2).map(c=>'<button type="button" class="feed-card '+escape(c.priority)+'" data-open="'+escape(c.id)+'"><b>'+escape(c.kind==='request'?'미제출':priorities[c.priority])+'</b><strong>'+escape(c.title)+'</strong><span>'+(c.deadline?'마감 '+escape(date(c.deadline)):'내용 확인')+'</span> →</button>').join('');
   resize();return;
  }
  $('summary').textContent='총 '+total+'개 · '+cards.length+'개 표시';$('more').hidden=!hasMore;
  $('cards').innerHTML=cards.length?cards.map(c=>{const p=progress(c),mine=myResponse(c);return '<div class="card-entry">'+(c.category==='case'?'<label class="check case-select"><input type="checkbox" data-case-select="'+escape(c.id)+'"'+(education.has(c.id)?' checked':'')+'>교육자료에 선택</label>':'')+'<button type="button" class="card '+escape(c.priority)+(c.pinned?' pinned':'')+'" data-card="'+escape(c.id)+'"><div class="tags">'+(c.pinned?'<span class="tag">📌 고정</span>':'')+'<span class="tag category-tag">'+escape(categories[c.category]||categories.general)+'</span><span class="tag">'+escape(names[c.kind])+'</span><span class="tag">'+escape(c.status==='done'?'완료':priorities[c.priority])+'</span></div><strong>'+escape(c.title)+'</strong><span class="card-preview">'+escape(c.content)+'</span><small>'+(c.kind==='request'?'합계 '+p.total+'명 · '+p.submitted+'/'+p.active.length+'명 제출 · '+(mine?'내 제출 완료':'내 답변 미제출'):'답변 '+p.rows.length+'개')+(c.deadline?'<br>마감 '+escape(date(c.deadline)):'')+'</small></button></div>'}).join(''):'<p class="empty">'+($('search').value.trim()?'검색 결과가 없습니다.':'등록된 카드가 없습니다. 필요한 내용을 새 카드로 남겨보세요.')+'</p>';
 }
 function renderTraining(){const cases=cards.filter(c=>c.category==='case');for(const id of education)if(!cases.some(c=>c.id===id))education.delete(id);$('trainingTools').hidden=!cases.length&&$('categoryFilter').value!=='case';$('trainingPrint').textContent='선택 사례 교육자료로 모으기 ('+education.size+')';$('trainingPrint').disabled=!education.size;$('selectCases').checked=cases.length>0&&cases.every(c=>education.has(c.id));$('selectCases').indeterminate=education.size>0&&!$('selectCases').checked;}
 async function load(append=false){
  if(!identity||loading)return;loading=true;const request=epoch;status('불러오는 중…');
  try{
   const result=await call(feedMode?'feed':'list',{filter,category:$('categoryFilter').value,search:$('search').value,offset:append?offset:0});
   if(request!==epoch)return;
   if(result.identity.id!==identity.id)throw Error('직원 계정이 변경되었습니다. 다시 연결해 주세요.');
   cards=append?[...cards,...result.cards]:result.cards;responses=append?[...responses,...result.responses]:result.responses;people=result.people;total=result.total;hasMore=result.hasMore;offset=result.offset+result.cards.length;
   if(!append)education.clear();render();if(!feedMode)renderTraining();status('');
  }catch(error){if(request===epoch)status('게시판 갱신 실패: '+error.message,true)}finally{if(request===epoch)loading=false}
 }
 async function openDetail(id){
  try{
   const result=await call('detail',{id});selected=result.card;responses=responses.filter(r=>r.card_id!==id).concat(result.responses);people=result.people;
   const c=selected,p=progress(c),mine=myResponse(c),author=people.find(s=>s.id===c.created_by)?.display_name||'이전 직원';
   $('detailTitle').textContent=c.title;$('detailMeta').textContent=(categories[c.category]||categories.general)+' · '+names[c.kind]+' · '+priorities[c.priority]+' · '+(c.status==='done'?'완료·보관':'진행 중')+' · '+author+' · 수정 '+date(c.updated_at)+(c.deadline?' · 마감 '+date(c.deadline):'');$('detailBody').textContent=c.content;
   $('detailTools').replaceChildren();
   if(result.canManage){const edit=document.createElement('button');edit.type='button';edit.textContent='카드 수정·완료 처리';edit.onclick=()=>compose(c);$('detailTools').append(edit);if(c.priority!=='normal'&&c.status==='open'){const retry=document.createElement('button');retry.type='button';retry.textContent='PC 알림 전송 확인';retry.onclick=()=>mutate(async()=>{const r=await call('notify',{id:c.id});status('알림 전송 '+r.sent+'건'+(r.failed?' · 일부 기기는 다시 시도해 주세요.':' · 이미 전송한 기기에는 중복 발송하지 않습니다.'),false,'detailStatus')});$('detailTools').append(retry)}}
   if(c.priority!=='normal'&&c.kind!=='request'&&c.status==='open'){const ack=document.createElement('button');ack.type='button';ack.textContent='확인 완료 · 메뉴 안내 숨기기';ack.onclick=()=>mutate(async()=>{await call('ack',{id:c.id,revision:c.revision});status('확인했습니다. 카드는 게시판에 계속 남습니다.',false,'detailStatus');tellParent({type:'goodjob:center-board-refresh'})});$('detailTools').append(ack)}
   if(c.kind==='request'){
    const rows=[...p.active,...people.filter(s=>!p.active.some(a=>a.id===s.id)&&p.rows.some(r=>r.staff_id===s.id))];
    const old=p.rows.filter(r=>!people.some(s=>s.id===r.staff_id));
    $('responses').innerHTML='<h3>합계 '+p.total+'명 · '+p.submitted+'/'+p.active.length+'명 제출</h3><table class="response-table"><thead><tr><th>상담사</th><th>취업자 수</th><th>내용 · 수정 시각</th></tr></thead><tbody>'+rows.map(s=>{const r=p.rows.find(x=>x.staff_id===s.id);return '<tr><td>'+escape(s.display_name)+'</td><td>'+(r?r.quantity+'명':'미제출')+'</td><td>'+escape(r?.content||'')+(r?'<br><small>'+escape(date(r.updated_at))+'</small>':'')+'</td></tr>'}).join('')+old.map(r=>'<tr><td>이전 직원</td><td>'+r.quantity+'명</td><td>'+escape(r.content)+'</td></tr>').join('')+'</tbody></table>';
   }else $('responses').innerHTML='<h3>상담사별 답변 '+p.rows.length+'개</h3>'+p.rows.map(r=>'<article class="response-item"><strong>'+escape(people.find(s=>s.id===r.staff_id)?.display_name||'이전 직원')+'</strong> <small>'+escape(date(r.updated_at))+'</small><p>'+escape(r.content)+'</p></article>').join('');
   $('respondForm').hidden=c.status!=='open';$('quantityLabel').hidden=c.kind!=='request';$('quantity').required=c.kind==='request';$('quantity').value=mine?.quantity??'';$('responseContent').value=mine?.content||'';$('respondTitle').textContent=mine?'내 답변 수정':'내 답변';status('',false,'detailStatus');
   if(!$('detail').open)$('detail').showModal();
  }catch(error){status(error.message,true)}
 }
 const localTime=s=>{if(!s)return '';const d=new Date(s);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
 function compose(card){editing=card||null;$('cardForm').reset();$('composeTitle').textContent=card?'카드 수정':'새 카드';$('title').value=card?.title||'';$('content').value=card?.content||'';$('kind').value=card?.kind||'memo';$('kind').disabled=!!card;$('category').value=card?.category||($('categoryFilter').value==='all'?'general':$('categoryFilter').value);categoryChanged(!card);$('priority').value=card?.priority||'normal';$('cardStatus').value=card?.status||'open';$('pinned').checked=!!card?.pinned;$('deadline').value=localTime(card?.deadline);$('expires').value=localTime(card?.expires_at);status('',false,'composeStatus');$('compose').showModal()}
 async function mutate(fn){if(busy)return;busy=true;document.querySelectorAll('dialog button').forEach(b=>b.disabled=true);try{await fn()}catch(error){status(error.message,true,$('compose').open?'composeStatus':'detailStatus')}finally{busy=false;document.querySelectorAll('dialog button').forEach(b=>b.disabled=false)}}
 $('cardForm').onsubmit=e=>{e.preventDefault();mutate(async()=>{
  const result=await call('save',{id:editing?.id,revision:editing?.revision,title:$('title').value,content:$('content').value,kind:$('kind').value,category:$('category').value,priority:$('priority').value,pinned:$('pinned').checked,status:$('cardStatus').value,deadline:$('deadline').value?new Date($('deadline').value).toISOString():null,expires_at:$('expires').value?new Date($('expires').value).toISOString():null});
  $('compose').close();$('detail').close();await load();await openDetail(result.card.id);tellParent({type:'goodjob:center-board-refresh'});
  if(result.card.priority!=='normal'&&result.card.status==='open'){try{const r=await call('notify',{id:result.card.id});status('카드 저장 완료 · PC 알림 전송 '+r.sent+'건'+(r.failed?' · 일부 기기 전송 실패':''),!!r.failed,'detailStatus')}catch(error){status('카드는 저장됐습니다. PC 알림 전송은 다시 시도해 주세요: '+error.message,true,'detailStatus')}}else status('카드를 저장했습니다.',false,'detailStatus');
 })};
 $('respondForm').onsubmit=e=>{e.preventDefault();mutate(async()=>{if(!selected)return;const id=selected.id;await call('respond',{id,quantity:$('quantity').value===''?null:Number($('quantity').value),content:$('responseContent').value});await load();await openDetail(id);status('내 답변을 저장했습니다.',false,'detailStatus');tellParent({type:'goodjob:center-board-refresh'})})};
 function categoryChanged(fill=true){const isCase=$('category').value==='case';$('caseTemplateTools').hidden=!isCase;if(fill&&!editing){$('kind').value=isCase?'memo':(['employment','company','center'].includes($('category').value)?'notice':$('kind').value);if(isCase&&!$('content').value.trim())$('content').value=training.template;}}
 $('category').onchange=()=>categoryChanged();$('caseTemplate').onclick=()=>{if(!$('content').value.trim()||confirm('현재 내용을 사례 양식으로 바꿀까요?'))$('content').value=training.template;};
 $('categoryFilter').onchange=()=>{if(!loading)load()};$('showCases').onclick=()=>{if(loading)return;$('categoryFilter').value='case';filter='all';document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter==='all')));load();};
 $('cards').addEventListener('change',e=>{const checkbox=e.target.closest('[data-case-select]');if(!checkbox)return;if(checkbox.checked)education.add(checkbox.dataset.caseSelect);else education.delete(checkbox.dataset.caseSelect);renderTraining();});
 $('selectCases').onchange=()=>{const checked=$('selectCases').checked;cards.filter(c=>c.category==='case').forEach(c=>{if(checked)education.add(c.id);else education.delete(c.id)});render();renderTraining();};
 $('trainingPrint').onclick=()=>{if(!identity||!education.size)return;const items=cards.filter(c=>c.category==='case'&&education.has(c.id));const win=window.open('','_blank');if(!win){status('교육자료 창이 차단되었습니다. 팝업을 허용한 뒤 다시 눌러 주세요.',true);return}win.opener=null;win.document.open();win.document.write(training.html(identity.center,items));win.document.close();};
 $('newCard').onclick=()=>compose();$('detailClose').onclick=()=>{if(!busy)$('detail').close()};$('composeClose').onclick=()=>{if(!busy)$('compose').close()};
 for(const id of ['detail','compose'])$(id).addEventListener('cancel',e=>{if(busy)e.preventDefault()});
 $('cards').onclick=e=>{const card=e.target.closest('[data-card]');if(card)openDetail(card.dataset.card)};
 $('feed').onclick=e=>{const card=e.target.closest('[data-open]');if(card)tellParent({type:'goodjob:center-board-open',id:card.dataset.open})};
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{if(loading)return;filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));load()});
 $('searchForm').onsubmit=e=>{e.preventDefault();load()};$('refresh').onclick=()=>load();$('more').onclick=()=>load(true);$('reconnect').onclick=()=>authenticate();
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue=''}});
 window.addEventListener('message',e=>{if(e.source!==window.parent||e.origin!==ORIGIN)return;if(e.data?.type==='goodjob:center-board-identity'&&journal){const next=String(e.data.name||'');if(next!==expectedName||!linked){expectedName=next;linked=!!next;if(linked)authenticate();else clear()}}else if(e.data?.type==='goodjob:center-board-refresh'&&!busy)load()});
 const remember=()=>{try{return localStorage.getItem('goodjob_schedule_remember_v1')!=='0'}catch{return false}},storage={getItem:key=>{try{if(!remember())return sessionStorage.getItem(key);const pending=sessionStorage.getItem(key);if(pending!==null){localStorage.setItem(key,pending);if(localStorage.getItem(key)===pending)sessionStorage.removeItem(key);return pending}return localStorage.getItem(key)}catch{return null}},setItem:(key,value)=>{try{(remember()?localStorage:sessionStorage).setItem(key,value)}catch{}},removeItem:key=>{try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}}};
 if(!window.supabase?.createClient){clear();status('로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요.',true);return}
 client=window.supabase.createClient('https://hnhccnyitrlzqprnredi.supabase.co','sb_publishable_3tzdh4GuDjdx9GX8K9B4dQ_4gUaZAds',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'sb-hnhccnyitrlzqprnredi-auth-token',storage}});
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){clear();status('로그아웃되었습니다.')}else if(event==='SIGNED_IN'&&(!identity||session?.user?.id!==sessionUserId))setTimeout(()=>authenticate(),0)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy){if(identity)load();else authenticate()}});
 window.addEventListener('pageshow',e=>{if(e.persisted)authenticate()});
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='goodjob:open-center-card'&&identity)openDetail(String(e.data.cardId||''))});
 if(feedMode)setInterval(()=>{if(!document.hidden&&!busy&&identity)load()},45000);
 if(journal)tellParent({type:'goodjob:center-board-ready'});else authenticate();
})();
