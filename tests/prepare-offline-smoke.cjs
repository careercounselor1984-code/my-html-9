'use strict';
// Inspect local initial-screen rendering without waiting for third-party CDN requests.
const fs=require('node:fs'),path=require('node:path');
const target=process.argv[2]||'/tmp/goodjob-offline-smoke';fs.mkdirSync(target,{recursive:true});
for(const entry of fs.readdirSync('.',{withFileTypes:true})){
 if(!entry.isFile())continue;
 const source=entry.name,output=path.join(target,source);
 if(source.endsWith('.html'))fs.writeFileSync(output,fs.readFileSync(source,'utf8').replace(/<script\b[^>]*\bsrc=["']https?:\/\/[^"']+["'][^>]*>\s*<\/script>/gi,''));
 else fs.copyFileSync(source,output);
}
console.log('Prepared offline initial-screen copies; remote scripts omitted, production sources unchanged.');
