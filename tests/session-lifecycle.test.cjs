'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');function body(name){let start=html.indexOf('function '+name+'(');assert(start>=0,name);if(html.slice(start-6,start)==='async ')start-=6;const endings={cloudCommit:'\nasync function cloudReload',cloudReload:'\nfunction cloudApplyIdentity',cloudStartSession:'\nconst sharedTeam',cloudSessionGuard:'\nfunction cloudClearSession'};const end=html.indexOf(endings[name],start);assert(end>start,name+' boundary');return html.slice(start,end);}

const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
(async()=>{
 // An old auth check must not re-open the app after sign-out or a newer auth check.
 for(const phase of ['session','identity']){
  const pending=defer();let applies=0,calls=0;
  const cloud={sessionEpoch:0,active:false,client:{auth:{getSession:()=>phase==='session'?pending.promise:Promise.resolve({data:{session:{user:{id:'old'}}}})},rpc:()=>{calls++;return pending.promise}}};
  const c={cloud,cloudStatus(){},cloudApplyIdentity(){applies++}};vm.createContext(c);vm.runInContext(body('cloudStartSession'),c);const p=c.cloudStartSession();await Promise.resolve();cloud.sessionEpoch++;pending.resolve(phase==='session'?{data:{session:{user:{id:'old'}}}}:{data:{id:'old'}});await p;assert.equal(applies,0);if(phase==='session')assert.equal(calls,0);
 }
 // A pending snapshot must not restore previous-account data or overwrite a newer fetch.
 const cloud={sessionEpoch:1,active:true,identity:{id:'staff-a'},client:{rpc(){return pending.promise}},busy:false,needsSave:false};let pending=defer(),status=0;const model={events:[]};const c={cloud,model,cloudStatus(){status++}};vm.createContext(c);vm.runInContext(body('cloudSessionGuard')+'\n'+body('cloudReload'),c);const p=c.cloudReload();cloud.sessionEpoch++;cloud.active=false;pending.resolve({data:{identity:{id:'staff-a'},events:[{title:'old private record'}]}});await p;assert.equal(model.events.length,0);assert.equal(status,0);
 cloud.active=true;pending=defer();const first=c.cloudReload();const newer=defer();cloud.client.rpc=()=>newer.promise;const second=c.cloudReload();pending.resolve({data:{events:[{title:'older response'}]}});await first;assert.equal(model.events.length,0);newer.reject(Error('network'));await assert.rejects(second,/network/);assert.equal(status,1);
 // A read started before a local edit may not overwrite it, even after the edit finishes saving.
 for(const savingDone of [false,true]){
  const stale=defer();cloud.active=true;cloud.needsSave=false;cloud.busy=false;cloud.mutationEpoch=0;cloud.client.rpc=()=>stale.promise;const reading=c.cloudReload();model.events=[{title:'new local edit'}];cloud.mutationEpoch++;cloud.needsSave=!savingDone;stale.resolve({data:{events:[{title:'stale server snapshot'}]}});await reading;assert.equal(model.events[0].title,'new local edit');
 }
 // Revocation during upload stops subsequent writes/baseline changes.
 const write=defer();let followups=0;const cloud2={sessionEpoch:0,identity:{id:'a',center:'center',name:'A'},active:true,busy:false,needsSave:true,base:{events:new Map()},client:{}};
 const c2={cloud:cloud2,model:{events:[],participants:[],offs:[],notices:[]},cloudOwnRows:x=>x,cloudClean:x=>x,cloudSyncEvents:()=>write.promise,cloudSyncList:()=>{followups++},cloudMap:x=>new Map()};vm.createContext(c2);vm.runInContext(body('cloudSessionGuard')+'\n'+body('cloudCommit'),c2);const saving=c2.cloudCommit();cloud2.sessionEpoch++;cloud2.active=false;cloud2.busy=false;write.resolve(1);await saving;assert.equal(followups,0);assert.equal(cloud2.base.events.size,0);
 // Cache activation may evict only old schedule caches on the shared GitHub origin.
 const callbacks={},deleted=[];let work;const self={addEventListener:(name,fn)=>callbacks[name]=fn,clients:{claim:async()=>{}}};vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{self,caches:{keys:async()=>['goodjob-schedule-old','goodjob-schedule-v45-session-audit-20261018','journal-cache','other-app-cache'],delete:async key=>deleted.push(key)},URL});callbacks.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,['goodjob-schedule-old']);
 console.log('PASS: stale authentication/snapshot rejection, latest fetch, stopped cross-session follow-up writes and cross-app cache isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
