/* Reusable case template and a local, printable collection of selected cases. */
((root)=>{'use strict';
 const categories={general:'기타·일반',employment:'고용센터 공지',company:'회사 내 공지',center:'센터 공지',case:'업무 사례·재발 방지'};
 const template='1. 발생 상황\n\n\n2. 원인·놓친 부분\n\n\n3. 처리·해결 방법\n\n\n4. 재발 방지·확인 항목\n\n\n5. 교육 시 전달할 내용\n';
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(center,cards){
  const cases=cards.filter(c=>c.category==='case');
  const date=s=>s?new Date(s).toLocaleDateString('ko-KR'):'';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>업무 사례 교육자료</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic",sans-serif;max-width:850px;margin:30px auto;padding:0 20px;color:#23374c;line-height:1.8}h1{font-size:27px}h2{font-size:21px;overflow-wrap:anywhere}p.meta{font-size:12px;color:#64768b}a{color:#285c88}article{border-top:2px solid #adc2d6;padding-top:14px;margin-top:30px}.body{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:10px 18px;background:#225c91;color:white;border:0;border-radius:7px;font:inherit;cursor:pointer}@media print{button,.screen-note{display:none}body{margin:0;padding:0;max-width:none}article{break-before:page;border:0;margin:0;padding:0}h2{break-after:avoid}}</style></head><body><button onclick="window.print()">인쇄 · PDF로 저장</button><h1>'+escape(center)+' · 업무 사례 교육자료</h1><p>함께 배울 점과 재발 방지 방법</p><p class="meta">선택 사례 '+cases.length+'건 · 작성일 '+escape(date(new Date().toISOString()))+'</p><p class="screen-note">아래 사례를 검토한 뒤 위 버튼을 눌러 인쇄하거나 PDF로 저장하세요.</p><ol>'+cases.map((c,i)=>'<li><a href="#case-'+i+'">'+escape(c.title)+'</a></li>').join('')+'</ol>'+cases.map((c,i)=>'<article id="case-'+i+'"><h2>'+(i+1)+'. '+escape(c.title)+'</h2><p class="meta">'+escape(c.status==='done'?'완료·보관':'진행 중')+' · 최근 수정 '+escape(date(c.updated_at))+'</p><div class="body">'+escape(c.content)+'</div></article>').join('')+'</body></html>';
 }
 root.CenterBoardTraining={categories,template,html};
 if(typeof module!=='undefined')module.exports=root.CenterBoardTraining;
})(typeof window==='undefined'?globalThis:window);
