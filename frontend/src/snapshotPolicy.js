export function weatherComplete(raw,date){
 const day=raw?.daily;if(!day)return false
 return [0,-1,-2].every(offset=>{const t=new Date(date+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+offset);const i=day.time?.indexOf(t.toISOString().slice(0,10))??-1;return i>=0&&['precipitation_sum','relative_humidity_2m_mean','et0_fao_evapotranspiration'].every(k=>Number.isFinite(day[k]?.[i]))})
}
export function timingOf(saved,start){return !start?'unknown':Date.parse(saved)<Date.parse(start)?'prestart':'postrace'}
export const stamp=()=>new Date(Date.now()+9*3600000).toISOString().replace('Z','+09:00')
export function validRow(row,expected){
 if(!row||row.snapshot_version!==expected)return false
 if(row.prediction_status!=='available')return ['weather_missing','schedule_missing'].includes(row.prediction_status)
 if(!Number.isFinite(row.confidence)||typeof row.recommended!=='boolean'||!Array.isArray(row.predictions)||row.predictions.length<3)return false
 const horses=row.selection_meta?.top3?.map(h=>Number(h.umaban))||[]
 return horses.length===3&&new Set(horses).size===3&&row.tickets?.length===6&&new Set(row.tickets.map(t=>t.join('-'))).size===6&&row.tickets.every(t=>t.length===3&&new Set(t).size===3&&[...t].sort((a,b)=>a-b).join()===[...horses].sort((a,b)=>a-b).join())
}
export function validateSnapshot(snapshot,expected){
 if(snapshot?.schema_version!==2||typeof snapshot.meta?.version!=='string'||!Array.isArray(snapshot.races)||expected&&snapshot.meta.version!==expected)throw new Error('保存版のschema/version不一致')
 const ids=new Set();for(const row of snapshot.races){if(ids.has(row.race_id)||!validRow(row,snapshot.meta.version))throw new Error('保存版のrace/券/version不一致');ids.add(row.race_id)}
 return snapshot
}
