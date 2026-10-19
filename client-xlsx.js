/* Minimal read-only OOXML reader. File bytes stay in this browser. */
(function(root){'use strict';
async function readXlsx(buffer){
 const bytes=new Uint8Array(buffer);if(bytes.length>8*1024*1024)throw Error('8MB 이하 파일을 사용해 주세요. 필요한 시트만 새 엑셀로 옮겨도 됩니다.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=n=>view.getUint16(n,true),u32=n=>view.getUint32(n,true);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50){end=i;break}
 if(end<0)throw Error('읽을 수 없는 엑셀입니다. 파일이 암호화되어 있으면 엑셀에서 전체 복사 후 붙여넣기를 사용해 주세요.');
 const count=u16(end+10);if(count>3000||u16(end+4)!==0)throw Error('이 엑셀 형식은 지원하지 않습니다. 복사·붙여넣기를 사용해 주세요.');
 const decoder=new TextDecoder(),files=new Map();let pos=u32(end+16),total=0;
 for(let i=0;i<count;i++){if(pos+46>bytes.length||u32(pos)!==0x02014b50)throw Error('엑셀 파일 구조를 확인할 수 없습니다.');const len=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),name=decoder.decode(bytes.subarray(pos+46,pos+46+len));files.set(name,{method:u16(pos+10),flags:u16(pos+8),size:u32(pos+24),packed:u32(pos+20),offset:u32(pos+42)});pos+=46+len+extra+comment;}
 async function xml(name,optional=false){const f=files.get(name);if(!f){if(optional)return null;throw Error('엑셀 시트 정보를 찾지 못했습니다.')}if(f.flags&1)throw Error('암호화된 파일입니다. 엑셀 내용을 복사해 붙여넣어 주세요.');if(f.size>12*1024*1024||(total+=f.size)>24*1024*1024)throw Error('시트 데이터가 너무 큽니다. 필요한 행만 복사해 주세요.');const o=f.offset;if(o+30>bytes.length||u32(o)!==0x04034b50)throw Error('파일 구조 오류');const start=o+30+u16(o+26)+u16(o+28);if(start+f.packed>bytes.length)throw Error('불완전한 엑셀 파일입니다.');let data=bytes.subarray(start,start+f.packed);
  if(f.method===8){if(typeof root.DecompressionStream!=='function')throw Error('현재 브라우저에서는 파일 읽기를 지원하지 않습니다. 복사·붙여넣기를 사용해 주세요.');const reader=new Blob([data]).stream().pipeThrough(new root.DecompressionStream('deflate-raw')).getReader(),parts=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>f.size||size>12*1024*1024){await reader.cancel();throw Error('파일 압축 크기를 확인해 주세요.')}parts.push(value)}data=new Uint8Array(size);let n=0;for(const p of parts){data.set(p,n);n+=p.length}}
  else if(f.method!==0)throw Error('지원하지 않는 압축 형식입니다.');if(data.length!==f.size)throw Error('손상된 엑셀 파일입니다.');const doc=new root.DOMParser().parseFromString(decoder.decode(data),'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('시트 내용을 읽지 못했습니다.');return doc;
 }
 const local=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name)),wb=await xml('xl/workbook.xml'),rels=await xml('xl/_rels/workbook.xml.rels'),strings=await xml('xl/sharedStrings.xml',true);const ss=strings?local(strings,'si').map(si=>local(si,'t').map(t=>t.textContent).join('')):[];if(['1','true'].includes(local(wb,'workbookPr')[0]?.getAttribute('date1904')))throw Error('1904 날짜 형식 파일입니다. 엑셀에서 전체 복사·붙여넣기를 이용해 주세요.');const links=new Map(local(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));const sheets=[];
 for(const sheet of local(wb,'sheet')){if(sheets.length>=20)break;const target=links.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));if(!target)continue;const path=target.startsWith('/')?target.slice(1):'xl/'+target;if(!/^xl\/worksheets\/[^/]+\.xml$/.test(path))continue;const doc=await xml(path),rows=[];
  for(const row of local(doc,'row')){if(rows.length>=2501)throw Error('한 번에 2,500행 이하로 가져와 주세요.');const values=[];for(const cell of local(row,'c')){const ref=cell.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0];if(!letters)continue;let col=0;for(const c of letters)col=col*26+c.charCodeAt(0)-64;if(col>256)continue;const type=cell.getAttribute('t'),v=local(cell,'v')[0]?.textContent||'';values[col-1]=type==='s'?(ss[Number(v)]||''):type==='inlineStr'?local(cell,'t').map(t=>t.textContent).join(''):v;}if(values.some(v=>String(v||'').trim()))rows.push(values)}sheets.push({name:sheet.getAttribute('name')||'시트',rows});
 }
 if(!sheets.length)throw Error('읽을 수 있는 시트가 없습니다.');return sheets;
}
root.ClientXlsx={readXlsx};if(typeof module!=='undefined')module.exports=root.ClientXlsx;
})(typeof window==='undefined'?globalThis:window);
