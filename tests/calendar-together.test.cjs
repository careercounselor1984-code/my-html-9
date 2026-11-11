'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('../private-planner.js');require('../client-deadlines.js');const timeline=require('../clients.js');
const tick=()=>new Promise(r=>setImmediate(r));
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.checked=false;this.hidden=false;this.className='';}
 append(...children){this.children.push(...children)}
 after(child){this.afterChild=child}
 remove(){this.removed=true}
 setAttribute(){}
 querySelector(selector){return this.targets?.[selector]||null}
 querySelectorAll(selector){return this.lists?.[selector]||[]}
}
(async()=>{
 const calendar=new Element(),head=new Element(),sheet=new Element(),sheetHead=new Element(),week=new Element(),agenda=new Element(),agendaHead=new Element();
 sheet.targets={'.sheet-head':sheetHead};calendar.closest=()=>sheet;week.targets={thead:head};agenda.targets={'.agenda-head':agendaHead};calendar.lists={'.desktop-week':[week],'.day-agenda':[agenda]};
 const callbacks={},docCallbacks={},d={readyState:'complete',createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),getElementById:id=>id==='calendar'?calendar:null,addEventListener:(name,fn)=>docCallbacks[name]=fn};
 let state={authenticated:true,team:false,aux:false,view:'personalDay',date:'2026-11-11',dates:['2026-11-11']},scope='staff-A|1',calls=0,release,pending=false;
 const data=[{id:'t',kind:'todo',payload:{text:'확인할 일',dueDate:state.date}},{id:'done',kind:'todo',payload:{text:'완료한 일',dueDate:state.date,done:true}},{id:'memo',kind:'todo',payload:{text:'메모',entryType:'memo',dueDate:state.date}},{id:'client',kind:'iap',payload:{name:'내담자',dates:[state.date],eventChecks:{'due:1':{date:state.date,checked:true}}}},{id:'ended',kind:'iap',payload:{name:'종료자',dates:[state.date],clientStatus:'ended',statusDate:state.date}}];
 const context={document:d,location:{search:''},URLSearchParams,Date,window:{PrivatePlanner:global.PrivatePlanner,ClientTimeline:timeline,GoodJobCalendarWorkspace:{snapshot:()=>state,togetherScope:()=>scope,togetherRows:async()=>{calls++;if(pending)return new Promise(r=>release=r);return data}},addEventListener:(name,fn)=>callbacks[name]=fn}};
 vm.runInNewContext(fs.readFileSync('calendar-together.js','utf8'),context);
 const bar=sheetHead.afterChild,checkboxes=bar.children.filter(n=>n.tag==='label').map(n=>n.children[0]);
 assert.equal(calls,0,'unchecked controls do not fetch private records');assert.equal(checkboxes.length,2);
 checkboxes[0].checked=true;checkboxes[0].onchange();await tick();
 const text=n=>(n?.textContent||'')+(n?.children||[]).map(text).join('');
 assert(text(agendaHead.afterChild).includes('확인할 일'));assert(!text(agendaHead.afterChild).includes('완료한 일'));assert(!text(agendaHead.afterChild).includes('메모'));
 checkboxes[1].checked=true;checkboxes[1].onchange();await tick();assert(text(agendaHead.afterChild).includes('내담자'));assert(!text(agendaHead.afterChild).includes('종료자'));
 state.team=true;callbacks['goodjob:mini-update']();assert(bar.hidden,'team views hide private overlays');
 state.team=false;callbacks['goodjob:mini-update']();await tick();assert(!bar.hidden);
 pending=true;callbacks.focus();await tick();assert(release);scope='';state.authenticated=false;callbacks['goodjob:mini-update']();release(data);await tick();assert(bar.hidden,'late response cannot restore signed-out data');assert.equal(bar.children.at(-1).textContent,'');
 // Exercise the real read-only query bridge with pagination and auth changes.
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf(' togetherScope(){'),end=html.indexOf('\n snapshot(month){',start);assert(start>0&&end>start);
 const queries=[],cloud={active:true,identity:{id:'staff',name:'담당',center:'센터'},sessionEpoch:1,client:{auth:{getSession:async()=>({data:{session:{user:{id:'auth-user'}}}})},from(table){const filters=[];queries.push({table,filters});const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},order(){return q},range:async(start)=>({data:start===0?Array.from({length:200},(_,id)=>({id})):[]})};return q}}};
 const c={cloud,directorPreviewState:{active:false},sharedState:{open:false},executiveState:{open:false},currentView:'personalWeek',currentOwner:()=>cloud.identity.name,currentCenter:()=>cloud.identity.center,cloudSessionGuard:()=>{const epoch=cloud.sessionEpoch;return()=>cloud.active&&epoch===cloud.sessionEpoch}};
 vm.createContext(c);vm.runInContext('var api={'+html.slice(start,end)+'};',c);const result=await c.api.togetherRows();assert.equal(result.length,200);assert.equal(queries.length,2);assert(queries.every(q=>q.table==='schedule_private_items'&&q.filters.some(([k,v])=>k==='user_id'&&v==='auth-user')));
 c.directorPreviewState.active=true;assert.equal(c.api.togetherScope(),'');assert.equal((await c.api.togetherRows()).length,0);
 console.log('PASS: checkbox toggles, task filtering, client date rules, team/logout clearing, stale response rejection, owner-only paginated reads');
})().catch(e=>{console.error(e);process.exitCode=1});
