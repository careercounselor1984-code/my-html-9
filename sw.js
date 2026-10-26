const CACHE='goodjob-schedule-v63-shift-nonblocking-20261026';
const ASSETS=['./schedule-save-recovery.js','./schedule-work-blocks.js','./client-auto-background.js','./clients-workspace.css','./client-deadlines.js','./calendar-workspace.css','./calendar-workspace.js','./schedule-theme.css','./notification-policy.js','./handoff.html','./handoff.js','./handoff.css','./secure-backup.js','./index.html','./manifest.webmanifest','./mini.webmanifest','./desktop-mini.css','./desktop-mini.js','./private-planner.js','./private-planner.css','./clients.html','./clients.js','./client-import.js','./client-xlsx.js','./clients.css','./tasks.html','./tasks.js','./app-menu.css','./work-periods.js','./work-periods.css','./task-model.js','./task-reminders.js','./task-details.css','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('goodjob-schedule-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request,{ignoreSearch:true})));});
self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?.json()||{}}catch{data={}}
 let energy=false;
 try{const target=new URL(data.url,self.registration.scope);energy=target.href.startsWith(self.registration.scope)&&target.searchParams.get('energySchool')==='1'}catch{}
 const title=energy?'에너지고 · 학교 등록 확인':'좋은일자리 업무 알림';
 const body=energy?'학교 출입 신청을 확인하세요. 로그인 후 등록 대상 상담사를 볼 수 있습니다.':'로그인 후 새 알림을 확인하세요.';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'./icon-192.png',badge:'./icon-192.png',tag:String(data.tag||'schedule').slice(0,80),
  data:{url:(typeof data.url==='string'&&data.url.startsWith(self.registration.scope))?data.url:'./index.html'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 let target=new URL('./index.html',self.registration.scope).href;
 const candidate=event.notification.data?.url;
 if(typeof candidate==='string'&&candidate.startsWith(self.registration.scope))target=candidate;
 const taskId=new URL(target).pathname.endsWith('/tasks.html')?new URL(target).searchParams.get('task'):null;
 const isDirectorReport=new URL(target).searchParams.get('directorReport')==='1';
 const isEnergySchool=new URL(target).searchParams.get('energySchool')==='1';
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async items=>{
  for(const client of items){
   if(new URL(client.url).origin===self.location.origin&&client.url.startsWith(self.registration.scope)){
    if(taskId){if(!new URL(client.url).pathname.endsWith('/tasks.html'))continue;await client.focus();client.postMessage({type:'goodjob:open-task',taskId});return;}
    await client.focus();if(isDirectorReport)client.postMessage({type:'goodjob:open-director-report'});if(isEnergySchool)client.postMessage({type:'goodjob:open-energy-school'});return;
   }
  }
  if(self.clients.openWindow)await self.clients.openWindow(target);
 }));
});
