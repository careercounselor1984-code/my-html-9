'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),chrome=['google-chrome','chromium','chromium-browser'].find(x=>cp.spawnSync('which',[x]).status===0);assert(chrome,'Chrome required');
const setup='<script>window.__workspaceErrors=[];window.addEventListener("error",e=>window.__workspaceErrors.push(e.message));window.addEventListener("unhandledrejection",e=>window.__workspaceErrors.push(String(e.reason?.message||e.reason)));window.alert=()=>{};window.confirm=()=>true;window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange(){}}})};</script>';
const scenario=`window.addEventListener('DOMContentLoaded',()=>setTimeout(async()=>{try{
 const must=(ok,m)=>{if(!ok)throw Error(m)},by=id=>document.getElementById(id),api=window.GoodJobCalendarWorkspace;
 must(api&&!api.snapshot().authenticated,'unauthenticated snapshot');
 const identity={id:'fixture',name:'테스트상담사',center:'북부센터',role:'staff'};
 model.staff=Object.fromEntries(CENTERS.map(c=>[c,c===identity.center?[identity.name,'동료']:[]]));
 model.events=[{id:'own',center:identity.center,owner:identity.name,date:'2026-10-19',time:'09:00',end:'09:30',kind:'consult',type:'IAP',title:'검증용상담'}, {id:'other',center:identity.center,owner:'동료',date:'2026-10-19',time:'09:00',end:'18:00',kind:'work',type:'연차',title:'동료연차'}];
 cloudApplyIdentity(identity);by('center').value=identity.center;refreshEmployees(identity.name);by('owner').value=identity.name;focusDate=parseDate('2026-10-19');changeView('personalWeek');
 must(document.body.classList.contains('schedule-workspace'),'module mounted');
 must(by('workMenu').parentElement.id==='swSidebar','menu relocated');must(by('cloudArea').parentElement.classList.contains('headbar'),'account toolbar relocated');
 let s=api.snapshot();must(s.entries.length===1&&s.entries[0].id==='own'&&s.entries[0].editable,'personal scope');must(s.metrics.consultations===1,'consultation count');
 must(by('swDayPanel').textContent.includes('검증용상담')&&!by('swDayPanel').textContent.includes('동료연차'),'panel personal scope');
 api.edit('other');must(!by('dlg').open,'cannot edit colleague via panel bridge');
 document.querySelector('[data-sw-date="2026-10-20"]').click();must(api.snapshot().date==='2026-10-20','mini calendar date navigation');
 const before=api.snapshot().date;api.navigate('2026-02-30');must(api.snapshot().date===before,'invalid date rejected');api.navigate('2026-10-19');
 for(const view of ['personalDay','personalWeek','personalMonth','teamDay','teamLeave']){changeView(view);must(by('calendar').innerHTML.length>0,view+' render');must(document.documentElement.scrollWidth<=innerWidth+2,view+' overflow');if(view.startsWith('team'))must(api.snapshot().entries.every(e=>!e.editable),'team view read only');}
 changeView('teamLeave');must(api.snapshot().workGroups.some(g=>g.owner==='동료'),'leave staff list');
 changeView('personalWeek');by('swDayListOpen').click();must(by('swDayDialog').open,'detail dialog opens');by('swDayDialog').close();await new Promise(r=>setTimeout(r,40));must(by('swDayPanel').parentElement.classList.contains('sw-calendar-layout'),'panel restored');
 by('swDensity').value='compact';by('swDensity').dispatchEvent(new Event('change'));must(document.body.dataset.calendarDensity==='compact','density changes');
 if(innerWidth<=900){by('swNavToggle').click();must(by('swNavToggle').getAttribute('aria-expanded')==='true','drawer opens');document.querySelector('[data-sw-date="2026-10-20"]').click();must(by('swNavToggle').getAttribute('aria-expanded')==='false','drawer closes after selection');}
 cloudClearSession();must(!api.snapshot().authenticated,'logout scope');must(!by('swDayPanel').textContent&&!by('swCalendarMetrics').textContent&&!document.querySelector('.sw-mini-day'),'logout clears new presentation');must(!window.__workspaceErrors.length,window.__workspaceErrors.join(' | '));document.body.dataset.workspaceAudit='passed';
 }catch(e){document.body.dataset.workspaceAudit='failed';document.body.dataset.workspaceAuditError=e.message+' | '+window.__workspaceErrors.join(' | ');}},800));`;
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n').replace(/<script\b[^>]*src=["']https?:[^"']+["'][^>]*>[\s\S]*?<\/script>/gi,'');
const anchor='changeView(currentView);\n})();';assert(html.includes(anchor));html=html.replace('<head>','<head>'+setup).replace(anchor,'changeView(currentView);\n'+scenario+'\n})();');const file=path.join(root,'.workspace-audit-smoke.html');fs.writeFileSync(file,html);
try{for(const size of ['1600,1000','390,844']){const r=cp.spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--allow-file-access-from-files','--window-size='+size,'--virtual-time-budget=2500','--dump-dom','file://'+file],{encoding:'utf8',timeout:45000,maxBuffer:12*1024*1024});assert.equal(r.status,0,'Chrome exit');assert(r.stdout.includes('data-workspace-audit="passed"'),size+' '+(r.stdout.match(/data-workspace-audit-error="[^"]*/)?.[0]||'no result'));console.log('PASS: calendar workspace '+size+'; authorized scope, date navigation, layout, density, dialogs and logout');}}finally{fs.rmSync(file,{force:true});}

