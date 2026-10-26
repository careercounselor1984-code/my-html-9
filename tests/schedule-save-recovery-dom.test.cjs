'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8'),api=require('../schedule-save-recovery.js');
const from=html.indexOf('function cloudClearSaveIssue(){'),to=html.indexOf('function cloudQueue(){',from);
const dom=new JSDOM('<button id="cloudResolve" class="hide"></button><button id="export"></button><dialog id="dlg"></dialog>');
const doc=dom.window.document;
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
const own={id:'NEW',center:'북부센터',owner:'테스트상담사',date:'2026-10-26',kind:'consult',type:'초기',time:'10:00',end:'10:30',title:'<img src=x onerror=alert(1)>'};
let resolveSnapshot,edits=[],queued=0,downloads=0,rendered=0;
const model={events:[own]},cloud={active:true,identity:{center:own.center,name:own.owner},base:{events:new Map()},mutationEpoch:0};
const ctx={cloud,model,document:doc,$:id=>doc.getElementById(id),ScheduleSaveRecovery:api,cloudSessionGuard:()=>()=>cloud.active,
 cloudOwnRows:rows=>rows.filter(e=>!e.readonly&&e.owner===own.owner),addMinutes:()=> '10:30',parseDate:x=>x,changeView:()=>{},openEditor:(...x)=>edits.push(x),alert:()=>{},confirm:()=>true,
 save:()=>{queued++;ctx.cloudClearSaveIssue()},render:()=>rendered++};
cloud.client={rpc:()=>new Promise(r=>resolveSnapshot=r)};
doc.getElementById('export').onclick=()=>downloads++;
vm.createContext(ctx);vm.runInContext(html.slice(from,to),ctx);
(async()=>{
 const promise=ctx.cloudShowSaveIssue('기존 상담 또는 근무 일정과 시간이 중복됩니다');
 let dlg=doc.getElementById('cloudSaveIssueDialog');assert(dlg.open,'dialog opens before network response');assert(!doc.getElementById('cloudResolve').classList.contains('hide'));
 assert.equal(dlg.querySelectorAll('img').length,0,'names rendered as text');
 dlg.querySelector('[data-recovery-export]').click();assert.equal(downloads,1);
 const existing={...own,id:'SERVER',time:'10:00',end:'11:00',title:'서버합성자료'};
 resolveSnapshot({data:{events:[existing]}});await promise;
 assert(dlg.textContent.includes('겹치는 일정: 2026-10-26 10:00–11:00'));assert.equal(model.events.length,1,'server comparison never replaces local pending data');
 const buttons=[...dlg.querySelector('[data-recovery-list]').querySelectorAll('button')];buttons.find(b=>b.textContent==='날짜·시간 수정').click();assert.equal(edits[0][2],'NEW');assert(!dlg.open);
 const again=ctx.cloudShowSaveIssue(cloud.saveIssue);resolveSnapshot({data:{events:[existing]}});await again;
 dlg.querySelector('[data-recovery-list] button:last-child').click();assert.equal(model.events.length,0);assert.equal(queued,1);assert.equal(rendered,1);assert(!doc.getElementById('cloudSaveIssueDialog'),'cancellation clears issue and queues remaining changes');
 // A response from before an edit must not recreate an obsolete list or expose a prior session.
 model.events=[own];const delayed=ctx.cloudShowSaveIssue('시간 오류');const obsolete=doc.getElementById('cloudSaveIssueDialog');cloud.mutationEpoch++;ctx.cloudClearSaveIssue();resolveSnapshot({data:{events:[existing]}});await delayed;assert(!obsolete.isConnected);assert.equal(cloud.saveIssue,null);
 // An offline comparison still exposes the locally preserved edit actions.
 cloud.client.rpc=async()=>{throw Error('offline')};await ctx.cloudShowSaveIssue('시간 오류');dlg=doc.getElementById('cloudSaveIssueDialog');assert(dlg.textContent.includes('최신 일정을 확인하지 못했습니다'));assert(dlg.querySelector('[data-recovery-list] button'));
 ctx.cloudClearSaveIssue();assert(doc.getElementById('cloudResolve').classList.contains('hide'));
 console.log('PASS: immediate recovery dialog, server comparison, safe names, edit navigation, single-change cancel, backup, stale-response suppression and offline recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
