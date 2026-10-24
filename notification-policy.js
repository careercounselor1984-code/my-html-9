/* Shared popup history across the journal and schedule. Reading remains explicit. */
(function(root){'use strict';
 const KEY='goodjob_important_popup_v1:',DAY=86400000;
 function important(x){return !!x&&(x.source==='arrival'||x.source==='energy'||x.important===true||x.pinned===true||(x.source==='shared'&&/cover|handoff|대신|인계/.test(String(x.kind||''))));}
 function identity(user){return KEY+String(user||'').replace(/\s/g,'').trim();}
 function read(storage,user,now){try{const s=JSON.parse(storage.getItem(identity(user))||'{}');s.shown=s.shown||{};for(const [k,t] of Object.entries(s.shown))if(!Number.isFinite(t)||t<now-90*DAY)delete s.shown[k];return s}catch{return {shown:{}}}}
 function save(storage,user,s){try{storage.setItem(identity(user),JSON.stringify(s))}catch{}}
 function key(x){return x.source==='energy'?x.key+'|'+new Date().toISOString().slice(0,10):x.key;}
 function pending(items,storage,user,now=Date.now()){if(!user)return [];const s=read(storage,user,now);if(now<(s.snoozedUntil||0))return [];return items.filter(x=>!x.seen&&important(x)&&!s.shown[key(x)]);}
 function remember(items,storage,user,now=Date.now()){if(!user)return;const s=read(storage,user,now);for(const x of items)s.shown[key(x)]=now;const keys=Object.keys(s.shown);for(const k of keys.slice(0,Math.max(0,keys.length-2000)))delete s.shown[k];save(storage,user,s);}
 function snooze(storage,user,until){if(!user)return;const s=read(storage,user,Date.now());s.snoozedUntil=until;save(storage,user,s);}
 const api={important,pending,remember,snooze};root.GoodJobNotificationPolicy=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
