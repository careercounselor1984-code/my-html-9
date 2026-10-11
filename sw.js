const CACHE='goodjob-schedule-v24-5-push';
const ASSETS=['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?.json()||{}}catch{data={}}
 const title=typeof data.title==='string'?data.title.slice(0,55):'좋은일자리 상담 일정';
 const body=typeof data.body==='string'?data.body.slice(0,150):'새 업무 일정 알림이 있습니다.';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'./icon-192.png',badge:'./icon-192.png',tag:String(data.tag||'schedule').slice(0,80),
  data:{url:'./index.html'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL('./index.html',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async items=>{
  for(const client of items){
   if(new URL(client.url).origin===self.location.origin&&client.url.startsWith(self.registration.scope)){
    await client.focus();return;
   }
  }
  if(self.clients.openWindow)await self.clients.openWindow(target);
 }));
});