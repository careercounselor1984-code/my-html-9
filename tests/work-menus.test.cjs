'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
for(const file of ['index.html','tasks.html','clients.html']){const source=fs.readFileSync(file,'utf8');assert(source.includes('id="workMenu"'));for(const target of ['schedule','tasks','clients','leave'])assert(source.includes('data-main-menu="'+target+'"'),file+' shows '+target)}
assert(html.includes("['personalWeek','teamLeave'].includes(requested)"),'menu deep links override the last saved view');
const fn=html.match(/function isLeaveOverviewEvent\(e\)\{[^\n]+\}/)[0];
const context={isWorkEvent:e=>e.kind==='work'};vm.createContext(context);vm.runInContext(fn,context);
for(const type of ['연차','반차','2시간 연차','반반차','시차','외부교육'])assert(context.isLeaveOverviewEvent({kind:'work',type}),type+' included');
for(const type of ['외부홍보','출장','외근','내부교육','연장근무','휴일근무','회의','기타'])assert(!context.isLeaveOverviewEvent({kind:'work',type}),type+' excluded');
assert(!context.isLeaveOverviewEvent({kind:'consult',type:'외부교육'}));
assert(html.includes('allEventsFor(date).filter(isLeaveOverviewEvent)'),'desktop, mobile and day detail share the allowlist');
assert(!html.includes('PrivatePlanner.mount'),'no tasks embedded in appointment table');
console.log('PASS: common app menu with distinct screens; leave overview allows only leave, staggered work and external education');
