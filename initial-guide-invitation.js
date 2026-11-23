(function(){'use strict';
 const api=window.GoodJobInitialInvitation,codec=window.GoodJobInitialGuideLink,editor=document.getElementById('editor');if(!api||!codec||!editor)return;
 const box=document.createElement('div');box.style.cssText='margin:12px 0;padding:12px;border:1px solid #d5e3ce;border-radius:10px;background:#f4f8f0';box.hidden=true;
 const button=document.createElement('button');button.type='button';button.id='initialGuideBtn';button.style.cssText='width:100%;background:#375b43;color:white;border:0;border-radius:8px;padding:12px;font-weight:700';
 const hint=document.createElement('p');hint.style.cssText='font-size:11px;color:#66775d;line-height:1.5;margin:8px 0 0';hint.textContent='저장한 일정의 일시·담당 상담사가 안내 페이지에 표시됩니다.';
 box.append(button,hint);const actions=editor.querySelector('.actions');if(actions)actions.before(box);else editor.append(box);
 const toast=document.createElement('div');toast.id='initialGuideCopyStatus';toast.setAttribute('role','status');toast.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;background:#294d36;color:white;padding:13px 18px;border-radius:12px;box-shadow:0 4px 20px #0002;font-size:13px;max-width:calc(100vw - 32px);width:max-content;line-height:1.6';toast.hidden=true;document.body.append(toast);let working=false,timer;
 function notify(text){clearTimeout(timer);toast.textContent=text;toast.hidden=false;timer=setTimeout(()=>{toast.hidden=true},5000)}
 function update(){const x=api.context();box.hidden=x.type!=='초기'||!x.consult;button.textContent=working?'저장·복사 중…':x.editing?'초기상담 안내 복사':'저장하고 초기상담 안내 복사';button.disabled=working||!x.own;hint.textContent=x.own?'안내문이 바로 복사됩니다. 참여자 대화창에 붙여넣어 보내 주세요.':'담당 상담사가 본인 일정에서 안내문을 복사할 수 있습니다.'}
 function message(event){const link=codec.url(event);return ['안녕하세요. 좋은일자리 '+event.center+' '+event.owner+' 상담사입니다.','','초기상담 일시: '+codec.format(event),...(event.place?['장소: '+event.place]:[]),'별도로 준비할 서류는 없습니다.','','방문 전 아래 안내를 확인해 주세요.',link,'','일정 변경·지각·위치 문의는 담당 상담사에게 직접 연락해 주세요.'].join('\n')}
 async function copy(text){try{await navigator.clipboard.writeText(text);return true}catch{const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.style.cssText='position:fixed;left:-9999px;top:0;';document.body.append(area);area.focus();area.select();let ok=false;try{ok=document.execCommand('copy')}catch{}area.remove();return ok}}
 button.onclick=async()=>{if(working)return;working=true;update();try{const prepared=api.saveAndRead().then(message);let copied=false;
  // Begin the clipboard request inside the click gesture; defer its text until saving succeeds.
  if(navigator.clipboard?.write&&typeof ClipboardItem==='function'){try{await navigator.clipboard.write([new ClipboardItem({'text/plain':prepared.then(text=>new Blob([text],{type:'text/plain'}))})]);copied=true}catch{}}
  const text=await prepared;if(!copied)copied=await copy(text);notify(copied?'복사했습니다. 카톡에 바로 붙여넣어 주세요.':'자동 복사가 차단되었습니다. 브라우저의 클립보드 권한을 확인한 뒤 다시 눌러 주세요.');
 }catch(e){notify(e.message||'일정 저장 상태를 확인해 주세요.')}finally{working=false;update()}};
 editor.addEventListener('input',update);editor.addEventListener('change',update);editor.addEventListener('click',()=>queueMicrotask(update));new MutationObserver(update).observe(document.getElementById('dlg'),{attributes:true,attributeFilter:['open']});update();
})();
