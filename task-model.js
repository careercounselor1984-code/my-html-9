(function(root){'use strict';
const weekdays=['일','월','화','수','목','금','토'];
const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&!Number.isNaN(Date.parse(s+'T12:00:00'))&&new Date(s+'T12:00:00').getDate()===Number(s.slice(-2));
function type(row){return row.payload?.entryType==='memo'?'memo':'task'}
function due(row){return type(row)==='task'&&valid(row.payload?.dueDate)?row.payload.dueDate:''}
function displayDate(row){return due(row)||row.item_date}
function dateLabel(date){return valid(date)?date+' ('+weekdays[new Date(date+'T12:00:00').getDay()]+')':''}
function add(date,n){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function counts(rows,today){rows=rows.filter(r=>r.kind==='todo');const tasks=rows.filter(r=>type(r)==='task'),open=tasks.filter(r=>!r.payload.done);return {noDue:open.filter(r=>!due(r)).length,overdue:open.filter(r=>due(r)&&due(r)<today).length,today:open.filter(r=>due(r)===today).length,soon:open.filter(r=>due(r)>today&&due(r)<=add(today,7)).length,memo:rows.filter(r=>type(r)==='memo').length,done:tasks.filter(r=>r.payload.done).length}}
function select(rows,filter,today,start,end,search=''){return rows.filter(r=>r.kind==='todo').filter(r=>String(r.payload.text||'').toLowerCase().includes(search.toLowerCase())).filter(r=>{const p=r.payload,d=due(r),memo=type(r)==='memo';switch(filter){case 'noDue':return !memo&&!p.done&&!d;case 'memo':return memo;case 'done':return !memo&&!!p.done;case 'overdue':return !memo&&!p.done&&!!d&&d<today;case 'today':return !memo&&!p.done&&d===today;case 'soon':return !memo&&!p.done&&d>today&&d<=add(today,7);default:return !memo&&displayDate(r)>=start&&displayDate(r)<=end}}).sort((a,b)=>Number(!!a.payload.done)-Number(!!b.payload.done)||(displayDate(a)||'9999').localeCompare(displayDate(b)||'9999')||String(a.id).localeCompare(String(b.id)))}
function badge(row,today){if(type(row)==='memo')return {text:'메모',tone:'memo'};if(row.payload.done)return {text:'완료',tone:'done'};const d=due(row);if(!d)return {text:'기한 없음',tone:'plain'};if(d<today)return {text:'기한 지남',tone:'overdue'};if(d===today)return {text:'오늘 마감',tone:'today'};if(d<=add(today,7))return {text:'기한 임박',tone:'soon'};return {text:'할 일',tone:'plain'}}
function reminderIso(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value||'')||!valid(value.slice(0,10)))return '';const d=new Date(value+':00+09:00');return Number.isNaN(d.getTime())?'':d.toISOString()}
function localReminder(iso){const d=new Date(iso);return Number.isNaN(d.getTime())?'':new Date(d.getTime()+9*3600000).toISOString().slice(0,16)}
root.TaskModel={type,due,displayDate,dateLabel,add,counts,select,badge,reminderIso,localReminder};if(typeof module!=='undefined')module.exports=root.TaskModel;
})(typeof window==='undefined'?globalThis:window);
