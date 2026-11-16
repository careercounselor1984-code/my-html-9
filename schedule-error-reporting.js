(function(root){'use strict';
 const CODES=['overlap','version','validation','network','backup','save'];
 function classify(message){
  const s=String(message||'');
  if(/버전 충돌|version conflict|stale version|동시 수정/i.test(s))return 'version';
  if(/백업|저장공간|quota|storage/i.test(s))return 'backup';
  if(/기존 상담 또는 근무 일정과 시간이 중복|일정.*겹|시간.*중복/.test(s))return 'overlap';
  if(/시각|날짜.*확인|시간.*확인|잘못된 시간|형식 오류/.test(s))return 'validation';
  if(/Failed to fetch|NetworkError|ERR_INTERNET|network|timeout|timed out|연결.*(실패|끊)|인터넷|offline/i.test(s))return 'network';
  return 'save';
 }
 const GUIDES={
  overlap:{label:'상담·근무 일정 중복',description:'동일 상담사 일정과 시간이 겹쳐 서버가 저장을 거부했습니다.',automatic:false,steps:['상담사 화면의 ‘저장 문제 해결’을 열어 겹치는 예약을 확인합니다.','날짜·시간을 수정하거나 해당 미저장 변경만 취소한 다음 서버 저장 완료를 확인합니다.']},
  version:{label:'다른 기기와 변경 충돌',description:'서버에서 일정이 먼저 변경되어 이전 버전의 수정 요청이 거부되었습니다.',automatic:false,steps:['상담사가 같은 기기에서 미전송 초안을 백업하도록 안내합니다.','서버 최신 일정과 비교한 뒤 필요한 수정만 다시 적용합니다. 전체 일정을 덮어쓰지 않습니다.']},
  validation:{label:'입력값 검증 실패',description:'입력한 일정의 날짜·시각 또는 형식이 서버 등록 조건에 맞지 않습니다.',automatic:false,steps:['‘저장 문제 해결’에서 날짜와 시작·종료 시간을 확인합니다.','잘못된 부분만 수정하고 ‘서버 저장 완료’ 표시를 확인합니다.']},
  network:{label:'네트워크 연결 문제',description:'브라우저와 서버 사이의 통신이 실패했을 가능성이 있습니다.',automatic:true,steps:['인터넷 연결을 확인하고 같은 기기에서 일정표를 다시 열어 봅니다.','미저장 초안을 삭제하지 말고 ‘저장 재시도’를 누른 뒤 완료 표시를 확인합니다.']},
  backup:{label:'기기 임시 백업 실패',description:'미저장 자료를 브라우저에 안전하게 보관하지 못해 전송을 차단했습니다.',automatic:false,steps:['현재 탭을 닫거나 사이트 데이터를 삭제하지 않습니다.','JSON 백업을 보관하고 기기 저장공간을 확인합니다.','백업이 확인될 때까지 해당 기기의 일정 수정을 중단합니다.']},
  save:{label:'서버 저장·확인 실패',description:'저장 요청이 실패했거나 정상 저장 응답을 받지 못했습니다. 이 보고만으로 세부 원인은 확정할 수 없습니다.',automatic:true,steps:['상담사가 같은 기기에서 ‘저장 재시도’를 누르고 완료 여부를 확인합니다.','반복되면 발생 시각과 화면의 오류 문구를 확인해 관리자에게 전달합니다.','미저장 자료가 남아 있다면 삭제·기기 변경 전에 백업을 확보합니다.']}
 };
 function guide(codeOrMessage,detail){
  const code=CODES.includes(codeOrMessage)?codeOrMessage:classify(detail||codeOrMessage);
  return {code,...GUIDES[code]};
 }
 function retryDelay(attempt){
  const n=Math.max(1,Math.min(32,Math.floor(Number(attempt)||1)));
  return Math.min(120000,4000*Math.pow(2,n-1));
 }
 function create({staffId,storage,rpc,isCurrent,uuid,onDelivery=()=>{}}){
  const key='schedule_issue_outbox_v1_'+staffId;let records=[],busy=false,rerun=false;
  try{const saved=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(saved))records=saved.filter(x=>x&&/^[0-9a-f-]{36}$/i.test(x.id)&&CODES.includes(x.code)&&typeof x.resolved==='boolean').map(x=>({id:x.id,code:x.code,count:Math.max(0,Math.min(10000,Number(x.count)||0)),resolved:x.resolved,delivered:x.delivered===true}));}catch{}
  function persist(){try{storage.setItem(key,JSON.stringify(records));}catch{}}
  async function flush(){
   if(busy){rerun=true;return;}
   if(!isCurrent())return;
   busy=true;
   try{
    for(const record of records.filter(x=>!x.delivered)){
     if(!isCurrent())return;
     const state={code:record.code,count:record.count,resolved:record.resolved};
     const {data,error}=await rpc('schedule_save_issue_report',{p_issue_key:record.id,p_code:state.code,p_resolved:state.resolved,p_pending_count:state.count});
     if(!isCurrent())return;
     if(error||!data?.ok)throw Error('오류 보고 전송 대기');
     if(record.code===state.code&&record.count===state.count&&record.resolved===state.resolved){
      record.delivered=true;persist();onDelivery(state.resolved);
     }else rerun=true;
    }
    records=records.filter(x=>!x.resolved||!x.delivered);persist();
   }catch{onDelivery(null);}finally{busy=false;if(rerun){rerun=false;void flush();}}
  }
  function open(message,count){
   if(!isCurrent())return;
   const code=classify(message),n=Math.max(0,Math.min(10000,Number(count)||0));
   let record=records.find(x=>!x.resolved);
   if(!record){record={id:uuid(),code,count:n,resolved:false,delivered:false};records.push(record);}
   else if(record.code!==code||record.count!==n){record.code=code;record.count=n;record.delivered=false;}
   persist();return flush();
  }
  function resolve(){
   if(!isCurrent())return;
   for(const record of records.filter(x=>!x.resolved)){record.resolved=true;record.delivered=false;}
   persist();return flush();
  }
  function acknowledgeResolvedKey(issueKey){
   if(!isCurrent()||!/^[0-9a-f-]{36}$/i.test(String(issueKey||'')))return false;
   const before=records.length;
   records=records.filter(x=>x.id!==issueKey);
   if(records.length!==before){persist();return true;}
   return false;
  }
  return {open,resolve,flush,acknowledgeResolvedKey};
 }
 const api={classify,guide,retryDelay,create};if(typeof module==='object'&&module.exports)module.exports=api;else root.ScheduleErrorReporting=api;
})(typeof window==='object'?window:globalThis);
