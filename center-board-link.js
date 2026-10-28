/* Shared launcher and always-visible important-work feed. */
(()=>{'use strict';
 if(window.GoodJobCenterBoard)return;
 const script=document.currentScript,base=new URL(script.dataset.boardBase||'./',location.href),journal=script.dataset.journal==='1',ORIGIN=base.origin;
 let name='',feed=null,viewer=null,dialog=null,bar=null;
 const url=(mode,id)=>{const u=new URL('board.html',base);if(mode)u.searchParams.set('mode',mode);if(journal)u.searchParams.set('journal','1');if(id)u.searchParams.set('card',id);return u.href};
 const identity=frame=>frame?.contentWindow?.postMessage({type:'goodjob:center-board-identity',name},ORIGIN);
 const style=document.createElement('style');style.textContent='.center-board-bar{clear:both;display:block;width:100%;max-width:1300px;margin:8px auto;background:#f7fafc;border:1px solid #dce6ef;border-radius:11px;overflow:hidden}.center-board-bar iframe{display:block;width:100%;height:45px;border:0}.center-board-dialog{width:min(1200px,calc(100% - 24px));max-width:1200px;height:90dvh;padding:0;border:1px solid #d4e1ed;border-radius:15px;background:white}.center-board-dialog::backdrop{background:#17314e88}.center-board-dialog>div{display:flex;justify-content:space-between;align-items:center;padding:8px 15px;background:#f2f6fa;border-bottom:1px solid #dce5ef;font:13px sans-serif}.center-board-dialog>div button{padding:5px 12px;border:1px solid #c7d8e7;border-radius:7px;background:white;cursor:pointer}.center-board-dialog iframe{width:100%;height:calc(100% - 47px);border:0;display:block}.cc-auth-pending .center-board-bar{display:none}body.mini-mode .center-board-bar{margin:3px 0}';document.head.append(style);
 function mount(){
  if(feed||journal&&!name)return;
  bar=document.createElement('section');bar.className='center-board-bar';bar.setAttribute('aria-label','센터 게시판 중요 업무');feed=document.createElement('iframe');feed.title='센터 중요 공지와 미제출 요청';feed.src=url('feed');bar.append(feed);
  const menu=document.querySelector('#workMenu');
  const target=journal?document.querySelector('.topbar'):null;
  if(target)target.after(bar);else if(menu)menu.after(bar);else document.body.prepend(bar);
  feed.addEventListener('load',()=>identity(feed));
 }
 function open(id=''){
  if(journal&&!name)return;
  if(dialog?.open)dialog.close();
  if(!dialog){dialog=document.createElement('dialog');dialog.className='center-board-dialog';const head=document.createElement('div'),title=document.createElement('strong'),close=document.createElement('button');title.textContent='센터 게시판';close.type='button';close.textContent='닫기 ×';close.onclick=()=>{dialog.close();viewer?.remove();viewer=null;refresh()};head.append(title,close);dialog.append(head);document.body.append(dialog);dialog.addEventListener('cancel',()=>{viewer?.remove();viewer=null;refresh()})}
  viewer?.remove();viewer=document.createElement('iframe');viewer.title='센터 카드 게시판';viewer.src=url('',id);viewer.addEventListener('load',()=>identity(viewer));dialog.append(viewer);dialog.showModal();
 }
 function refresh(){feed?.contentWindow?.postMessage({type:'goodjob:center-board-refresh'},ORIGIN)}
 function reset(){name='';dialog?.close();viewer?.remove();viewer=null;bar?.remove();bar=null;feed=null}
 window.GoodJobCenterBoard={open,refresh};
 window.addEventListener('message',event=>{
  if(event.origin!==ORIGIN||!event.data)return;
  const isFeed=event.source===feed?.contentWindow,isViewer=event.source===viewer?.contentWindow;
  if(!isFeed&&!isViewer)return;
  const msg=event.data;
  if(msg.type==='goodjob:center-board-ready')identity(isFeed?feed:viewer);
  if(msg.type==='goodjob:center-board-height'&&isFeed)feed.style.height=Math.max(40,Math.min(260,Number(msg.height)||40))+'px';
  if(msg.type==='goodjob:center-board-open'&&isFeed)open(typeof msg.id==='string'?msg.id:'');
  if(msg.type==='goodjob:center-board-refresh'&&isViewer)refresh();
 });
 if(journal){
  const actions=document.querySelector('.topActions');if(actions){const button=document.createElement('button');button.type='button';button.className='topBtn';button.id='centerBoardOpenBtn';button.textContent='📌 센터 게시판';button.onclick=()=>open();actions.prepend(button)}
  window.addEventListener('clg-auth-ready',event=>{const next=String(event.detail?.name||'');if(next!==name){reset();name=next}mount()});
  window.addEventListener('clg-auth-logout',reset);
  name=String(window.__CLG_JOURNAL_EMPLOYEE?.name||'');if(name)mount();
 }else{
  const menu=document.querySelector('#workMenu');if(menu&&!menu.querySelector('[data-main-menu="board"]')){const a=document.createElement('a');a.className='personal-page-link';a.dataset.mainMenu='board';a.href=url('');a.innerHTML='센터 게시판<small>공지 · 공유 메모 · 인원 취합</small>';menu.append(a)}
  mount();
 }
 function pushOpen(id){if(typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)){if(journal&&!name){pending=id;return}open(id)}}
 let pending='';
 window.addEventListener('clg-auth-ready',()=>{if(pending){const id=pending;pending='';pushOpen(id)}});
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='goodjob:open-center-card')pushOpen(event.data.cardId)});
 const initial=new URL(location.href).searchParams.get('centerCard');if(initial)pushOpen(initial);
})();
