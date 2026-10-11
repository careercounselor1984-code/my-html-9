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
console.log('OK: calendar inline scripts',scripts.length,'; restore conflict, deleted item, legacy draft, import guard, version sync, quick slots, duplicate UI, holidays.');
