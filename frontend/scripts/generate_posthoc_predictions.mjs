// 事後生成: 11/14 の予想を、レース前データだけで現行本番エンジン(calculateRows)により生成する。結果は予想確定後にのみ読む。
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {createServer} from 'vite'
const ROOT='/workspace/banma-confidence-dates/frontend',OUT='/workspace/banma_posthoc_20261114'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
const stamp=()=>new Date(Date.now()+9*3600000).toISOString().replace('Z','+09:00')
const card=JSON.parse(await fs.readFile(`${ROOT}/src/data/racecards/racecard_2026-11-14.json`))
// leak guard: racecard must be the pre-race file (fetched 11/13) with no odds/body weight
if(!card.meta.fetched_at.startsWith('2026-11-13'))throw new Error('racecard not pre-race')
for(const r of card.races)for(const e of r.entries)if(e.odds!=null||e.popularity!=null||e.body_weight!=null)throw new Error('odds/weight present '+r.race_id)
const races=card.races.map(r=>{const rid=r.race_id;return {race_id:rid,race_date:r.race_date,race_no:r.race_no,name:`帯広${r.race_no}R ${r.race_name||''}${r.class||''}`.trim(),track_moisture:null,post_time:r.post_time,umanity_race_id:r.umanity_race_id,
 entries:r.entries.map(e=>({gate:e.gate,umaban:e.umaban,name:e.name,sled_weight:e.sled_weight,jockey:e.jockey,weight_reduction:e.weight_reduction,sex:e.sex,age:e.age,body_weight:null,body_weight_diff:null,trainer:e.trainer,status:e.status,race_id:rid,horse_id:`${rid}-${String(e.umaban).padStart(2,'0')}`,recent_form:0.3}))}})
const log=JSON.parse(await fs.readFile('/workspace/banma-moisture-state/moisture_prediction_log.json'))
const m=Object.values(log.races).filter(r=>r.date==='2026-11-14');if(m.length!==12||!m.every(r=>r.predicted_moisture===2.0&&r.prediction_saved_at.startsWith('2026-11-14T09:05')))throw new Error('moisture log mismatch')
const inp=m[0].inputs,days=Object.keys(inp).sort()
if(!m.every(r=>JSON.stringify(r.inputs)===JSON.stringify(inp)))throw new Error('inputs differ')
const raw={daily:{time:days,precipitation_sum:days.map(d=>inp[d].precipitation_sum),relative_humidity_2m_mean:days.map(d=>inp[d].relative_humidity_2m_mean),et0_fao_evapotranspiration:days.map(d=>inp[d].et0_fao_evapotranspiration)},source:'moisture_prediction_log 2026-11-14T09:05 JST saved forecast inputs'}
const data=f=>fs.readFile(`${ROOT}/src/data/${f}`)
const models={};for(const f of ['learned_model.json','learned_model_rain.json','learned_weights.json','card_history_age4.json','graded_form_history_age4.json','skip_rules.json','confidence_table_meta.json','results_from_pdf.json'])models[f]=sha(await data(f))
if(models['learned_model.json']!=='e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893')throw new Error('learned_model sha changed')
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({root:ROOT,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}})
let rows,rowsScrambled
const generated=stamp()
try{
 const {calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js')
 rows=calculateRows(races,raw,generated)
}finally{await server.close()}
const engineFiles=['feedback.js','learnScore.js','learnCore.js','moisture.js','memrobo.js','trio.js','selectionReason.js','calculateSnapshot.js','snapshotPolicy.js','confidenceTable.js','boxSelection.js','cardScoreAge4.js','gradedScoreAge4.js','prevFinish.js']
const engine=sha(Buffer.concat(await Promise.all(engineFiles.map(n=>fs.readFile(`${ROOT}/src/${n}`)))))
const version='posthoc-20261114-'+sha(JSON.stringify(rows.map(r=>({id:r.race_id,top3:r.selection_meta?.top3,c:r.confidence,rec:r.recommended})))).slice(0,12)
const out={schema:'banma-posthoc-prediction-v1',meta:{date:'2026-11-14',kind:'posthoc',label:'事後生成',version,generated_at_asia_tokyo:generated,
 inputs_as_of:'2026-11-14T09:05 JST（水分予測保存時の気象入力）＋出走表(2026-11-13 20:37取得)',moisture_pct:2.0,weather:raw,models,engine_sha256:engine,
 history:{model29_last_result_date:'2026-11-01',results_from_pdf_through:'2026-11-01',past_cards_through:'2026-11-02',card_history_age4_through:'2026-11-08',graded_history_age4_through:'2026-11-08'},
 policy:'レース後に現行本番エンジンで生成。当日保存予想ではない。当日予想の成績・保存予想(prediction_snapshot)とは合算しない。11/14の結果・オッズは入力に使っていない。'},
 races:rows.map(r=>({...r,snapshot_version:version,snapshot_timing:'posthoc',prediction_origin:'posthoc'}))}
await fs.writeFile(`${OUT}/posthoc_predictions_2026-11-14.json`,JSON.stringify(out,null,1)+'\n')
for(const r of out.races)console.log(r.race_no,r.prediction_status,r.selection_meta?.top3.map(h=>h.umaban).join('-'),'axis',r.selection_meta?.axis?.umaban,'conf',r.confidence,'rec',r.recommended,r.selection_meta?.box_method,'moist',r.moisture?.model_selection_pct,r.moisture?.feature_estimate_pct)
