'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function body(name){
 const start=html.indexOf('function '+name+'(');
 assert(start>=0,name);
 const match=html.slice(start).match(new RegExp('^function '+name+'\\([\\s\\S]*?\\n\\}'));
 assert(match,name+' end');return match[0];
}
const daySlots=['09:00','09:30','10:00','10:30','11:00','11:30','13:00','13:30','14:00'];
const state={day:'2026-10-16',events:[],target:{}};
const context={
 currentView:'teamDay',focusDate:new Date('2026-10-16T00:00:00Z'),
 dateKey:()=>state.day,currentCenter:()=> '북부센터',currentOwner:()=> 'A',
 employees:()=>['A','B'],allEventsFor:()=>state.events,slots:()=>daySlots,
 parseDate:d=>new Date(d+'T00:00:00Z'),
 isFridayClosed:(d,t)=>new Date(d+'T00:00:00Z').getUTCDay()===5&&t>='12:00',
 isClosedDay:()=>false,holidays:()=>[],matchingAt:(e,t)=>e.time<=t&&t<e.end,
 isConsultEvent:e=>e.kind==='consult',isWorkEvent:e=>e.kind==='work',
 escapeHtml:v=>String(v),showName:e=>e.title,typeClass:()=> 'field',eventBlock:e=>'<b>'+e.title+'</b>',
 sharedNotices:()=>[],alert:()=>{},$:()=>state.target
};
vm.createContext(context);
vm.runInContext('const isLeavePrintEvent=e=>isWorkEvent(e)&&["연차","반차","2시간 연차","반반차"].includes(e.type); const isContinuousWorkPrintEvent=e=>isWorkEvent(e)&&!isLeavePrintEvent(e);'+body('teamDay')+'\n'+body('buildDailyPrint'),context);
const external={id:'x',owner:'A',kind:'work',time:'09:30',end:'11:00',type:'외부홍보',title:'설명회'};
state.events=[external];
let result=context.teamDay();
assert.equal((result.match(/금요일 오후 비근무/g)||[]).length,1);
assert(!result.includes('>13:30<'));
assert(result.includes('rowspan="3" class="slot teamday-band teamday-band-promotion"'));
assert.equal((result.match(/설명회/g)||[]).length,1,'activity label once');
context.buildDailyPrint(state.day,{audience:'staff'});
assert.equal((state.target.innerHTML.match(/금요일 오후 비근무/g)||[]).length,1);
assert(state.target.innerHTML.includes('colspan="2"'));
context.buildDailyPrint(state.day,{audience:'visitor'});
assert(!state.target.innerHTML.includes('설명회'),'visitor print excludes internal activity');
state.day='2026-10-15';
result=context.teamDay();assert(result.includes('>13:30<'),'weekday afternoon preserved');
state.events=[external,{id:'y',owner:'A',kind:'consult',time:'10:00',end:'10:30',type:'초기',title:'상담'}];
result=context.teamDay();assert(!result.includes('teamday-band-promotion'),'overlap keeps both entries visible');assert(result.includes('상담'));
state.events=[{...external,type:'2시간 연차',title:'연차'}];
result=context.teamDay();assert(result.includes('teamday-band-leave'));assert.equal((result.match(/>2시간 연차</g)||[]).length,1);
const cloud={active:true,identity:{id:'north',center:'북부센터',role:'manager',isAdmin:true}};
const inScope=new Function('cloud','return ('+body('alertInScope')+')')(cloud);
for(const scope of ['전체','all','전체 지사','북부센터'])assert(inScope({scope}));
for(const scope of ['서부센터','동구지사','남부본사','',undefined])assert(!inScope({scope}));
cloud.identity.role='director';assert(inScope({scope:'서부센터'}));
cloud.active=false;assert(!inScope({scope:'전체'}));
console.log('PASS: Friday compact row, merged activity, overlap visibility, visitor privacy and center alert scope');
