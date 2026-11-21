'use strict';
const assert=require('node:assert/strict'),M=require('../client-activity-model.js');
const r='A12345678901',base=[{id:'one',kind:'iap',payload:{regNo:r,name:'가상 내담자',clientStatus:'active'}},{id:'two',kind:'iap',payload:{regNo:'A98765432109',clientStatus:'ended'}}];
const activity=[
 {reg_no:r,activity_type:'consultation',activity_date:'2026-10-30',details:{pageId:'p05'}},
 {reg_no:r,activity_type:'consultation',activity_date:'2026-10-25',details:{pageId:'p04'}},
 {reg_no:r,activity_type:'date_change',activity_date:'2026-11-20'}
];
assert.equal(M.validDate('2026-02-30'),false);
assert.equal(M.validReg('a12345678901'),true);
assert.equal(M.daysBetween('2026-10-31','2026-11-21'),21);
const due=M.attention(base,activity,'2026-11-21');
assert.equal(due[0].status,'due');assert.equal(due[0].days,22);assert.equal(due[1].status,'inactive');
assert.equal(M.attention(base,[{reg_no:r,activity_type:'date_change',activity_date:'2026-11-21'}],'2026-11-21')[0].status,'unrecorded');
assert.equal(M.attention(base,[{reg_no:r,activity_type:'consultation',activity_date:'2026-11-20'}],'2026-11-21')[0].status,'recent');
const changes=M.fieldChanges({serviceEnd:'2027-01-01',dates:['2026-11-01'],clientStatus:'active'},{serviceEnd:'2027-01-03',dates:['2026-11-05'],clientStatus:'employed',statusDate:'2026-11-21'});
assert(changes.some(x=>x.field==='serviceEnd'));assert(changes.some(x=>x.field==='due:1'));assert(changes.some(x=>x.field==='clientStatus'));
assert.deepEqual(M.fieldChanges({memo:'old'},{memo:'new'}),[]);
const consult=M.consultation({regNo:r,date:'2026-11-21',pageId:'p05',sourceKey:'journal:p05:aaaa:2026-11-21:'+r},'2026-11-21');
assert.equal(consult.reg_no,r);assert.equal(consult.activity_type,'consultation');assert.equal(consult.details.pageId,'p05');
assert.throws(()=>M.consultation({regNo:r,date:'2026-11-22',pageId:'p05',sourceKey:'journal:p05:aaaa:2026-11-22:'+r},'2026-11-21'),/실제 상담일/);
assert.throws(()=>M.consultation({regNo:r,date:'2026-11-21',pageId:'p12',sourceKey:'journal:p12:aaaa:2026-11-21:'+r},'2026-11-21'),/상담 메뉴/);
console.log('PASS actual consultation chronology, strict 21-day followup and structured date/status diffs');
