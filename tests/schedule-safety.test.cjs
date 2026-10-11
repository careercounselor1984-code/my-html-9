'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m=>!/\bsrc\s*=/.test(m[1])&&m[2].trim());
assert(scripts.length>=2,'calendar inline scripts present');
scripts.forEach((m,i)=>new vm.Script(m[2],{filename:'calendar-inline-'+i+'.js'}));
function body(name){
 const start=html.indexOf('function '+name+'(');
 assert(start>=0,'function exists: '+name);
 const match=html.slice(start).match(new RegExp('^function '+name+'\\([\\s\\S]*?\\n\\}'));
 assert(match,'extracts function: '+name);
 return match[0];
}
const cloudClean=x=>{const c={...x};delete c.readonly;delete c._serverVersion;return c};
const recover=new Function('cloudClean','return ('+body('cloudRecoverPendingRows')+')')(cloudClean);
const own=x=>x.owner==='상담사A';
const server=[
 {id:'A',owner:'상담사A',date:'2026-10-13',title:'서버에서 수정한 내용'},
 {id:'B',owner:'상담사A',date:'2026-10-13',title:'다른 기기 신규 예약'}
];
const draft=[
 {id:'A',owner:'상담사A',date:'2026-10-13',title:'오래된 내용'},
 {id:'D',owner:'상담사A',date:'2026-10-14',title:'다른 기기에서 삭제한 일정'},
 {id:'C',owner:'상담사A',date:'2026-10-15',title:'미전송 신규 일정'}
];
const out=recover(server,draft,own,['A','D']);
assert.deepEqual(out.rows.map(x=>x.id),['A','B','C']);
assert.equal(out.rows[0].title,'서버에서 수정한 내용');
assert.equal(out.added,1);
assert.equal(out.conflicts,2);
const legacy=recover(server,[draft[2]],own,undefined);
assert.equal(legacy.added,0,'old drafts without baseline cannot resurrect deletion');
assert.equal(legacy.conflicts,1);
assert(/if\(cloud\.active\)\{alert\('서버 연동 중에는 JSON 백업으로 전체 일정을 교체할 수 없습니다/.test(html),'online JSON overwrite blocked');
assert(/backupReady=localStorage\.getItem\(backupKey\)===pending/.test(html),'conflict backup verified before removing draft');
assert(/if\(backupReady&&recovered\)cloudQueue\(\)/.test(html),'backup error prevents recovery and queue');
assert(/cloud\.client\.rpc\('schedule_apply_event_changes'/.test(html),'version-aware sync calls server');
assert(/const use=free;/.test(html),'quick booking only shows free slots');
assert(/상담 중복 예약은 허용되지 않습니다/.test(html),'duplicate consultation UI refuses');
assert(/2027-/.test(html),'2027 holidays included');

function queueCase({deferred=false,failArchive=false,failDraft=false}={}){
 const prior=JSON.stringify({version:2,events:[{id:'UNSENT',title:'이전 미전송 초안'}]});
 const db=new Map([['schedule_pending_test-staff',prior]]);
 const statuses=[];
 const cloud={active:true,identity:{id:'test-staff',center:'북부센터',name:'상담사A'},
  base:{events:new Map(),people:new Map(),offs:new Map(),notices:new Map()},
  unresolvedDraft:deferred,needsSave:false,timer:null};
 const model={events:[{id:'NEW',date:'2026-10-15',title:'새 상담',center:'북부센터',owner:'상담사A'}],
  participants:[],offs:[],notices:[]};
 const localStorage={
  getItem:key=>db.get(key)??null,
  setItem:(key,value)=>{if((failArchive&&key.includes('deferred_draft_backup'))||(failDraft&&key==='schedule_pending_test-staff'))throw Error('quota');db.set(key,value)}
 };
 const context={cloud,model,localStorage,
  cloudOwnRows:rows=>rows.filter(v=>v.center==='북부센터'&&v.owner==='상담사A'),
  cloudDraftKey:()=> 'schedule_pending_test-staff',
  cloudStatus:(message,bad)=>statuses.push({message,bad}),
  clearTimeout:()=>{},setTimeout:()=>1,console:{warn:()=>{}}};
 const from=html.indexOf('function cloudQueue(){'),to=html.indexOf('async function cloudSyncEvents(',from);
 assert(from>=0&&to>from,'queue function boundaries present');
 vm.runInNewContext(html.slice(from,to)+'\ncloudQueue();',context);
 return {prior,db,cloud,statuses};
}
const saved=queueCase({deferred:true});
assert.equal(saved.cloud.queueBlocked,false,'deferred draft archival succeeds');
assert.equal([...saved.db.keys()].filter(k=>k.includes('deferred_draft_backup')).length,1,'old draft archived');
assert(saved.db.get('schedule_pending_test-staff').includes('"NEW"'),'new queued draft preserved');
const blocked=queueCase({deferred:true,failArchive:true});
assert.equal(blocked.cloud.queueBlocked,true,'cannot overwrite old draft without a verified backup');
assert.equal(blocked.db.get('schedule_pending_test-staff'),blocked.prior,'old pending draft never overwritten');
assert.equal(blocked.statuses.at(-1).bad,true);
const full=queueCase({failDraft:true});
assert.equal(full.cloud.draftBackupFailed,true,'quota error is not marked as saved');
assert.equal(full.db.get('schedule_pending_test-staff'),full.prior,'failed storage write keeps prior data');
assert(/queueBlocked/.test(html.slice(html.indexOf('async function cloudCommit()'),html.indexOf('async function cloudReload()'))),'server write is stopped when queue is blocked');
console.log('OK: deferred draft archive, blocked quota overwrite, draft write failure warning.');

console.log('OK: calendar inline scripts',scripts.length,'; restore conflict, deleted item, legacy draft, import guard, version sync, quick slots, duplicate UI, holidays.');
