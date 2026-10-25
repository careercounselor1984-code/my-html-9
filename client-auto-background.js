/* Reuse the authenticated, owner-scoped client page while the calendar is open. */
(()=>{'use strict';if(new URLSearchParams(location.search).get('mini')==='1')return;let frame=null,timer=null;
function sync(){const s=window.GoodJobCalendarWorkspace?.snapshot();if(!s?.authenticated){clearTimeout(timer);timer=null;frame?.remove();frame=null;return}if(frame||timer)return;timer=setTimeout(()=>{timer=null;if(!window.GoodJobCalendarWorkspace?.snapshot()?.authenticated)return;frame=document.createElement('iframe');frame.hidden=true;frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.title='내담자 IAP 자동 보완';frame.src=new URL('./clients.html?backgroundIap=1',location.href).href;document.body.append(frame)},500)}
window.addEventListener('goodjob:mini-update',sync);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
})();
