import {useSyncExternalStore} from 'react'
import initial from './data/prediction_snapshot.json'
import {SNAPSHOT_META as compiled} from './predictionVersion.js'
import CONFIDENCE_METHOD from './data/confidence_table_meta.json'
import {validateSnapshot,validRow,stamp} from './snapshotPolicy.js'
export {validRow} from './snapshotPolicy.js'
export {SNAPSHOT_META,versionStatus} from './predictionVersion.js'
export const ACTIVE_SNAPSHOT=initial
export const SNAPSHOT_ERROR=initial.meta.version!==compiled.version?'同梱保存版が一致しません。最新版を取得してください。':null
const listeners=new Set()
let state={snapshot:validateSnapshot(initial,compiled.version),status:'checking',lastCheckedAt:null,error:null,persistence:'server_archive'}
let inflight=null,lastAttempt=0,checkedConfidenceTable=false
const publish=patch=>{state={...state,...patch};for(const fn of listeners)fn()}
export const getSnapshotState=()=>state
export const subscribeSnapshots=fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
export const useSnapshot=()=>useSyncExternalStore(subscribeSnapshots,getSnapshotState,getSnapshotState)
export function acceptSnapshot(snapshot,extra={}){validateSnapshot(snapshot);publish({snapshot,...extra})}
export function snapshotForRace(id,snapshot=state.snapshot){const row=snapshot.races.find(r=>r.race_id===id);return validRow(row,snapshot.meta.version)?row:null}
export function snapshotRows(date,snapshot=state.snapshot){return snapshot.races.filter(r=>r.race_date===date&&validRow(r,snapshot.meta.version))}
export function predictionOf(row){
 if(!row||!validRow(row,row.snapshot_version)||row.prediction_status!=='available')return null
 return {horses:row.selection_meta.top3.map(h=>h.umaban),tickets:row.tickets,recommended:row.recommended===true,savedAt:row.snapshot_saved_at,confidence:row.confidence,stakeYen:row.stake_yen,snapshotVersion:row.snapshot_version,snapshotTiming:row.snapshot_timing,scheduledStartAt:row.scheduled_start_at,persistence:row.persistence_status||'server_archive'}
}
async function sha(text){const data=new TextEncoder().encode(text);const hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export function forecastFingerprint(snapshot,raw){
 const daily=raw?.daily,needed=new Set(snapshot.races.flatMap(r=>[0,-1,-2].map(d=>new Date(Date.parse(r.race_date+'T00:00:00Z')+d*86400000).toISOString().slice(0,10))))
 return JSON.stringify({days:daily?.time?.map((date,i)=>[date,daily.precipitation_sum?.[i],daily.relative_humidity_2m_mean?.[i],daily.et0_fao_evapotranspiration?.[i]]).filter(row=>needed.has(row[0])).sort((a,b)=>a[0].localeCompare(b[0])),models:snapshot.meta.models,engine:snapshot.meta.engine,source:snapshot.meta.source_races_sha256,config:snapshot.meta.config})
}
const predictiveContent=rows=>rows.map(r=>({race_id:r.race_id,prediction_status:r.prediction_status,recommended:r.recommended,confidence:r.confidence,top3:r.selection_meta?.top3,axis:r.selection_meta?.axis,predictions:r.predictions,tickets:r.tickets,moisture:r.moisture?{...r.moisture,weather_timing:undefined}:null,model:r.model}))
export async function contentIdentity(snapshot,raw,method,rows){
 const normalized=JSON.parse(forecastFingerprint(snapshot,raw)),confidence_method={version:method.version,table_sha256:method.table_sha256},predictionDigest=await sha(JSON.stringify(predictiveContent(rows))),inputFingerprint=await sha(JSON.stringify({normalized,confidence_method})),contentVersion=await sha(inputFingerprint+predictionDigest),dates={}
 for(const date of [...new Set(rows.map(r=>r.race_date))]){const days=new Set([0,-1,-2].map(d=>new Date(Date.parse(date+'T00:00:00Z')+d*86400000).toISOString().slice(0,10)));dates[date]='day-'+(await sha(JSON.stringify({normalized:{...normalized,days:normalized.days.filter(row=>days.has(row[0]))},confidence_method,rows:predictiveContent(rows.filter(r=>r.race_date===date))}))).slice(0,20)}
 return {version:'live-'+contentVersion.slice(0,24),content_version:contentVersion,input_fingerprint:inputFingerprint,prediction_digest:predictionDigest,date_content_versions:dates,normalized_inputs:normalized}
}
export function adoptLocalSnapshot(){
 try{
  const id=localStorage.getItem('banma.snapshot.latestVersion');if(!id)return false
  const candidate=validateSnapshot(JSON.parse(localStorage.getItem(`banma.snapshot.history.${id}`)))
  if(JSON.stringify(candidate.meta.models)!==JSON.stringify(compiled.models)||candidate.meta.engine!==compiled.engine||candidate.meta.source_races_sha256!==initial.meta.source_races_sha256)return false
  const a=Date.parse(candidate.meta.generated_at_asia_tokyo),b=Date.parse(state.snapshot.meta.generated_at_asia_tokyo)
  if(a>b||a===b&&candidate.meta.version>state.snapshot.meta.version){publish({snapshot:candidate,status:'checking',persistence:'browser_history'});return true}
 }catch{}return false
}
export async function refreshSnapshot({force=false,fetcher=globalThis.fetch,calculate=null,now=Date.now}={}){
 if(inflight)return inflight
 if(!force&&now()-lastAttempt<30000)return state
 adoptLocalSnapshot()
 lastAttempt=now();publish({status:'refreshing',error:null})
 inflight=(async()=>{
  const fetchLatest=async(url,options={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetcher(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}}
  try{
   const response=await fetchLatest(`${import.meta.env.BASE_URL}prediction-version.json?check=${now()}`,{cache:'no-store'});if(!response.ok)throw new Error('共通最新版の取得失敗')
   const pointer=await response.json();if(typeof pointer.version!=='string'||!pointer.snapshot_sha256)throw new Error('共通版のmanifest不正')
   let base=state.snapshot
   if(pointer.version!==base.meta.version&&pointer.version!==base.meta.server_parent_version){
    const loaded=await fetchLatest(`${import.meta.env.BASE_URL}prediction-snapshot.json?v=${encodeURIComponent(pointer.version)}&check=${now()}`,{cache:'no-store'});if(!loaded.ok)throw new Error('共通保存版の取得失敗')
    const text=await loaded.text();if(await sha(text)!==pointer.snapshot_sha256)throw new Error('保存版のhash不一致。混在したデータは表示しません。')
    base=validateSnapshot(JSON.parse(text),pointer.version)
    publish({snapshot:base,status:"refreshing",persistence:base.meta.generated_in==='browser_shared_store'?base.meta.persistence_status:'server_archive'})
   }
   const weatherUrl=new URL(base.meta.weather.source_url)
   const earliest=base.races.map(r=>r.race_date).sort()[0]
   const pastDays=Math.max(2,Math.ceil((Date.parse(stamp().slice(0,10)+'T00:00:00Z')-Date.parse(earliest+'T00:00:00Z'))/86400000)+2)
   weatherUrl.searchParams.set('past_days',String(Math.min(92,pastDays)))
   const weatherResponse=await fetchLatest(weatherUrl.href,{cache:'no-store'});if(!weatherResponse.ok)throw new Error('最新気象の取得失敗')
   const raw=await weatherResponse.json();if(!raw.daily?.time?.length)throw new Error('最新気象の入力が欠測')
   const checked=stamp()
   if(forecastFingerprint(base,raw)===forecastFingerprint(base,base.meta.weather.raw)&&base.meta.confidence_method===CONFIDENCE_METHOD.version&&base.meta.confidence_table?.table_sha256===CONFIDENCE_METHOD.table_sha256&&checkedConfidenceTable){
    publish({snapshot:base,status:'current',lastCheckedAt:checked,error:null,persistence:base.meta.generated_in==='browser_shared_store'?base.meta.persistence_status:'server_archive'});return state
   }
   if((JSON.stringify(base.meta.models)!==JSON.stringify(compiled.models)||base.meta.engine!==compiled.engine))throw new Error('モデル版が更新されています。古い計算器での再計算を停止しました。ページを開き直してください。')
   const races=(await import('./data/races_from_pdf.json')).default
   const weatherChanged=forecastFingerprint(base,raw)!==forecastFingerprint(base,base.meta.weather.raw)
   let rows
   if(weatherChanged){const engine=calculate||((await import('./calculateSnapshot.js')).calculateRows);rows=await engine(races,raw,checked)}
   else{const {replaceConfidence}=await import('./confidenceTable.js');const byId=new Map(races.map(r=>[r.race_id,r]));rows=base.races.map(row=>replaceConfidence(row,byId.get(row.race_id),{at:checked,laterCards:races}))}
   checkedConfidenceTable=true
   const identity=await contentIdentity(base,raw,CONFIDENCE_METHOD,rows),version=identity.version
   let snapshot={schema_version:2,meta:{...base.meta,...identity,version,server_parent_version:pointer.version,generated_at_asia_tokyo:checked,snapshot_saved_at:checked,generated_in:'browser_shared_store',confidence_method:CONFIDENCE_METHOD.version,confidence_table:CONFIDENCE_METHOD,weather:{...base.meta.weather,source_url:weatherUrl.href,raw,raw_sha256:await sha(JSON.stringify(raw)),retrieved_at:checked,status:'retrieved'},persistence_status:'browser_history'},races:rows.map(row=>({...row,snapshot_version:version,persistence_status:'browser_history'}))}
   validateSnapshot(snapshot)
   snapshot=await (await import('./predictionPersistence.js')).persistSharedSnapshot(snapshot)
   publish({snapshot,status:'current',lastCheckedAt:checked,error:null,persistence:snapshot.meta.persistence_status})
   return state
  }catch(error){publish({status:'stale',error:String(error)});return state}
 })().finally(()=>{inflight=null})
 return inflight
}
