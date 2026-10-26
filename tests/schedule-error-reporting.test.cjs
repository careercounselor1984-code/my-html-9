'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),api=require('../schedule-error-reporting.js');
const html=fs.readFileSync('index.html','utf8');
const db=new Map(),storage={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
let calls=[],offline=false,current=true,seq=0,delivery=[];
const rpc=async(name,args)=>{calls.push({name,args});if(offline)throw Error('offline');return {data:{ok:true}}};
const create=(staffId='fixture-a')=>api.create({staffId,storage,rpc,isCurrent:()=>current,uuid:()=>String(++seq).padStart(8,'0')+'-0000-4000-8000-000000000000',onDelivery:x=>delivery.push(x)});
(async()=>{
 let reporter=create();await reporter.open('기존 상담 또는 근무 일정과 시간이 중복됩니다',3);assert.equal(calls.length,1);assert.equal(calls[0].args.p_code,'overlap');
 const incident=calls[0].args.p_issue_key;
 await reporter.open('같은 오류',3);await reporter.flush();assert.equal(calls.length,1,'same unresolved incident reported once');
 reporter=create();await reporter.open('same after reload',3);assert.equal(calls.length,1,'reload does not duplicate manager report');
 await reporter.resolve();assert.equal(calls.length,2);assert.equal(calls[1].args.p_issue_key,incident);assert.equal(calls[1].args.p_resolved,true);
 offline=true;await reporter.open('Failed to fetch token=SECRET name=내담자명',4);assert.equal(delivery.at(-1),null);
 assert(!JSON.stringify([...db.values()]).includes('SECRET'));assert(!JSON.stringify(calls).includes('내담자명'),'no raw error or personal data sent');
 reporter=create();offline=false;await reporter.flush();assert.equal(calls.at(-1).args.p_code,'network','offline queue survives reload');
 const before=calls.length;await create('fixture-b').flush();assert.equal(calls.length,before,'different account cannot flush another outbox');
 await reporter.resolve();assert(calls.at(-1).args.p_resolved);
 // A successful save before the first report arrives must still deliver the final resolved state.
 let complete;const pending=[];
 const race=api.create({staffId:'race',storage,isCurrent:()=>true,uuid:()=> '00000001-0000-4000-8000-000000000001',rpc:async(n,p)=>{pending.push(p);if(pending.length===1)return new Promise(r=>complete=r);return {data:{ok:true}}}});
 const started=race.open('백업 실패',1);await race.resolve();complete({data:{ok:true}});await started;await race.flush();assert.deepEqual(pending.map(x=>x.p_resolved),[false,true]);
 current=false;const previous=calls.length;await reporter.open('failure',1);await reporter.resolve();await reporter.flush();assert.equal(calls.length,previous,'logout halts cross-session reporting');
 for(const code of ['overlap','version','validation','network','backup','save'])assert(Object.values({overlap:api.classify('중복'),version:api.classify('버전 충돌'),validation:api.classify('시각 확인'),network:api.classify('Failed to fetch'),backup:api.classify('백업 실패'),save:api.classify('database error')}).includes(code));
 // Save pipeline calls the report on rejection and resolves it only after all writes succeed.
 assert(html.indexOf('cloudReportSaveIssue(err.message);')>html.indexOf('async function cloudCommit()'));
 assert(html.includes('if(!cloud.needsSave)cloudResolveSaveReport();'));
 assert(html.includes("if(!backedUp)cloudReportSaveIssue('기기 백업 실패');"));
 assert(html.includes("if(issueKeys.length){const {error}=await cloud.client.rpc('schedule_save_issue_ack'"));
 const sql=fs.readFileSync('docs/sql/schedule-save-issue-reporting.sql','utf8');
 assert(sql.includes('enable row level security'));assert(sql.includes("i.center=me.center"));assert(sql.includes('auth_user_id=auth.uid()'));assert(!sql.includes("payload->"));
 console.log('PASS: report deduplication, reload persistence, offline retry, account isolation, no raw personal data, save-success resolution, response races and report integration');
})().catch(e=>{console.error(e);process.exitCode=1});
