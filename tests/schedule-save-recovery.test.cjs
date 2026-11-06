'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const recovery=require('../schedule-save-recovery.js');
const html=fs.readFileSync('index.html','utf8');
const row=(id,time='10:00',extra={})=>({id,date:'2026-10-26',center:'북부센터',owner:'테스트상담사',kind:'consult',type:'초기',time,end:time==='10:00'?'10:30':'11:00',title:'합성자료',...extra});
const a=row('A'),b=row('B','10:00',{kind:'work',type:'회의'}),c=row('C','10:30');
const base=new Map([['A',JSON.stringify(a)]]);
assert.equal(recovery.pending([a],base).length,0);
assert.equal(recovery.pending([],base)[0].deleted,true);
assert.equal(recovery.conflicts(b,[a,b],base,[a]).length,1,'work overlapping consultation is actionable');
assert.equal(recovery.conflicts(c,[a,c],base,[a]).length,0,'adjacent consultations do not overlap');
assert.equal(recovery.conflicts(b,[b],base,[a]).length,0,'pending deletion excluded from proposed final state');
assert.equal(recovery.conflicts(b,[a,b],base,[a,row('fresh')]).length,2,'fresh server-only reservation detected');
assert.equal(recovery.conflicts(b,[b],new Map(),[row('missing-end','10:00',{end:''})]).length,1);
assert.equal(recovery.conflicts(row('next','10:30'),[row('next','10:30')],new Map(),[row('missing-end','10:00',{end:''})]).length,0);
assert.equal(recovery.conflicts(b,[b],new Map(),[row('other','10:00',{owner:'동료'})]).length,0,'other staff excluded');
assert(recovery.isCorrectable('일정 서버 저장 실패: 기존 상담 또는 근무 일정과 시간이 중복됩니다'));
assert(!recovery.isCorrectable('Failed to fetch'));
const commit=html.slice(html.indexOf('async function cloudCommit(){'),html.indexOf('async function cloudReload(){'));
const move=html.slice(html.indexOf('async function moveScheduleApply(){'),html.indexOf("$('moveScheduleBtn').onclick=moveScheduleOpen;"));
async function moveWithServerReply(reject){
 const alerts=[],statuses=[];
 const fields={moveScheduleDate:{value:a.date},moveScheduleTime:{value:'10:30'},moveScheduleApply:{},moveScheduleDlg:{close(){}},editor:{elements:{date:{value:a.date},time:{value:a.time}}}};
 let settle,markStarted;
 const started=new Promise(resolve=>{markStarted=resolve});
 const model={events:[a],participants:[],offs:[],notices:[]};
 const cloud={active:true,busy:false,needsSave:false,identity:{id:'test'},base:{events:new Map(base),people:new Map()}};
 const ctx={cloud,model,$:id=>fields[id],editing:a.id,editorMode:'consult',withinSameDay:()=>true,confirm:()=>true,
  alert:message=>alerts.push(message),cloudStatus:message=>statuses.push(message),cloudSessionGuard:()=>()=>true,
  saveEntry:async()=>{model.events=[{...a,time:fields.editor.elements.time.value}];cloud.needsSave=true;return true;},
  cloudSyncEvents:()=>new Promise((resolve,fail)=>{settle=()=>reject?fail(Error('일정 버전 충돌: 다른 기기에서 먼저 수정했습니다')):resolve(1);markStarted();}),
  cloudSyncList:async()=>0,cloudOwnRows:rows=>rows,cloudClean:row=>row,cloudMap:rows=>new Map(rows.map(e=>[e.id,JSON.stringify(e)])),
  cloudReportSaveIssue:()=>{},cloudResolveSaveReport:()=>{},pushServer:async()=>{},calendarState:{},
  setTimeout:()=>1,clearTimeout:()=>{}};
 vm.createContext(ctx);vm.runInContext(commit+move,ctx);
 const pending=ctx.moveScheduleApply();await started;
 assert.equal(alerts.length,0,'no success notification while the server write is in flight');
 settle();await pending;
 assert.equal(alerts.some(message=>message.includes('변경되었습니다')),!reject);
 assert.equal(JSON.parse(cloud.base.events.get(a.id)).time,reject?'10:00':'10:30');
 if(reject)assert(statuses.some(message=>message.includes('일정 충돌')));
}
async function failure(message){
 const cloud={active:true,busy:false,needsSave:true,identity:{id:'test'},base:{events:new Map()}},timers=[],dialogs=[];
 const ctx={cloud,model:{events:[],participants:[],offs:[],notices:[]},cloudSessionGuard:()=>()=>true,cloudOwnRows:x=>x,cloudClean:x=>x,
  cloudReportSaveIssue:()=>{},cloudResolveSaveReport:()=>{},cloudSyncEvents:async()=>{throw Error(message)},ScheduleSaveRecovery:recovery,cloudShowSaveIssue:async text=>{cloud.saveIssue=text;dialogs.push(text)},cloudStatus:()=>{},clearTimeout:()=>{},setTimeout:(fn,ms)=>{timers.push(ms);return 1}};
 vm.createContext(ctx);vm.runInContext(commit,ctx);await ctx.cloudCommit();return {cloud,timers,dialogs,ctx};
}
(async()=>{
 await moveWithServerReply(false);await moveWithServerReply(true);
 const overlap=await failure('기존 상담 또는 근무 일정과 시간이 중복됩니다');
 assert(overlap.cloud.needsSave,'failed changes remain pending');assert.equal(overlap.dialogs.length,1);assert.equal(overlap.timers.length,0,'deterministic rejection never retries in background');
 await overlap.ctx.cloudCommit();assert.equal(overlap.dialogs.length,1,'same unresolved error does not reopen repeatedly');
 const network=await failure('Failed to fetch');assert.deepEqual(network.timers,[4000],'temporary network failures retain retry');assert.equal(network.dialogs.length,0);
 const alerts=[],removed=[];
 const success={cloud:{active:true,busy:false,needsSave:true,resolvingSaveIssue:true,identity:{id:'test'},base:{events:new Map(),people:new Map()}},
  model:{events:[],participants:[],offs:[],notices:[]},cloudSessionGuard:()=>()=>true,cloudOwnRows:x=>x,cloudClean:x=>x,
  cloudSyncEvents:async()=>0,cloudSyncList:async()=>0,cloudMap:rows=>new Map(rows.map(e=>[e.id,JSON.stringify(e)])),cloudDraftKey:()=> 'pending-test',localStorage:{removeItem:key=>removed.push(key)},
  cloudReportSaveIssue:()=>{},cloudResolveSaveReport:()=>{},cloudStatus:()=>{},alert:text=>alerts.push(text),calendarState:{},setTimeout:()=>1,clearTimeout:()=>{}};
 vm.createContext(success);vm.runInContext(commit,success);await success.cloudCommit();
 assert.equal(alerts.length,1,'recovery success is confirmed after server acknowledgement');assert.equal(success.cloud.resolvingSaveIssue,false);assert.deepEqual(removed,['pending-test']);
 console.log('PASS: pending preservation, current/server overlap comparison, adjacency, deleted rows, own scope, immediate dialog, retry pause and network retry');
})().catch(e=>{console.error(e);process.exitCode=1});
