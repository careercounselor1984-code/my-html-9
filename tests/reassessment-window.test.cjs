'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
require('../private-planner.js');require('../work-periods.js');const T=require('../clients.js'),D=require('../client-deadlines.js');
const row=()=>({id:'A',kind:'iap',item_date:'2026-01-01',payload:{name:'검증',regNo:'REG-A',type:'1',iapDate:'2026-01-01',dates:['2026-01-01'],serviceEnd:'2026-12-31',rediagnosisDate:'2026-05-10'}});
const source=(extra={})=>({regNo:'REG-A',type:'1',iapDate:'2026-01-01',rediagnosisStart:'2026-04-02',rediagnosisEnd:'2026-07-01',trainings:[],...extra});
test('stored IAP visit dates link only to matching roster registration; add start/end events without changing appointment',()=>{
 const state={fields:{'#iapDate':'2026-01-01','#visitStart':'2026-04-02','#visitEnd':'2026-07-01'}};
 const storage={getItem:()=>JSON.stringify({records:{'REG-A':{state},'REG-B':{state}}})};
 const records=D.savedRecords(storage,[row()]);assert.equal(records.length,1);assert.equal(records[0].rediagnosisStart,'2026-04-02');
 const plan=D.planSaved(records,[row()],{})[0];assert.equal(plan.action,'update');assert.equal(plan.payload.rediagnosisDate,'2026-05-10');
 const events=T.eventsFor([{...row(),payload:plan.payload}]);assert.deepEqual(events.filter(x=>['rediagnosisStart','rediagnosisEnd'].includes(x.kind)).map(x=>[x.kind,x.date,x.source.source]),[['rediagnosisStart','2026-04-02','iap'],['rediagnosisEnd','2026-07-01','iap']]);
 assert.equal(D.planSaved(records,[{...row(),payload:plan.payload}],{})[0].action,'same');
 assert.equal(D.planSaved([source({regNo:'OTHER'})],[row()],{})[0].action,'blocked');
});
test('updated IAP dates refresh IAP-owned range; manual dates are preserved; check state does not carry to new date',()=>{
 let plan=D.planSaved([source()],[row()],{})[0],saved={...row(),payload:plan.payload};
 saved.payload.eventChecks={rediagnosisEnd:{date:'2026-07-01',checked:true}};
 plan=D.planSaved([source({rediagnosisEnd:'2026-07-02'})],[saved],{})[0];assert.equal(plan.payload.rediagnosisEnd,'2026-07-02');assert.equal(T.eventsFor([{...saved,payload:plan.payload}]).find(e=>e.kind==='rediagnosisEnd').checked,false);
 const manual=row();manual.payload.rediagnosisStart='2026-04-03';manual.payload.rediagnosisEnd='2026-06-30';plan=D.planSaved([source()],[manual],{})[0];assert.equal(plan.payload.rediagnosisStart,'2026-04-03');assert.equal(plan.payload.rediagnosisEnd,'2026-06-30');assert.equal(plan.warnings.length,2);
 const edited={...saved,payload:{...saved.payload,rediagnosisEnd:'2026-06-29'}};plan=D.planSaved([source({rediagnosisEnd:'2026-07-02'})],[edited],{})[0];assert.equal(plan.payload.rediagnosisEnd,'2026-06-29');
});
test('missing, invalid, partial and reversed source ranges never invent dates or erase saved range',()=>{
 for(const patch of [{rediagnosisStart:'',rediagnosisEnd:''},{rediagnosisStart:'2026-02-30'},{rediagnosisEnd:''},{rediagnosisStart:'2026-08-01'}]){const p=D.planSaved([source(patch)],[row()],{})[0];assert.equal(p.payload.rediagnosisStart,undefined);assert.equal(p.payload.rediagnosisEnd,undefined);}
 const plan=D.planSaved([source()],[row()],{})[0];const saved={...row(),payload:plan.payload};assert.equal(D.planSaved([source({rediagnosisStart:'',rediagnosisEnd:''})],[saved],{})[0].payload.rediagnosisEnd,'2026-07-01');
 const wrong=D.planSaved([source({iapDate:'2025-01-01'})],[row()],{})[0];assert.equal(wrong.action,'blocked');
});
