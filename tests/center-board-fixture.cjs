const {randomUUID}=require('node:crypto');
const actors=[
 {id:'10000000-0000-4000-8000-000000000001',center:'북부센터',display_name:'김상담',name:'김상담',role:'staff',is_active:true,must_change_password:false,managed_in_schedule:true},
 {id:'10000000-0000-4000-8000-000000000002',center:'북부센터',display_name:'이상담',name:'이상담',role:'staff',is_active:true,must_change_password:false,managed_in_schedule:true},
 {id:'10000000-0000-4000-8000-000000000003',center:'남부센터',display_name:'박상담',name:'박상담',role:'manager',is_active:true,must_change_password:false,managed_in_schedule:true},
 {id:'10000000-0000-4000-8000-000000000004',center:'북부센터',display_name:'정센터장',name:'정센터장',role:'manager',is_active:true,must_change_password:false,managed_in_schedule:true}
];
function fixture(){
 const tables={schedule_staff:structuredClone(actors),schedule_center_cards:[],schedule_center_responses:[],schedule_center_acknowledgements:[],schedule_push_subscriptions:actors.map(s=>({staff_id:s.id,endpoint:'https://fcm.googleapis.com/'+s.id,p256dh:'test',auth:'test'})),schedule_push_receipts:[]};
 const db={from(table){let op='select',value,filters=[],sort=[],start=0,end=Infinity,single=false,upsertKey='',orFilter='',count=false,executed;
 const q={select(_fields,opts){count=!!opts?.count;return q},eq(k,v){filters.push(r=>k==='schedule_center_cards.center'?tables.schedule_center_cards.some(c=>c.id===r.card_id&&c.center===v):r[k]===v);return q},in(k,values){filters.push(r=>values.includes(r[k]));return q},ilike(k,v){filters.push(r=>String(r[k]||'').toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return q},or(v){orFilter=v;return q},order(k,opts){sort.push([k,opts?.ascending!==false]);return q},range(a,b){start=a;end=b;return q},limit(n){end=n-1;return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},upsert(v,opts){op='upsert';value=v;upsertKey=opts.onConflict;return q},delete(){op='delete';return q},maybeSingle(){single=true;return q},single(){single=true;return q},then(resolve,reject){if(!executed)executed=Promise.resolve().then(run);return executed.then(resolve,reject)}};
 function run(){let rows=tables[table].filter(r=>filters.every(f=>f(r)));
  if(op==='insert'||op==='upsert'){
   const keys=op==='upsert'?upsertKey.split(','):table==='schedule_push_receipts'?['event_key','staff_id']:['id'];
   const old=tables[table].find(r=>keys.every(k=>r[k]===value[k]));
   if(old&&op==='insert')return {error:{code:'23505'},data:null};
   if(old){Object.assign(old,value);rows=[old]}else{const row=table==='schedule_center_cards'?{id:randomUUID(),created_at:new Date().toISOString(),...value}:{...value};tables[table].push(row);rows=[row]}
  }else if(op==='update')rows.forEach(r=>Object.assign(r,value));
  else if(op==='delete'){tables[table]=tables[table].filter(r=>!rows.includes(r));rows=[]}
  if(orFilter){if(orFilter==='kind.eq.request,priority.neq.normal')rows=rows.filter(r=>r.kind==='request'||r.priority!=='normal');else{const term=orFilter.match(/title.ilike.%([^%]*)%/)?.[1]?.toLowerCase();const ids=orFilter.match(/id.in.\(([^)]*)\)/)?.[1]?.split(',')||[];rows=rows.filter(r=>!term||r.title.toLowerCase().includes(term)||r.content.toLowerCase().includes(term)||ids.includes(r.id))}}
  const total=rows.length;rows=[...rows].sort((a,b)=>{for(const [key,asc]of sort){if(a[key]!==b[key])return (a[key]>b[key]?1:-1)*(asc?1:-1)}return 0}).slice(start,end+1);
  return {data:structuredClone(single?(rows[0]||null):rows),error:null,count:count?total:undefined};
 }return q;
 }};
 const sent=[];const delivery={allowEndpoint:s=>s.startsWith('https://fcm.googleapis.com/'),send:async(sub,payload)=>{sent.push({sub,payload:JSON.parse(payload)});return 201}};
 return {db,tables,actors,sent,delivery};
}
module.exports={fixture,actors};
