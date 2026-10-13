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
assert(html.includes("schedule_arrival_action"),'arrival state is managed only with server RPC');
assert(html.includes("schedule_arrival_feed"),'owner gets authenticated arrival notifications');
assert(html.includes("schedule_arrival_ack"),'arrival acknowledgement uses scoped RPC');
assert(html.includes("on('postgres_changes'"),'real-time arrival listens to PostgreSQL changes');
assert(html.includes("filter:'recipient_id=eq.'+staffId"),'real-time arrivals are scoped by logged-in recipient');
assert(html.includes("arrivalRealtimeStart();"),'real-time receiver starts after login');
assert(/arrivalRealtimeStop\(\);(?:directorPreviewExit\(\);)?await cloud\.client\.auth\.signOut\(\)/.test(html),'logout closes the arrival receiver');
assert(html.includes("arrivalRealtimeRefresh()"),'arrival notification refreshes authenticated server feed');
assert(html.includes("!data.mine&&data.newArrival===true)pushNotify('arrival',eventId)"),'check-in sends immediate push once for another counselor');
assert(html.includes("window.setInterval(()=>{if(cloud.active&&!document.hidden)alertPoll(true)},45000)"),'periodic inbox polling remains a fallback');
assert(sw.includes("showNotification("),'existing service worker displays web push');
assert(mini.includes("refreshArrivals(true)"),'team UI refreshes authoritative check-in state');
assert(mini.includes("miniArrivalInbox"),'mini UI can show owner an unread arrival');
assert(html.includes("x.source==='arrival'"),'arrival alerts are rendered in main schedule');
assert(html.includes("source:['shared','board','work','report','notice','arrival']"),'embedded journal receives arrival alerts');
assert(html.includes('id="moveScheduleBtn" class="hide">시간 변경'),'short editor button labels used');
assert(html.includes("#dlg #editor>.actions>#saveEntryBtn"),'primary save and cancel controls get their own row');
assert(mini.includes('window.documentPictureInPicture.requestWindow'),'Chrome always-on-top uses the browser API, not a Windows executable');
assert(mini.includes("opened.document.body.append(root,dlg)"),'mini calendar and booking form move together into PiP');
assert(mini.includes("opened.addEventListener('pagehide',restoreMini"),'closing PiP restores the normal mini browser window');
assert(mini.includes("focusEditor(()=>bridge.edit(e.id))"),'editing in PiP brings the original editor to foreground');
assert(mini.includes("if(!window.isSecureContext||!window.documentPictureInPicture)$('miniPin').hidden=true"),'unsupported browsers use normal mini window');
assert(html.includes("document.visibilityState==='visible'||window.goodjobMiniPiPActive"),'server polling continues when browser PiP is visible');
assert(mini.includes("quick.insertAdjacentElement('afterend',launcher)"),'main calendar has a direct mini button');
assert(mini.includes('miniCenter')&&mini.includes('miniMine'),'own and team switching buttons exist');
assert(mini.includes('nowMinutes-60')&&mini.includes('nowMinutes+120'),'team window includes previous hour and next two hours');
assert(mini.includes('miniWindowControls'),'team window can switch to full-day');
assert(css.includes('box-sizing:border-box'),'PiP has independent content-box protection');
assert(css.includes('overflow-x:hidden'),'PiP prevents horizontal content overflow');


const a=html.indexOf('window.goodjobMiniBridge={');
const b=html.indexOf('\n};\n\nchangeView(currentView);',a);
assert(a>0&&b>a,'bridge source isolated');
const fake={
 cloud:{active:true,busy:false,needsSave:false,queueBlocked:false,
  identity:{id:'self',name:'상담사A',center:'북부센터'}},
 model:{events:[
  {id:'mine',center:'북부센터',owner:'상담사A',date:'2099-10-12',time:'09:00',title:'본인 예약',type:'초기'},
  {id:'other',center:'북부센터',owner:'상담사B',date:'2099-10-12',time:'09:30',title:'다른 사람의 비밀 내담자 이름',memo:'민감 메모',type:'초기',readonly:true},
  {id:'foreign',center:'동구지사',owner:'상담사A',date:'2099-10-12',time:'09:30',title:'타센터 예약',type:'초기'}
 ]},
 $:()=>({textContent:'동기화 완료',classList:{contains:()=>false}}),
 parseDate:s=>new Date(s+'T00:00:00'),
 dateKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
 isClosedDay:()=>false,slots:()=>['09:00','09:30'],minute:t=>Number(t.slice(0,2))*60+Number(t.slice(3)),
 withinSameDay:()=>true,matchingAt:(e,t)=>e.time===t,
 quickParse:()=>({error:'테스트 오류'}),isConsultEvent:e=>e.type==='초기',console,
 window:{}
};
vm.runInNewContext(html.slice(a,b+3),fake);
const api=fake.window.goodjobMiniBridge;
assert(api,'mini bridge exists');
const snap=api.snapshot();
assert.equal(snap.active,true);
assert.equal(snap.events.length,1,'only authenticated user events are exposed');
assert.equal(snap.events[0].id,'mine');
assert.equal(snap.teamEvents.length,2,'only own center appointments exposed');
const other=snap.teamEvents.find(e=>e.owner==='상담사B');
assert(other&&other.readonly,'another staff entry is read-only');
assert.equal(other.id,null,'other staff editable id is withheld');
assert.equal(other.arrivalEventId,'other','other staff same-center event can only be used by the checked server arrival RPC');
assert.equal(other.title,'상담 예약','other staff client name masked');
assert.equal(other.memo,undefined,'other staff memo withheld');
assert(!JSON.stringify(snap.teamEvents).includes('비밀 내담자'),'other staff identity never reaches mini DOM');
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
