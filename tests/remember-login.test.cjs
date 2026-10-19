'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}}
for(const file of ['index.html','clients.js','tasks.js']){
 const text=fs.readFileSync(file,'utf8');let source;
 if(file==='index.html'){source=text.slice(text.indexOf('const CLOUD_REMEMBER_PREF='),text.indexOf('const cloud={'));source+='\nglobalThis.adapter=cloudAuthStorage;globalThis.keep=cloudRemember;'}
 else {source=text.split('\n').find(x=>x.includes('const remember=')&&x.includes('storage='));assert(source);source+='\nglobalThis.adapter=storage;globalThis.keep=remember;'}
 const c={localStorage:memory(),sessionStorage:memory()};vm.createContext(c);vm.runInContext(source,c);const s=c.adapter,key='auth-token',pref='goodjob_schedule_remember_v1';
 assert.equal(c.keep(),true,file+' defaults to persistent login');s.setItem(key,'persistent');c.sessionStorage.clear();assert.equal(s.getItem(key),'persistent',file+' survives session close');
 c.sessionStorage.setItem(key,'newer');assert.equal(s.getItem(key),'newer');assert.equal(c.localStorage.getItem(key),'newer');assert.equal(c.sessionStorage.getItem(key),null);
 c.localStorage.setItem(pref,'0');assert.equal(c.keep(),false,file+' keeps explicit opt-out');s.setItem(key,'session-only');assert.equal(c.sessionStorage.getItem(key),'session-only');assert.equal(c.localStorage.getItem(key),'newer');assert.equal(s.getItem(key),'session-only');
 s.removeItem(key);assert.equal(c.localStorage.getItem(key),null);assert.equal(c.sessionStorage.getItem(key),null);
}
console.log('PASS: calendar/client/task persistent default, session migration, explicit opt-out and sign-out clear both stores');
