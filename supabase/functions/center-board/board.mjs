const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const checked = result => { if (result.error) throw result.error; return result.data; };
const text = (value, max) => { if (typeof value !== 'string' || value.trim().length > max) fail('입력 길이를 확인해 주세요.'); return value.trim(); };
const timestamp = value => { if (!value) return null; const time = Date.parse(value); if (!Number.isFinite(time)) fail('날짜를 확인해 주세요.'); return new Date(time).toISOString(); };
const manages = (actor, card) => actor.center === card.center && (actor.id === card.created_by || actor.role === 'manager' || actor.is_schedule_admin === true);
const categories = ['general','employment','company','center','case'];
export function actionable(card, response, acknowledgement, now = Date.now()) {
 if (card.status !== 'open' || (card.expires_at && Date.parse(card.expires_at) <= now)) return false;
 if (card.kind === 'request') return !response;
 return card.priority !== 'normal' && acknowledgement?.revision !== card.revision;
}
export function cardValues(body, actor, old) {
 const title = text(body.title, 160), content = text(body.content, 12000);
 if (!title || !content) fail('제목과 내용을 입력해 주세요.');
 if (!['memo', 'notice', 'request'].includes(body.kind) || !['normal', 'important', 'urgent'].includes(body.priority)) fail('카드 종류와 중요도를 확인해 주세요.');
 if (!['open', 'done'].includes(body.status)) fail('진행 상태를 확인해 주세요.');
 if (old && body.kind !== old.kind) fail('등록한 카드의 종류는 바꿀 수 없습니다.');
 const category = body.category ?? old?.category ?? 'general';
 if (!categories.includes(category)) fail('글 분류를 확인해 주세요.');
 const deadline = timestamp(body.deadline), expires_at = timestamp(body.expires_at);
 if (deadline && expires_at && expires_at < deadline) fail('노출 종료는 마감 이후로 설정해 주세요.');
 return {center:actor.center,created_by:old?.created_by || actor.id,title,content,kind:body.kind,category,priority:body.priority,pinned:body.pinned === true,status:body.status,deadline,expires_at,revision:old ? old.revision + 1 : 1,updated_at:new Date().toISOString()};
}
export async function handleBoard(db, actor, body, delivery) {
 if (!actor?.id || !actor.center || !actor.is_active || actor.must_change_password) fail('직원 인증을 완료해 주세요.', 403);
 if (!body || typeof body !== 'object') fail('요청 형식을 확인해 주세요.');
 const action = body.action;
 const people = async () => checked(await db.from('schedule_staff').select('id,display_name,managed_in_schedule').eq('center', actor.center).eq('is_active', true).eq('must_change_password', false));
 const load = async () => {
  if (!uuid(body.id)) fail('카드 주소를 확인해 주세요.');
  const card = checked(await db.from('schedule_center_cards').select('*').eq('id', body.id).eq('center', actor.center).maybeSingle());
  if (!card) fail('소속 센터에서 볼 수 없는 카드입니다.', 404);
  return card;
 };
 if (action === 'list' || action === 'feed') {
  const offset = action === 'feed' ? 0 : Math.max(0, Math.min(100000, Math.floor(Number(body.offset) || 0)));
  let query = db.from('schedule_center_cards').select('*', {count:'exact'}).eq('center', actor.center);
  if (action==='list' && body.category && body.category!=='all') {
   if (!categories.includes(body.category)) fail('글 분류를 확인해 주세요.');
   query = query.eq('category', body.category);
  }
  if (action === 'feed' || body.filter === 'open') query = query.eq('status', 'open');
  else if (body.filter === 'done') query = query.eq('status', 'done');
  const search = String(body.search || '').trim().slice(0, 100);
  if (search) {
   // Strip PostgREST filter operators; quote search as a literal wildcard term.
   const term = search.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim();
   if (term) {
    const matches = checked(await db.from('schedule_center_responses').select('card_id,schedule_center_cards!inner(center)').eq('schedule_center_cards.center',actor.center).ilike('content','%'+term+'%').limit(300));
    const ids = [...new Set(matches.map(x=>x.card_id))].filter(uuid);
    query = query.or('title.ilike.%'+term+'%,content.ilike.%'+term+'%'+(ids.length?',id.in.('+ids.join(',')+')':''));
   }
  }
  // Fetch active candidates only; completed cards stay searchable in the board.
  if (action === 'feed') query = query.or('kind.eq.request,priority.neq.normal');
  const limit = action === 'feed' ? 1000 : 48;
  query = query.order('pinned',{ascending:false}).order('updated_at',{ascending:false}).order('id');
  let result = await query.range(offset,offset+limit-1);
  const cards = checked(result);
  if(action==='feed'){
   for(let start=limit;cards.length<(result.count||0);start+=limit){
    const page=checked(await query.range(start,start+limit-1));
    if(!page.length)break;
    cards.push(...page);
   }
  }
  const ids = cards.map(x=>x.id);
  const related=async(table,own=false)=>{
   const rows=[];
   for(let i=0;i<ids.length;i+=100){
    let q=db.from(table).select('*').in('card_id',ids.slice(i,i+100));
    if(own)q=q.eq('staff_id',actor.id);
    // Many responses may share a card; page beyond PostgREST's row limit.
    for(let start=0;;start+=1000){const page=checked(await q.range(start,start+999));rows.push(...page);if(page.length<1000)break;}
   }
   return rows;
  };
  const [responses, acks, roster] = await Promise.all([
   related('schedule_center_responses'),related('schedule_center_acknowledgements',true),people()
  ]);
  const visible = action === 'feed' ? cards.filter(c=>actionable(c,responses.find(r=>r.card_id===c.id&&r.staff_id===actor.id),acks.find(a=>a.card_id===c.id))) : cards;
  return {ok:true,identity:{id:actor.id,name:actor.display_name,center:actor.center},cards:visible,responses:responses.filter(r=>visible.some(c=>c.id===r.card_id)),acknowledgements:acks,people:roster,total:result.count||0,offset,hasMore:action==='list'&&offset+cards.length<(result.count||0)};
 }
 if (action === 'detail') {
  const card = await load();
  const [responses, roster] = await Promise.all([db.from('schedule_center_responses').select('*').eq('card_id',card.id).order('updated_at').then(checked),people()]);
  return {ok:true,card,responses,people:roster,canManage:manages(actor,card)};
 }
 if (action === 'save') {
  const old = body.id ? await load() : null;
  if (old && !manages(actor,old)) fail('작성자 또는 센터 관리자만 수정할 수 있습니다.',403);
  if (old && (!Number.isInteger(body.revision) || body.revision !== old.revision)) fail('다른 직원이 카드를 수정했습니다. 새로고침 후 다시 저장해 주세요.',409);
  const values = cardValues(body,actor,old);
  let card;
  if (old) {
   card = checked(await db.from('schedule_center_cards').update(values).eq('id',old.id).eq('center',actor.center).eq('revision',body.revision).select().maybeSingle());
   if (!card) fail('카드가 변경되었습니다. 새로고침 후 다시 저장해 주세요.',409);
  } else card = checked(await db.from('schedule_center_cards').insert(values).select().single());
  return {ok:true,card};
 }
 if (action === 'respond') {
  const card = await load();
  if (card.status !== 'open') fail('완료된 카드입니다. 작성자에게 다시 열기를 요청해 주세요.',409);
  const content = text(body.content ?? '',4000);
  const quantity = card.kind === 'request' ? body.quantity : null;
  if (card.kind === 'request' && (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000)) fail('인원은 0 이상의 정수로 입력해 주세요.');
  if (card.kind !== 'request' && !content) fail('답변 내용을 입력해 주세요.');
  checked(await db.from('schedule_center_responses').upsert({card_id:card.id,staff_id:actor.id,quantity,content,updated_at:new Date().toISOString()},{onConflict:'card_id,staff_id'}));
  return {ok:true};
 }
 if (action === 'ack') {
  const card = await load();
  if (body.revision !== card.revision) fail('새로 수정된 내용을 확인해 주세요.',409);
  checked(await db.from('schedule_center_acknowledgements').upsert({card_id:card.id,staff_id:actor.id,revision:card.revision},{onConflict:'card_id,staff_id'}));
  return {ok:true};
 }
 if (action === 'notify') {
  const card = await load();
  if (!manages(actor,card)) fail('이 카드의 알림을 보낼 권한이 없습니다.',403);
  if (card.status !== 'open' || card.priority === 'normal' || (card.expires_at && Date.parse(card.expires_at) <= Date.now())) return {ok:true,sent:0};
  const roster = (await people()).filter(p=>p.id!==actor.id&&p.managed_in_schedule);
  if (!roster.length) return {ok:true,sent:0};
  const submitted = card.kind==='request' ? checked(await db.from('schedule_center_responses').select('staff_id').eq('card_id',card.id)) : [];
  const recipients = roster.filter(p=>!submitted.some(r=>r.staff_id===p.id)).map(p=>p.id);
  if (!recipients.length) return {ok:true,sent:0};
  const subs = checked(await db.from('schedule_push_subscriptions').select('staff_id,endpoint,p256dh,auth').in('staff_id',recipients));
  const key = 'center-card:'+card.id+':'+card.revision;
  let sent=0, failed=0;
  for (const staff of recipients) {
   const targets=subs.filter(s=>s.staff_id===staff&&delivery.allowEndpoint(s.endpoint)).slice(0,4);
   if (!targets.length) continue;
   const receipt=await db.from('schedule_push_receipts').insert({event_key:key,staff_id:staff});
   if (receipt.error?.code==='23505') continue;
   checked(receipt);
   let accepted=0;
   for (const sub of targets) {
    try {
     const code=await delivery.send(sub,JSON.stringify({url:URL_BASE+'board.html?card='+card.id,tag:key,cardId:card.id}));
     if (code===201||code===202) {accepted++;sent++;}
     else {failed++;if(code===404||code===410)checked(await db.from('schedule_push_subscriptions').delete().eq('staff_id',staff).eq('endpoint',sub.endpoint));}
    } catch {failed++;}
   }
   if (!accepted) checked(await db.from('schedule_push_receipts').delete().eq('event_key',key).eq('staff_id',staff));
  }
  return {ok:true,sent,failed};
 }
 fail('지원하지 않는 요청입니다.');
}
const URL_BASE='https://careercounselor1984-code.github.io/my-html-9/';
