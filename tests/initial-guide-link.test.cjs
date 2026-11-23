const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const codec=require('../initial-guide-link.js');
const event={type:'초기',date:'2026-11-25',time:'10:30',end:'11:00',owner:'테스트상담사',center:'북부센터',place:'울산광역시 북구 송내4길 14, 2층',title:'PRIVATE CLIENT',memo:'PRIVATE MEMO',participantId:'PRIVATE ID'};
test('initial-only snapshot preserves Korean date/counselor and omits client identity',()=>{
 const url=new URL(codec.url(event)),data=codec.decode(url.hash);
 assert.equal(data.counselor,event.owner);assert.equal(data.time,event.time);assert.equal(data.date,event.date);
 assert.equal(url.search,'');assert.ok(!JSON.stringify(data).includes('PRIVATE'));
 for(const type of ['해석','IAP','신청'])assert.throws(()=>codec.url({...event,type}));
});
test('invalid calendar dates/times and malformed fragments are rejected',()=>{
 assert.throws(()=>codec.url({...event,date:'2026-02-30'}));assert.throws(()=>codec.url({...event,time:'25:00'}));
 assert.throws(()=>codec.decode('#booking=invalid'));assert.equal(codec.decode(''),null);
 assert.match(codec.format(codec.decode(new URL(codec.url(event)).hash)),/2026.11.25.*10:30/);
});
function scope({type='초기',owner='직원',fail=false}={}){
 const elements={fperson:{value:'테스트'},ftype:{value:type},customType:{value:''},fowner:{value:owner},fcenter:{value:'북부센터'},dlg:{open:true},editor:{elements:{date:{value:'2026-11-25'},time:{value:'10:30'}}}};elements.fperson.dataset={};
 const ctx={window:{},$:(id)=>elements[id],resolveConsultationInput:()=>({type}),CUSTOM_TYPE:'custom',editorMode:'consult',editing:null,cloud:{active:true,identity:{name:'직원',id:'staff'},busy:false,needsSave:false},model:{events:[]},isConsultEvent:()=>true,clearTimeout(){}};
 ctx.saveEntry=async()=>{ctx.model.events.push({id:'new',owner,center:'북부센터',date:'2026-11-25',time:'10:30',end:'11:00',type});elements.dlg.open=false;ctx.cloud.needsSave=true;return true};
 ctx.cloudCommit=async()=>{ctx.cloud.needsSave=fail};
 const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');const start=source.indexOf('window.GoodJobInitialInvitation={'),end=source.indexOf('window.GoodJobCalendarWorkspace={',start);
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return ctx;
}
test('new own initial appointment saves before producing the invitation',async()=>{const c=scope(),e=await c.window.GoodJobInitialInvitation.saveAndRead();assert.equal(e.time,'10:30');assert.equal(e.type,'초기');assert.equal(c.cloud.needsSave,false);assert.equal(e.title,undefined)});
test('wrong type, another owner or failed server save cannot produce invitation',async()=>{for(const options of [{type:'해석'},{owner:'다른 직원'},{fail:true}])await assert.rejects(scope(options).window.GoodJobInitialInvitation.saveAndRead())});
test('initial-only action copies directly without creating a dialog or sending',async()=>{
 function element(){return {children:[],handlers:{},style:{},setAttribute(){},append(...items){this.children.push(...items)},addEventListener(name,fn){this.handlers[name]=fn},querySelector(key){return this.nodes[key]},nodes:{},showModal(){this.open=true}}}
 const form=element(),actions=element();form.nodes['.actions']=actions;actions.before=box=>form.box=box;
 let mode={consult:true,type:'초기',editing:false,own:true},copies=[],dialogs=[];
 const ctx={window:{GoodJobInitialGuideLink:codec,GoodJobInitialInvitation:{context:()=>mode,saveAndRead:async()=>event}},document:{getElementById:id=>id==='editor'?form:element(),createElement:tag=>{const e=element();if(tag==='dialog'){for(const k of ['[data-close]','[data-summary]','[data-message]','[data-preview]','[data-status]','[data-copy]'])e.nodes[k]=element();dialogs.push(e)}return e},body:{append(){}}},MutationObserver:class{observe(){}},navigator:{clipboard:{writeText:async s=>copies.push(s)}},queueMicrotask,clearTimeout(){},setTimeout(){return 1},alert:message=>{throw Error(message)}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../initial-guide-invitation.js'),'utf8'),ctx);
 assert.equal(form.box.hidden,false);mode={...mode,type:'해석'};form.handlers.change();assert.equal(form.box.hidden,true);
 mode={...mode,type:'초기',own:false};form.handlers.change();assert.equal(form.box.children[0].disabled,true);
 mode={...mode,own:true};form.handlers.change();await form.box.children[0].onclick();assert.equal(dialogs.length,0);
 assert.equal(copies.length,1);assert.match(copies[0],/2026.11.25.*10:30/);assert.match(copies[0],/https:\/\/m.site.naver.com\/2lzNF#b=/);assert.ok(!copies[0].includes('PRIVATE'));
});
