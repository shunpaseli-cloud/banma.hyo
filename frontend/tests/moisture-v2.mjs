// 馬場水分v2: Python(scripts/moisture_v2.py)との式一致、発走前保存のみ採用、v1既定経路の不変、v2値による雨モデル切替。
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
const sha=b=>createHash('sha256').update(b).digest('hex')
const fx=JSON.parse(await fs.readFile('tests/fixtures/moisture-v2-parity.json'))
const modelBefore=sha(await fs.readFile('src/data/learned_model.json'))
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const V=await server.ssrLoadModule('/src/moistureV2.js')
 assert.equal(V.MOISTURE_V2.config_sha256,fx.config_sha256)
 assert.equal(V.MOISTURE_V2.rain_switch_threshold,1.8)
 // 1) JS == Python for stage1/stage2
 for(const c of fx.cases){
  const raws={}
  for(let no=1;no<=12;no++){raws[no]=V.stage1Raw(c.features,no,c.date);assert.ok(Math.abs(raws[no]-c.stage1_raw[no])<1e-9,`${c.date} R${no} raw`);assert.equal(V.round01(raws[no]),c.stage1_value[no])}
  const s2=V.stage2Values(raws,c.anchor);assert.ok(Math.abs(s2.shift-c.shift)<1e-9)
  for(const [k,v] of Object.entries(c.stage2))assert.equal(s2.values[k].value,v)
 }
 // 2) only values saved strictly before the race start are effective; other model versions ignored
 const row=(start,stage1,stage2)=>({scheduled_start_at:start,v2:{model_version:V.MOISTURE_V2.version,stage1,stage2,effective:stage2?.status==='saved'?{value:stage2.value,stage:'stage2'}:{value:stage1?.value,stage:'stage1'}}})
 const s1={value:2.4,saved_at:'2026-11-21T09:00:00+09:00',model_version:V.MOISTURE_V2.version}
 const log={races:{
  '20261121-R01':row('2026-11-21T14:05:00+09:00',s1,null),
  '20261121-R02':row('2026-11-21T14:40:00+09:00',s1,{status:'saved',value:1.6,saved_at:'2026-11-21T14:30:00+09:00',model_version:V.MOISTURE_V2.version}),
  '20261121-R03':row('2026-11-21T15:15:00+09:00',s1,{status:'saved',value:1.6,saved_at:'2026-11-21T15:20:00+09:00',model_version:V.MOISTURE_V2.version}),
  '20261121-R04':{...row('2026-11-21T15:45:00+09:00',{...s1,model_version:'other'},null),v2:{...row('2026-11-21T15:45:00+09:00',{...s1,model_version:'other'},null).v2,model_version:'other'}},
  '20261116-R01':{scheduled_start_at:'2026-11-16T14:25:00+09:00',predicted_moisture:2.6}}}
 const map=V.effectiveV2Map(log)
 assert.deepEqual(Object.keys(map).sort(),['20261121-R01','20261121-R02'])
 assert.equal(map['20261121-R02'].value,1.6);assert.equal(map['20261121-R02'].stage,'stage2')
 // 3) engine: default path unchanged (v1), v2 value drives rain/normal switch and is recorded
 const races=JSON.parse(await fs.readFile('src/data/races_from_pdf.json')).filter(r=>r.race_date==='2026-11-16')
 const snap=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json'))
 const {calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js')
 const at='2026-11-16T09:50:00+09:00',raw=snap.meta.weather.raw
 const base=calculateRows(races,raw,at),same=calculateRows(races,raw,at,{}),noMatch=calculateRows(races,raw,at,{moistureV2:{'20991231-R01':{value:1}}})
 assert.deepEqual(same,base);assert.deepEqual(noMatch,base)
 const saved=snap.races.filter(r=>r.race_date==='2026-11-16')
 for(const r of base){const s=saved.find(x=>x.race_id===r.race_id);assert.deepEqual(r.selection_meta.top3.map(h=>h.umaban),s.selection_meta.top3.map(h=>h.umaban),'v1 replay == saved 11/16 BOX');assert.equal(r.moisture.model_selection_pct,2.7)}
 const v2={'20261116-R02':{value:1.5,stage:'stage2',saved_at:'2026-11-16T14:40:00+09:00',model_version:V.MOISTURE_V2.version,fallback:false},'20261116-R03':{value:3.1,stage:'stage2',saved_at:'2026-11-16T14:40:00+09:00',model_version:V.MOISTURE_V2.version,fallback:false}}
 const withV2=calculateRows(races,raw,at,{moistureV2:v2})
 const r2=withV2.find(r=>r.race_id==='20261116-R02'),r3=withV2.find(r=>r.race_id==='20261116-R03')
 assert.equal(r2.moisture.model_selection_pct,1.5);assert.equal(r2.model.which,'normal');assert.equal(r2.moisture.source,'moisture_v2');assert.equal(r2.moisture.v2.stage,'stage2')
 assert.equal(r3.moisture.model_selection_pct,3.1);assert.equal(r3.model.which,'rain')
 assert.equal(base.find(r=>r.race_id==='20261116-R02').model.which,'rain')
 for(const r of withV2.filter(r=>!v2[r.race_id]))assert.deepEqual(r,base.find(b=>b.race_id===r.race_id),'races without v2 unchanged')
 // measured moisture keeps priority over v2
 const measured=calculateRows(races.map(r=>r.race_id==='20261116-R02'?{...r,track_moisture:2.9}:r),raw,at,{moistureV2:v2}).find(r=>r.race_id==='20261116-R02')
 assert.equal(measured.moisture.model_selection_pct,2.9);assert.equal(measured.moisture.v2,undefined)
 // 4) browser refresh: published log with a pre-start v2 value triggers ONE recalculation with that value; unchanged log -> no recalculation
 const store=await server.ssrLoadModule('/src/predictionSnapshot.js'),original=store.getSnapshotState().snapshot,rawSnapshot=await fs.readFile('public/prediction-snapshot.json','utf8')
 const pointer={version:original.meta.version,snapshot_sha256:sha(rawSnapshot)},w=original.meta.weather.raw
 const pubLog={races:{'20261116-R02':row('2026-11-16T15:05:00+09:00',{value:1.5,saved_at:'2026-11-16T14:45:00+09:00',model_version:V.MOISTURE_V2.version},{status:'saved',value:1.5,saved_at:'2026-11-16T14:45:00+09:00',model_version:V.MOISTURE_V2.version})}}
 let calls=[];const calculate=async(...a)=>{calls.push(a[3]);return calculateRows(...a)}
 const fetcher=async url=>url.includes('moisture_prediction_log.json')?{ok:true,json:async()=>pubLog}:url.includes('prediction-version.json')?{ok:true,json:async()=>pointer}:url.includes('prediction-snapshot.json')?{ok:true,text:async()=>rawSnapshot}:{ok:true,json:async()=>w}
 await store.refreshSnapshot({force:true,fetcher,calculate})
 assert.equal(calls.length,1);assert.equal(calls[0].moistureV2['20261116-R02'].value,1.5)
 const live=store.getSnapshotState().snapshot.races.find(r=>r.race_id==='20261116-R02');assert.equal(live.moisture.model_selection_pct,1.5);assert.equal(live.model.which,'normal')
 await store.refreshSnapshot({force:true,fetcher,calculate});assert.equal(calls.length,1,'no churn when log/weather unchanged')
 const offline=async url=>url.includes('moisture_prediction_log.json')?{ok:false,status:404}:fetcher(url)
 store.acceptSnapshot(original);calls=[];await store.refreshSnapshot({force:true,fetcher:offline,calculate});assert.equal(calls.length,0,'log unavailable + same weather -> original kept, v1 only')
 assert.equal(sha(await fs.readFile('src/data/learned_model.json')),modelBefore)
 assert.equal(modelBefore,'e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893')
 console.log('moisture-v2 ok',{parity_cases:fx.cases.length,r2_box_v1:base.find(r=>r.race_id==='20261116-R02').selection_meta.top3.map(h=>h.umaban),r2_box_v2:r2.selection_meta.top3.map(h=>h.umaban)})
}finally{await server.close()}
