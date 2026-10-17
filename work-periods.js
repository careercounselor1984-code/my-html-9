(function(root){'use strict';
const weekdays=['일','월','화','수','목','금','토'];
const key=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parse=s=>{const d=new Date(s+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')||key(d)!==s)throw new RangeError('날짜를 확인하세요.');return d};
const add=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return key(d)};
function range(date,view){const d=parse(date);if(view==='day')return [date,date];if(view==='week'){const start=add(date,-((d.getDay()+6)%7));return [start,add(start,6)]}return [key(new Date(d.getFullYear(),d.getMonth(),1)),key(new Date(d.getFullYear(),d.getMonth()+1,0))]}
function shift(date,view,n){if(view==='day'||view==='week')return add(date,n*(view==='week'?7:1));const d=parse(date),last=new Date(d.getFullYear(),d.getMonth()+n+1,0);return key(new Date(d.getFullYear(),d.getMonth()+n,Math.min(d.getDate(),last.getDate())))}
function dateLabel(date,short=false){const d=parse(date);return (short?Number(date.slice(5,7))+'/'+Number(date.slice(-2)):date)+' ('+weekdays[d.getDay()]+')'}
function periodLabel(date,view){const [start,end]=range(date,view);return start===end?dateLabel(start):dateLabel(start)+' ~ '+dateLabel(end)}
function days(date,view){let [start,end]=range(date,view);if(view==='month'){start=range(start,'week')[0];end=range(end,'week')[1]}const out=[];for(let d=start;d<=end;d=add(d,1))out.push(d);return out}
function calendar(date,view,renderCell){const [start,end]=range(date,view),today=key(new Date());let html='<div class="period-scroll" tabindex="0" aria-label="'+(view==='week'?'주간':'월간')+' 달력"><div class="period-grid period-'+view+'">'+['월','화','수','목','금','토','일'].map(w=>'<div class="period-weekday">'+w+'</div>').join('');for(const day of days(date,view)){const inRange=day>=start&&day<=end,w=parse(day).getDay(),content=renderCell(day,inRange),count=(content.match(/class="(?:planner-task|period-event)\b/g)||[]).length;html+='<section class="period-cell'+(!inRange?' outside':'')+(day===today?' is-today':'')+(w===0||w===6?' weekend':'')+'"><button type="button" class="period-day" data-day-number="'+Number(day.slice(-2))+'" data-period-day="'+day+'" aria-label="'+dateLabel(day)+' 일간 보기">'+dateLabel(day,true)+(day===today?'<span>오늘</span>':'')+'</button><div class="period-items">'+content+'</div><span class="period-count">'+(count?count+'건':'')+'</span></section>'}return html+'</div></div>'}
root.WorkPeriods={key,add,range,shift,dateLabel,periodLabel,days,calendar};if(typeof module!=='undefined')module.exports=root.WorkPeriods;
})(typeof window==='undefined'?globalThis:window);

