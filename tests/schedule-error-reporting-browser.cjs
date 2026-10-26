'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),chrome=['google-chrome','chromium','chromium-browser'].find(x=>cp.spawnSync('which',[x]).status===0);assert(chrome,'Chrome required');
const setup='<script>window.__reportErrors=[];window.addEventListener("error",e=>window.__reportErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__reportErrors.push(String(e.reason?.message||e.reason)));window.alert=()=>{};window.confirm=()=>true;window.fetch=async()=>({ok:true,json:async()=>({items:[]})});window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}}})};</script>';
const scenario=`window.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{try{
 const must=(ok,m)=>{if(!ok)throw Error(m)},by=id=>document.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,0));
 const employee={id:'fixture-employee',name:'검증상담사',center:'북부센터',role:'counselor'},manager={id:'fixture-manager',name:'검증팀장',center:'북부센터',role:'manager'};
 const reports=new Map();let fail=true,reportedRequests=0;
 function feed(){return [...reports.values()].map(x=>({key:'saveerror:'+x.id+(x.resolved?':resolved':':open'),source:'saveerror',scope:'북부센터',kind:x.code,important:!x.resolved,title:'검증상담사 · 일정 저장 오류 '+(x.resolved?'[해결]':'[미해결]'),reporter:'검증상담사',date:'2026-10-26',openedAt:'2026-10-26T01:00:00Z',resolvedAt:x.resolved?'2026-10-26T01:01:00Z':null,pendingCount:x.count,detail:'상담·근무 시간 중복',status:x.resolved?'resolved':'open',seen:x.resolved?false:!!x.seen}));}
 const client={auth:{},functions:{invoke:async()=>({data:{}})},rpc:async(name,args)=>{
  if(name==='schedule_apply_event_changes')return fail?{error:{message:'기존 상담 또는 근무 일정과 시간이 중복됩니다'}}:{data:{ok:true,changes:args.p_actions.map(a=>({id:a.id,version:'revision-1',op:a.op}))}};
  if(name==='schedule_save_issue_report'){reportedRequests++;const old=reports.get(args.p_issue_key);reports.set(args.p_issue_key,{id:args.p_issue_key,code:args.p_code,count:args.p_pending_count,seen:old?.seen,resolved:!!(old?.resolved||args.p_resolved)});return {data:{ok:true}};}
  if(name==='schedule_save_issue_feed')return {data:{items:cloud.identity.role==='manager'?feed():[]}};
  if(name==='schedule_save_issue_ack'){for(const x of reports.values())if(args.p_keys.includes('saveerror:'+x.id+':open'))x.seen=true;return {data:{ok:true}};}
  if(name==='schedule_get_snapshot')return {data:{events:[],identity:cloud.identity}};
  return {data:{items:[],visits:[]}};
 }};
 function login(identity){cloudClearSession();cloud.client=client;cloudApplyIdentity(identity);model.staff=Object.fromEntries(CENTERS.map(c=>[c,c===identity.center?[employee.name,manager.name]:[]]));by('center').value=identity.center;refreshEmployees(identity.name);by('owner').value=identity.name;focusDate=parseDate('2026-10-26');changeView('personalWeek');cloud.base={events:new Map(),people:new Map(),offs:new Map(),notices:new Map()};}
 login(employee);model.events=[{id:'fixture-unsent',center:employee.center,owner:employee.name,date:'2026-10-26',time:'10:00',end:'10:30',kind:'consult',type:'초기',title:'합성상담자료'}];
 save();clearTimeout(cloud.timer);await cloudCommit();await tick();await cloudIssueReporter().flush();
 must(by('cloudSaveIssueDialog').open,'counselor error dialog');must(cloud.needsSave&&!!cloud.saveIssue,'pending preserved');must(reports.size===1&&reportedRequests===1,'manager report created once');
 await cloudCommit();await cloudIssueReporter().flush();must(reportedRequests===1,'no duplicate reports on retry');
 login(manager);must(!by('managerSaveIssues').classList.contains('hide'),'manager report entry visible');await alertPoll(true);
 must(by('alertDialog').open&&by('alertItems').textContent.includes('검증상담사'),'manager popup delivered');
 const key=feed()[0].key;await alertAck([key]);must(![...reports.values()][0].resolved,'read does not resolve');
 if(by('alertDialog').open)by('alertDialog').close();await managerSaveIssueOpen();
 must(by('managerSaveIssueDialog').textContent.includes('미해결 1건'),'unresolved persists in report history');must(by('managerSaveIssueDialog').getBoundingClientRect().width<=innerWidth,'report fits viewport');
 login(employee);must(!by('managerSaveIssueDialog')&&by('managerSaveIssues').classList.contains('hide'),'employee cannot retain manager report screen');
 model.events=[{id:'fixture-fixed',center:employee.center,owner:employee.name,date:'2026-10-26',time:'11:00',end:'11:30',kind:'consult',type:'초기',title:'합성상담자료'}];fail=false;save();clearTimeout(cloud.timer);await cloudCommit();await tick();await cloudIssueReporter().flush();
 must([...reports.values()][0].resolved,'successful save resolves same incident');must(!cloud.needsSave,'save complete');
 login(manager);await alertPoll(false);await managerSaveIssueOpen();must(by('managerSaveIssueDialog').textContent.includes('최근 해결 1건'),'manager sees resolution');
 cloudClearSession();must(!by('managerSaveIssueDialog'),'logout removes report details');must(!window.__reportErrors.length,window.__reportErrors.join(' | '));document.body.dataset.reportAudit='passed';
 }catch(e){document.body.dataset.reportAudit='failed';document.body.dataset.reportAuditError=e.message+' | '+window.__reportErrors.join(' | ');}},800));`;
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n').replace(/<script\b[^>]*src=["']https?:[^"']+["'][^>]*>[\s\S]*?<\/script>/gi,'');
const anchor='changeView(currentView);\n})();';assert(html.includes(anchor));html=html.replace('<head>','<head>'+setup).replace(anchor,'changeView(currentView);\n'+scenario+'\n})();');const file=path.join(root,'.error-reporting-browser.html');fs.writeFileSync(file,html);
try{for(const size of ['1600,1000','390,844']){const r=cp.spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--window-size='+size,'--virtual-time-budget=4000','--dump-dom','file://'+file],{encoding:'utf8',timeout:45000,maxBuffer:12*1024*1024});assert.equal(r.status,0,'Chrome exit');assert(r.stdout.includes('data-report-audit="passed"'),size+' '+(r.stdout.match(/data-report-audit-error="[^"]*/)?.[0]||'no result'));console.log('PASS: employee save rejection -> manager popup/history -> read remains unresolved -> employee save success -> manager resolution '+size);}}finally{fs.rmSync(file,{force:true});}
