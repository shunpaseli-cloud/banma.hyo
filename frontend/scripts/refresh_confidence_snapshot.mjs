// Confidence-only migration/update: NEVER regenerate horse predictions, weather, saved time or BOX.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
import {resultProjection} from './generate_prediction_snapshot.mjs'
const ROOT=path.resolve(import.meta.dirname,'..'),sha=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>Buffer.from(JSON.stringify(v,null,1)+'\n'),read=n=>fs.readFile(path.join(ROOT,'src/data',n)),stamp=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}).replace(' ','T')+'+09:00'
const lock=path.join(ROOT,'.prediction_snapshot.lock'),handle=await fs.open(lock,'wx')
try{
 const old=JSON.parse(await read('prediction_snapshot.json')),generated=stamp(),archiveName='previous-'+old.meta.version,archive=path.join(ROOT,'public/prediction-history',archiveName)
 await fs.mkdir(archive,{recursive:true})
 for(const n of ['prediction-snapshot.json','prediction-version.json','recommendations.json','confidence-results.json','verified-results.json','feedback-inputs.json','results.json']){const data=await fs.readFile(path.join(ROOT,'public',n));let existing;try{existing=await fs.readFile(path.join(archive,n))}catch(e){if(e.code!=='ENOENT')throw e}if(existing&&!existing.equals(data))throw new Error('Old version immutable archive differs '+n);if(!existing)await fs.writeFile(path.join(archive,n),data)}
 const races=JSON.parse(await read('races_from_pdf.json')),byId=new Map(races.map(r=>[r.race_id,r])),corpus=JSON.parse(await fs.readFile(path.join(ROOT,'public/confidence-history.json'))),server=await createServer({root:ROOT,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
 let rows
 try{const {NearestIndex,replaceConfidence}=await server.ssrLoadModule('/src/confidenceNearest.js'),index=new NearestIndex(corpus);rows=old.races.map(r=>replaceConfidence(r,byId.get(r.race_id),{index,at:generated}))}finally{await server.close()}
 const models={};for(const n of ['learned_model.json','learned_model_rain.json','learned_weights.json'])models[n]=sha(await read(n))
 const engineFiles=['feedback.js','learnScore.js','learnCore.js','moisture.js','memrobo.js','trio.js','selectionReason.js','calculateSnapshot.js','snapshotPolicy.js','confidenceNearest.js'],engine=sha(Buffer.concat(await Promise.all(engineFiles.map(n=>fs.readFile(path.join(ROOT,'src',n))))))
 const version='nearest-'+generated.replace(/[-:]/g,'').replace('+0900','JST')+'-'+sha(bytes(rows)).slice(0,12),meta={...old.meta,version,generated_at_asia_tokyo:generated,confidence_updated_at:generated,models,engine,confidence_method:'nearest-v1',confidence_history:{version:corpus.version,latest_result_date:corpus.latest_result_date,races:corpus.rows.length},previous_confidence_archive:'prediction-history/'+archiveName+'/',confidence_policy:'Confidence-only update. Horse scores/ranking/recommended/tickets/comments and original prediction saved time are retained. Historical confidence is a retrospective composite, not prestart performance.'}
 rows=rows.map(r=>({...r,snapshot_version:version}));const snapshot={schema_version:2,meta,races:rows},results=JSON.parse(await read('verified_results.json')),projection=resultProjection(snapshot,results),recommendations={meta,races:rows.map(({predictions,...r})=>r)},pointer={version,generated_at_asia_tokyo:generated,models,engine,weather_status:meta.weather.status,weather_retrieved_at:meta.weather.retrieved_at,legacy:meta.legacy,confidence_method:'nearest-v1',confidence_history:meta.confidence_history,snapshot_sha256:sha(bytes(snapshot))}
 const outputs={'prediction-snapshot.json':bytes(snapshot),'prediction-version.json':bytes(pointer),'recommendations.json':bytes(recommendations),'confidence-results.json':bytes(projection)}
 for(const [name,data] of Object.entries(outputs)){const history=path.join(ROOT,'public/prediction-history',version,name);await fs.mkdir(path.dirname(history),{recursive:true});await fs.writeFile(history,data,{flag:'wx'});for(const dest of [path.join(ROOT,'public',name),path.join(ROOT,'src/data',name.replace('prediction-snapshot','prediction_snapshot').replace('prediction-version','prediction_version'))]){const tmp=dest+'.tmp';await fs.writeFile(tmp,data);await fs.rename(tmp,dest)}}
 console.log(JSON.stringify({version,rows:rows.length,recommended:rows.filter(r=>r.recommended).length,archive:archiveName,range:[Math.min(...rows.map(r=>r.confidence)),Math.max(...rows.map(r=>r.confidence))],r4:rows.find(r=>r.race_id==='20261108-R04')}))
}finally{await handle.close();await fs.unlink(lock)}
