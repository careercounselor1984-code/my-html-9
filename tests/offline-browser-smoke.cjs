'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const chrome=['google-chrome','chromium','chromium-browser'].find(x=>cp.spawnSync('which',[x]).status===0);assert(chrome,'Chrome required');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'goodjob-offline-')),fixture=path.join(temp,'site');
try{
 cp.execFileSync(process.execPath,[path.join(__dirname,'prepare-offline-smoke.cjs'),fixture],{cwd:path.resolve(__dirname,'..'),stdio:'pipe'});
 for(const [name,query,markers]of [['index.html','',['cloudGate']],['index.html','?mini=1',['desktopMiniRoot','cloudGate']],['clients.html','',['id="cycle0"','로그인 모듈을 불러오지 못했습니다']],['tasks.html','',['id="plannerTodoText"']]]){
  let result;for(let attempt=0;attempt<2;attempt++){
   const profile=path.join(temp,'profile-'+name.replace('.','-')+'-'+(query?'mini':'main')+'-'+attempt);
   result=cp.spawnSync(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * 127.0.0.1, EXCLUDE localhost','--user-data-dir='+profile,'--virtual-time-budget=2500','--dump-dom',pathToFileURL(path.join(fixture,name)).href+query],{encoding:'utf8',timeout:25000,maxBuffer:8*1024*1024});
   if(result.error?.code!=='ETIMEDOUT')break;
   console.warn('Chrome did not exit for '+name+query+'; retrying once with a separate profile.');
  }
  assert.equal(result.status,0,name+query+' Chrome exit: '+(result.error?.message||String(result.stderr).slice(-2000)));
  for(const marker of markers)assert(result.stdout.includes(marker),name+query+' missing '+marker+'; DOM tail: '+result.stdout.slice(-2000));
  console.log('PASS: offline initial screen '+name+query+'; local scripts mounted and login gate present');
 }
}finally{
 assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()),'cleanup restricted to the created temporary test directory');fs.rmSync(temp,{recursive:true,force:true});
}
