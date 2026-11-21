'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../client-link-model.js'),S=require('../client-link-sync.js');
const profile=M.merge(null,{regNo:'A12345678901',values:{name:'테스트 내담자',iapDate:'2026-11-21',serviceEnd:'2027-11-20',type:'1'}},'manual');
const existing={name:'테스트 내담자',regNo:'A12345678901',iapDate:'2026-11-21',dates:['2026-11-21'],memo:'기존 메모 보존',trainings:[{name:'훈련 보존'}],clientStatus:'active',eventChecks:{serviceEnd:{checked:true}}};
const updated=S.prepare(profile,existing);
assert.equal(updated.memo,existing.memo);
assert.deepEqual(updated.dates,existing.dates);
assert.deepEqual(updated.trainings,existing.trainings);
assert.deepEqual(updated.eventChecks,existing.eventChecks);
assert.equal(updated.serviceEnd,'2027-11-20');
assert.throws(()=>S.prepare(profile,{...existing,name:'다른 내담자'}),/다릅니다/);
assert.throws(()=>S.prepare(profile,{...existing,regNo:'A99999999999'}),/번호 불일치/);
assert.throws(()=>S.prepare({...profile,regNo:''},null),/등록번호/);
const code=fs.readFileSync('clients.js','utf8');
for(const term of [
 "e.source!==window.parent","e.origin!=='https://careercounselor1984-code.github.io'",
 "session?.user.id!==uid","staff.center!==identity.center",
 ".eq('user_id',uid)",".eq('kind','iap')",".eq('updated_at',old.updated_at)",
 "root.ClientImport.stableId(uid,regNo)","await autoSyncIap()"
])assert(code.includes(term),'missing guard: '+term);
const html=fs.readFileSync('clients.html','utf8');
assert(html.includes('client-link-model.js'));
assert(html.includes('client-link-sync.js'));
console.log('PASS owner-scoped calendar receiver: retained data, conflicts, auth, CAS, auto-dates');