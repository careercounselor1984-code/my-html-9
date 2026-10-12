'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const mini=fs.readFileSync('desktop-mini.js','utf8');
const css=fs.readFileSync('desktop-mini.css','utf8');
const manifest=JSON.parse(fs.readFileSync('mini.webmanifest','utf8'));
const sw=fs.readFileSync('sw.js','utf8');

const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
 .filter(m=>!/\bsrc\s*=/.test(m[1])&&m[2].trim());
for(const [i,m] of scripts.entries())new vm.Script(m[2],{filename:'inline-'+i+'.js'});
new vm.Script(mini,{filename:'desktop-mini.js'});
assert(html.includes('<script defer src="./desktop-mini.js"></script>'),'mini script included');
assert(html.includes('<link rel="stylesheet" href="./desktop-mini.css">'),'mini styles included');
assert(html.includes('window.goodjobMiniBridge='),'existing app bridge available');
assert(html.includes("window.dispatchEvent(new Event('goodjob:mini-update'))"),'calendar renders trigger mini refresh');
assert.equal(manifest.start_url,'./index.html?mini=1');
assert.notEqual(manifest.id,'./index.html','mini has separate install identity');
assert(sw.includes('./desktop-mini.js')&&sw.includes('./mini.webmanifest'),'mini install assets cached');
assert(css.includes(':not(#cloudGate):not(#desktopMiniRoot)'),'login gate preserved in mini view');
assert(!mini.includes('createClient('),'mini never creates a separate Supabase client');
assert(!mini.includes('localStorage.setItem'),'mini does not store another copy of appointments');

const a=html.indexOf('window.goodjobMiniBridge={');
const b=html.indexOf('\n};\n\nchangeView(currentView);',a);
assert(a>0&&b>a,'bridge source isolated');
const fake={
 cloud:{active:true,busy:false,needsSave:false,queueBlocked:false,
  identity:{id:'self',name:'상담사A',center:'북부센터'}},
 model:{events:[
  {id:'mine',center:'북부센터',owner:'상담사A',date:'2099-10-12',time:'09:00',title:'본인 예약',type:'초기'},
  {id:'other',center:'북부센터',owner:'상담사B',date:'2099-10-12',time:'09:30',title:'타인 예약',type:'초기',readonly:true},
  {id:'foreign',center:'동구지사',owner:'상담사A',date:'2099-10-12',time:'09:30',title:'타센터 예약',type:'초기'}
 ]},
 $:()=>({textContent:'동기화 완료',classList:{contains:()=>false}}),
 parseDate:s=>new Date(s+'T00:00:00'),
 dateKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
 isClosedDay:()=>false,slots:()=>['09:00','09:30'],minute:t=>Number(t.slice(0,2))*60+Number(t.slice(3)),
 withinSameDay:()=>true,matchingAt:(e,t)=>e.time===t,
 quickParse:()=>({error:'테스트 오류'}),console,
 window:{}
};
vm.runInNewContext(html.slice(a,b+3),fake);
const api=fake.window.goodjobMiniBridge;
assert(api,'mini bridge exists');
const snap=api.snapshot();
assert.equal(snap.active,true);
assert.equal(snap.events.length,1,'only authenticated user events are exposed');
assert.equal(snap.events[0].id,'mine');
assert.deepEqual(Array.from(api.times('2099-10-12')),['09:30'],'other staff bookings do not block own free slot');
assert.deepEqual(Array.from(api.times('2099-10-13')),['09:00','09:30']);
fake.cloud.needsSave=true;
api.refresh().then(()=>{throw Error('must refuse refresh while local writes are pending')}).catch(error=>{
 assert.match(error.message,/미전송 일정/);
 fake.cloud.active=false;
 assert.equal(api.snapshot().active,false,'logout hides personal data');
 assert.equal(api.snapshot().events,undefined,'logout emits no private appointment data');
 console.log('OK: mini script, PWA manifest, same-origin bridge, own-only entries, available times, safe reload guard, logout.');
}).catch(err=>{console.error(err);process.exitCode=1});
