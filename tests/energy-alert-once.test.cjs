'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf("const ENERGY_POPUP_LOG_KEY='goodjob_energy_popup_once_per_visit_v1'");
const end = html.indexOf('/* Alert bridge to the trusted organization', start);
assert(start>=0&&end>start, 'energy notification helper exists');
const source = html.slice(start,end);
const store = new Map();
const storage = {
 getItem:key=>store.get(key)||null,
 setItem:(key,value)=>store.set(key,value)
};
const cloud={identity:{id:'north-team-leader'}};
const {energyPopupPreviouslyShown,rememberEnergyPopup} =
 new Function('cloud','localStorage','console',source+';return {energyPopupPreviouslyShown,rememberEnergyPopup}')(
 cloud,storage,console);
const energy1={source:'energy',key:'energy:2026-10-14:signature-a'};
const energy2={source:'energy',key:'energy:2026-10-14:signature-b'};
const energy3={source:'energy',key:'energy:2026-10-20:signature-a'};
assert.equal(energyPopupPreviouslyShown(energy1),false,'first reminder appears');
rememberEnergyPopup([energy1]);
assert.equal(energyPopupPreviouslyShown(energy1),true,'same visit suppressed after first popup');
assert.equal(energyPopupPreviouslyShown(energy2),false,'new appointment signature can re-alert');
assert.equal(energyPopupPreviouslyShown(energy3),false,'different day can still alert');
assert.equal(energyPopupPreviouslyShown({source:'arrival',key:'arrival:1'}),false,'arrival alerts unchanged');
cloud.identity.id='other-account';
assert.equal(energyPopupPreviouslyShown(energy1),false,'other user reminder is independent');
cloud.identity.id='north-team-leader';
assert(html.includes("const fresh=alertUnread().filter(x=>!alerts.shown.has(x.key)&&!energyPopupPreviouslyShown(x));"),'popup candidates exclude repeated Energy reminders');
assert(html.includes('rememberEnergyPopup(fresh);'),'saves popups immediately before showing');
assert(html.includes("alerts.items=[...arrivals,...energy,"),'Energy reminders remain in unread list for confirmation');
console.log('Energy reminder repeat-suppression tests passed');
