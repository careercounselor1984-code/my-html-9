'use strict';
const assert=require('node:assert/strict');require('../private-planner.js');
const {eventsFor,excluded}=require('../clients.js');
const original={id:'sample',kind:'iap',payload:{name:'검증용',dates:['2026-10-01','2026-11-01'],rediagnosisDate:'2026-12-01',serviceEnd:'2027-01-01',trainings:[{id:'stable',name:'과정',start:'2026-10-01',end:'2026-12-31'}]}};
const copy=()=>JSON.parse(JSON.stringify(original)),snapshot=JSON.stringify(original);
assert.equal(eventsFor([original]).length,6);
for(const status of ['employed','paused','ended']){const row=copy();Object.assign(row.payload,{clientStatus:status,statusDate:'2026-10-17'});assert.deepEqual(eventsFor([row]).map(e=>e.date),['2026-10-01','2026-10-01']);assert.equal(eventsFor([row],true).length,6);row.payload.eventRules={'due:2':{excluded:false}};assert.equal(eventsFor([row]).length,3);row.payload.dates[1]='2026-11-30';assert(eventsFor([row]).some(e=>e.date==='2026-11-30'),'explicit keep follows rescheduled date');row.payload.trainings.unshift({id:'new',name:'새 과정',start:'2026-11-01',end:'2026-12-01'});assert(!eventsFor([row]).some(e=>e.key.startsWith('training:new')),'new dates remain excluded after state change')}
const row=copy();row.payload.eventRules={'training:stable:end':{excluded:true}};assert.equal(eventsFor([row]).length,5);row.payload.trainings.unshift({id:'new',name:'신규',start:'2026-10-02',end:'2026-10-03'});assert(!eventsFor([row]).some(e=>e.key==='training:stable:end'),'training rules do not move when another course is inserted');row.payload.eventRules['training:stable:end'].excluded=false;assert.equal(eventsFor([row]).length,8);
assert.equal(JSON.stringify(original),snapshot,'rendering does not mutate source records');assert.equal(excluded({}, {key:'due:1',date:'2026-10-01'}),false);
console.log('PASS: status cutoff, selective keep, restore, re-diagnosis, stable training identity, rescheduled dates, legacy records');
