/* Uses existing private-item RLS and revision checks; no new public data path. */
(function(root){'use strict';
const M=root.ClientLinkModel||(typeof require==='function'?require('./client-link-model.js'):null);
function prepare(profile,previous){
 if(!profile||!M.validReg(profile.regNo))throw Error('등록번호 확인 필요');
 const clean=M.merge(null,{regNo:profile.regNo,values:profile.values},'manual');
 if(!clean.values.name&&!previous?.name)throw Error('내담자 이름을 입력해 주세요.');
 if(previous?.regNo&&previous.regNo!==clean.regNo)throw Error('번호 불일치');
 for(const key of ['name','jobCertNo','jobCertExpire','iapDate','serviceEnd','type'])if(previous?.[key]&&clean.values[key]&&previous[key]!==clean.values[key])throw Error('일정표의 '+key+' 값과 다릅니다. 일정표에서 확인·수정해 주세요.');
 const payload=M.toSchedule(clean,previous);if(JSON.stringify(payload).length>19000)throw Error('저장 용량을 확인해 주세요.');return payload;
}
const api={prepare};root.ClientLinkSync=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
