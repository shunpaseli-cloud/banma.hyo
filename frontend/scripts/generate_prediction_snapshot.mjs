// Explicit, versioned forecast capture. No training and no result-driven selection.
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
import {reconcileBox} from '../src/settlement.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const json=bytes=>JSON.parse(bytes.toString())
const stamp=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}).replace(' ','T')+'+09:00'
const bytes=value=>Buffer.from(JSON.stringify(value,null,1)+'\n')
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+`.${process.pid}.tmp`;await fs.writeFile(tmp,data);await fs.rename(tmp,file)}
async function immutable(file,data){try{const existing=await fs.readFile(file);if(!existing.equals(data))throw new Error(`Immutable history differs: ${file}`)}catch(error){if(error.code!=='ENOENT')throw error;await atomic(file,data)}}
async function read(name){return fs.readFile(path.join(ROOT,'src/data',name))}
export {weatherComplete,timingOf} from '../src/snapshotPolicy.js'
import {timingOf} from '../src/snapshotPolicy.js'
export function resultProjection(snapshot,results){
 const rows=snapshot.races.map(row=>{
  const result=results.races[row.race_id]||{status:'missing',finishes:[]}
  const settlement=reconcileBox(result,{recommended:true,tickets:row.tickets,stakeYen:row.stake_yen})
  const hit=settlement.returnYen===null?null:settlement.status==='hit'
  return {...row,result,hit:row.snapshot_timing==='prestart'&&row.recommended?hit:null,reference_box_hit:row.snapshot_timing!=='prestart'||!row.recommended?hit:null,evaluation_status:row.snapshot_timing!=='prestart'?'postrace_reference':!row.recommended?'nonrecommended_reference':hit===null?'pending':'evaluated'}
 });return {schema_version:2,meta:snapshot.meta,races:rows}
}
async function archiveCurrent(){
 const legacy='legacy-20261106T190648';let version=legacy
 try{version=json(await read('prediction_snapshot.json')).meta.version}catch(e){if(e.code!=='ENOENT')throw e}
 const dir=path.join(ROOT,'public/prediction-history',version)
 const files={}
 for(const name of ['recommendations.json','confidence-results.json','verified-results.json','feedback-inputs.json','results.json','prediction-snapshot.json','prediction-version.json']){
  try{const data=await fs.readFile(path.join(ROOT,'public',name));await immutable(path.join(dir,name),data);files[name]=sha(data)}catch(e){if(e.code!=='ENOENT')throw e}
 }
 if(version===legacy)for(const [source,name] of [['/tmp/banma_results_2026-11-06_07_reconciled.json','reconciled-results.json'],['/tmp/banma_results_source_audit_2026-11-06_07.json','result-source-audit.json']]){
  try{const data=await fs.readFile(source);await immutable(path.join(dir,name),data);files[name]=sha(data)}catch(e){if(e.code!=='ENOENT')throw e}
 }
 const manifestPath=path.join(dir,'manifest.json')
 try{return json(await fs.readFile(manifestPath))}catch(e){if(e.code!=='ENOENT')throw e}
 const old=json(await fs.readFile(path.join(dir,'confidence-results.json')))
 const pre=old.races.filter(r=>r.snapshot_timing==='prestart'&&r.result?.status==='final')
 const summary={races:pre.length,hits:pre.filter(r=>r.hit===true).length,stake_yen:pre.reduce((s,r)=>s+r.stake_yen,0),return_yen:pre.reduce((s,r)=>s+(r.hit? r.result.payouts.trifecta.filter(p=>r.tickets.some(t=>t.join('-')===p.combo.join('-'))).reduce((a,p)=>a+p.yen,0):0),0)}
 const manifest={version,archived_at:stamp(),snapshot_saved_at:old.meta.snapshot_saved_at||old.meta.generated_at_asia_tokyo,files,prestart_summary:summary,note:'旧版の事前成績。新版の事後再計算と合算しない。保存CLI値であり当時のブラウザ表示履歴の証明ではない。'}
 await immutable(manifestPath,bytes(manifest));return manifest
}
async function generateUnlocked({apply=false,weatherFile=null,outputDir='/workspace/banma-prepared-snapshot'}={}){
 // Capture once, before any race calculation. Past-day inputs are explicitly post-hoc.
 const today=stamp().slice(0,10),sourceUrl='https://api.open-meteo.com/v1/forecast?latitude=42.92&longitude=143.20&daily=precipitation_sum,relative_humidity_2m_mean,et0_fao_evapotranspiration&past_days=4&forecast_days=3&timezone=Asia%2FTokyo'
 let raw=null,error=null
 try{raw=weatherFile?json(await fs.readFile(weatherFile)):await(await fetch(sourceUrl,{signal:AbortSignal.timeout(30000)})).json();if(!raw.daily)throw new Error('Missing forecast daily data')}catch(e){error=String(e)}
 const fetchedAt=stamp(),weather={source_url:sourceUrl,retrieved_at:fetchedAt,provider_run_issued_at:null,run_time_status:'provider does not publish a run issue time in this response',status:error?'missing':'retrieved',error,raw,raw_sha256:sha(bytes(raw)),note:'同一取得レスポンスを全Rで共有。過去日の気象は事後入力であり当時の予報ではない。'}
 const source=await read('races_from_pdf.json'),races=json(source),models={}
 for(const name of ['learned_model.json','learned_model_rain.json','learned_weights.json','card_history_age4.json'])models[name]=sha(await read(name))
 const engineFiles=['feedback.js','learnScore.js','learnCore.js','moisture.js','memrobo.js','trio.js','selectionReason.js','calculateSnapshot.js','snapshotPolicy.js','confidenceTable.js','boxSelection.js','cardScoreAge4.js']
 const engine=sha(Buffer.concat(await Promise.all(engineFiles.map(name=>fs.readFile(path.join(ROOT,'src',name))))))
 const protectedFiles=['learned_model.json','learned_model_rain.json','learned_weights.json','verified_results.json','results_from_pdf.json']
 const protectedHashes=Object.fromEntries(await Promise.all(protectedFiles.map(async n=>[n,sha(await read(n))])))
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
 const server=await createServer({root:ROOT,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
 let rows
 try{
  const {calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js')
  rows=calculateRows(races,raw,stamp())
 }finally{await server.close()}
 weather.missing_races=rows.filter(r=>r.prediction_status!=='available').map(r=>r.race_id)
 if(weather.missing_races.length)weather.status=weather.missing_races.length===rows.length?'missing':'partial'
 const generated=stamp();rows=rows.map(r=>({...r,snapshot_saved_at:generated,snapshot_timing:timingOf(generated,r.scheduled_start_at)}))
 const version='pred-'+generated.replace(/[-:]/g,'').replace('+0900','JST')+'-'+sha(bytes({generated,weather,models,engine,rows})).slice(0,12)
 rows=rows.map(r=>({...r,snapshot_version:version}))
 const legacyPath='prediction-history/legacy-20261106T190648/'
 let legacy;try{legacy=json(await fs.readFile(path.join(ROOT,'public',legacyPath,'manifest.json')))}catch(e){if(e.code!=='ENOENT')throw e;legacy=apply?await archiveCurrent():null}
 if(apply&&await fs.access(path.join(ROOT,'src/data/prediction_snapshot.json')).then(()=>true,()=>false))await archiveCurrent()
 const confidenceTable=json(await read('confidence_table_meta.json'))
 const meta={confidence_method:confidenceTable.version,confidence_table:confidenceTable,version,generated_at_asia_tokyo:generated,snapshot_saved_at:generated,config:'plus_hjz BOX123 pf≥0.65 k=0.05',timezone:'Asia/Tokyo',source_races_sha256:sha(source),models,engine,weather,legacy:{path:legacyPath,prestart_summary:legacy?.prestart_summary||null},policy:'全画面はこの保存版のみ。過去分は事後再計算。気象欠測は代替予測しない。結果は馬の選定後にrace_idで結合する。'}
 const snapshot={schema_version:2,meta,races:rows}
 // Result JSON is deliberately read only AFTER all predictions have been selected.
 const results=json(await read('verified_results.json')),projection=resultProjection(snapshot,results)
 const recommendations={meta,races:rows.map(({predictions,...row})=>row)}
 const versionMeta={version,generated_at_asia_tokyo:generated,models,engine,weather_status:weather.status,weather_retrieved_at:fetchedAt,legacy:meta.legacy,snapshot_sha256:sha(bytes(snapshot))}
 const outputs={'prediction-snapshot.json':bytes(snapshot),'prediction-version.json':bytes(versionMeta),'recommendations.json':bytes(recommendations),'confidence-results.json':bytes(projection),'weather.json':bytes(weather)}
 for(const [name,data] of Object.entries(outputs))await atomic(path.join(outputDir,name),data)
 if(apply){
  for(const [name,data] of Object.entries(outputs))await immutable(path.join(ROOT,'public/prediction-history',version,name),data)
  for(const [publicName,sourceName] of [['prediction-snapshot.json','prediction_snapshot.json'],['prediction-version.json','prediction_version.json'],['recommendations.json','recommendations.json'],['confidence-results.json','confidence-results.json']]){await atomic(path.join(ROOT,'src/data',sourceName),outputs[publicName]);await atomic(path.join(ROOT,'public',publicName),outputs[publicName])}
 }
 for(const [name,hash] of Object.entries(protectedHashes))if(sha(await read(name))!==hash)throw new Error(`Protected file changed: ${name}`)
 console.log(JSON.stringify({version,apply,outputDir,total:rows.length,recommended:rows.filter(r=>r.recommended).length,missing:rows.filter(r=>r.prediction_status!=='available').length,prestart:rows.filter(r=>r.snapshot_timing==='prestart').length,postrace:rows.filter(r=>r.snapshot_timing==='postrace').length,models}))
 return snapshot
}
export async function generate(options={}){
 if(!options.apply)return generateUnlocked(options)
 const lockPath=path.join(ROOT,'.prediction_snapshot.lock')
 const lock=await fs.open(lockPath,'wx').catch(error=>{throw new Error(`Another export may be running; refusing concurrent snapshot publication: ${error.message}`)})
 try{await lock.writeFile(JSON.stringify({pid:process.pid,started_at:stamp()}));return await generateUnlocked(options)}finally{await lock.close();await fs.unlink(lockPath)}
}
export async function runCli(){const a=process.argv.slice(2),at=a.indexOf('--weather-file');return generate({apply:a.includes('--apply'),weatherFile:at<0?null:a[at+1]})}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await runCli()
