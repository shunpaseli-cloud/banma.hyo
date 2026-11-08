// Immutable minimal prediction records. Never delete/overwrite user history or store corpus/audit arrays.
export function compactRecord(snapshot){
 const m=snapshot.meta
 return {schema_version:3,kind:'compact_prediction_snapshot',version:m.version,content_version:m.content_version,input_fingerprint:m.input_fingerprint,prediction_digest:m.prediction_digest,created_at:m.generated_at_asia_tokyo,models:m.models,engine:m.engine,source_races_sha256:m.source_races_sha256,confidence_history:m.confidence_history,normalized_inputs:m.normalized_inputs,date_content_versions:m.date_content_versions,weather:{source_url:m.weather?.source_url,retrieved_at:m.weather?.retrieved_at,raw_sha256:m.weather?.raw_sha256},
  races:snapshot.races.map(r=>({race_id:r.race_id,race_date:r.race_date,race_no:r.race_no,prediction_status:r.prediction_status,recommended:r.recommended,confidence:r.confidence,top3:r.selection_meta?.top3||[],tickets:r.tickets,stake_yen:r.stake_yen,snapshot_saved_at:r.snapshot_saved_at,snapshot_timing:r.snapshot_timing,scheduled_start_at:r.scheduled_start_at,confidence_saved_at:r.confidence_saved_at,confidence_timing:r.confidence_timing}))}
}
function validateRecord(record,snapshot){if(record?.schema_version!==3||record.kind!=='compact_prediction_snapshot'||record.content_version!==snapshot.meta.content_version||record.input_fingerprint!==snapshot.meta.input_fingerprint||record.prediction_digest!==snapshot.meta.prediction_digest||record.version!==snapshot.meta.version||record.races?.length!==snapshot.races.length)throw new Error('同じ内容版の履歴が一致しません。上書きしません。');const expected=compactRecord(snapshot),byId=new Map(expected.races.map(r=>[r.race_id,r]));for(const row of record.races){const want=byId.get(row.race_id);if(!want)throw new Error('履歴race ID不一致');for(const key of ['prediction_status','recommended','confidence','top3','tickets','stake_yen','scheduled_start_at'])if(JSON.stringify(row[key])!==JSON.stringify(want[key]))throw new Error('履歴予想不一致: '+key);if(!Number.isFinite(Date.parse(row.snapshot_saved_at))||row.scheduled_start_at&&row.snapshot_timing!==(Date.parse(row.snapshot_saved_at)<Date.parse(row.scheduled_start_at)?'prestart':'postrace'))throw new Error('履歴保存時刻不一致')}return record}
function applyRecord(snapshot,record,location,warning=null){
 const byId=new Map(record.races.map(r=>[r.race_id,r]));return {...snapshot,meta:{...snapshot.meta,generated_at_asia_tokyo:record.created_at,snapshot_saved_at:record.created_at,persistence_status:location,persistence_warning:warning},races:snapshot.races.map(row=>{const saved=byId.get(row.race_id);return {...row,snapshot_saved_at:saved.snapshot_saved_at,snapshot_timing:saved.snapshot_timing,confidence_saved_at:saved.confidence_saved_at,confidence_timing:saved.confidence_timing,persistence_status:location}})}
}
export function indexedRecord(record){return new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(new Error('IndexedDB未対応'));return}
 let expired=false,activeTransaction=null
 const timer=setTimeout(()=>{expired=true;try{activeTransaction?.abort()}catch{}reject(new Error('IndexedDB保存timeout'))},2500),request=indexedDB.open('banma-prediction-records',1)
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('snapshots'))request.result.createObjectStore('snapshots',{keyPath:'version'})}
 request.onerror=()=>{expired=true;clearTimeout(timer);reject(request.error||new Error('IndexedDB open failed'))}
 request.onblocked=()=>{expired=true;clearTimeout(timer);reject(new Error('IndexedDB blocked'))}
 request.onsuccess=()=>{const db=request.result;if(expired){db.close();return}const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),get=store.get(record.version);let saved;activeTransaction=tx
  get.onsuccess=()=>{saved=get.result;if(!saved){saved=record;store.add(record)}}
  tx.oncomplete=()=>{clearTimeout(timer);db.close();if(!expired)resolve(saved)};tx.onerror=tx.onabort=()=>{clearTimeout(timer);db.close();reject(tx.error||new Error('IndexedDB transaction failed'))}
 }
})}
export async function persistSharedSnapshot(snapshot,options={}){
 const record=compactRecord(snapshot),key=`banma.snapshot.history.${snapshot.meta.version}`;let failure
 try{
  const storage=Object.hasOwn(options,'storage')?options.storage:globalThis.localStorage;if(!storage)throw new Error('localStorage未対応')
  const old=storage.getItem(key);let saved
  if(old)saved=validateRecord(JSON.parse(old),snapshot)
  else{const text=JSON.stringify(record);storage.setItem(key,text);if(storage.getItem(key)!==text)throw new Error('保存内容の読戻し失敗');saved=record}
  let warning=null;try{if(storage.getItem('banma.snapshot.latestVersion')!==snapshot.meta.version)storage.setItem('banma.snapshot.latestVersion',snapshot.meta.version)}catch(e){warning='予想記録は保存済み。最新参照の更新のみ失敗: '+String(e)}
  return applyRecord(snapshot,saved,'browser_history',warning)
 }catch(error){failure=String(error)}
 try{const saved=validateRecord(await (options.backup||indexedRecord)(record),snapshot);return applyRecord(snapshot,saved,'browser_indexeddb','localStorage保存不可のためIndexedDBへ最小予想記録を保存しました: '+failure)}
 catch(error){return {...snapshot,meta:{...snapshot.meta,persistence_status:'unavailable',persistence_error:failure+' / '+String(error)},races:snapshot.races.map(r=>({...r,persistence_status:'unavailable'}))}}
}
