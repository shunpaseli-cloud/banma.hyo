// No fetch/train/automatic scheduler. Atomically append final results from verified local JSON.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1]},apply=args.includes('--apply'),read=async p=>JSON.parse(await fs.readFile(p)),sha=v=>createHash('sha256').update(v).digest('hex')
const handle=await fs.open(path.join(root,'.confidence_history.lock'),'wx')
try{
 const corpus=await read(path.join(root,'public/confidence-history.json')),snapshot=await read(option('--snapshot',path.join(root,'public/prediction-snapshot.json'))),results=await read(option('--results',path.join(root,'public/verified-results.json'))),races=await read(path.join(root,'src/data/races_from_pdf.json')),server=await createServer({root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
 let output;try{const {appendFinalOutcomes}=await server.ssrLoadModule('/src/confidenceCorpus.js');output=appendFinalOutcomes(corpus,snapshot,results,races)}finally{await server.close()}
 if(apply&&output.audit.added.length){
  const latest=output.rows.at(-1)[0].slice(0,8),date=`${latest.slice(0,4)}-${latest.slice(4,6)}-${latest.slice(6,8)}`,version='nearest-history-'+latest+'-'+sha(JSON.stringify(output.rows)).slice(0,12),next={...corpus,version,latest_result_date:date,rows:output.rows},raw=JSON.stringify(next),manifest={schema_version:1,version,sha256:sha(raw),url:'confidence-history.json',latest_result_date:date,races:output.rows.length,built_at_jst:new Date(Date.now()+9*3600000).toISOString().replace('Z','+09:00')}
  const dir=path.join(root,'public/confidence-history-versions');await fs.mkdir(dir,{recursive:true})
  for(const [v,data] of [[corpus.version,await fs.readFile(path.join(root,'public/confidence-history.json'))],[version,Buffer.from(raw)]]){const dest=path.join(dir,v+'.json');let old;try{old=await fs.readFile(dest)}catch(e){if(e.code!=='ENOENT')throw e}if(old&&!old.equals(data))throw new Error('Immutable corpus version differs');if(!old)await fs.writeFile(dest,data,{flag:'wx'})}
  for(const [name,data] of [['confidence-history.json',raw],['confidence-history-version.json',JSON.stringify(manifest,null,2)+'\n']]){const dest=path.join(root,'public',name),tmp=dest+'.tmp';await fs.writeFile(tmp,data);await fs.rename(tmp,dest)}
 }
 console.log(JSON.stringify({apply,changed:apply&&output.audit.added.length>0,...output.audit}))
}finally{await handle.close();await fs.unlink(path.join(root,'.confidence_history.lock'))}
