import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import vm from 'node:vm'
import {createServer} from 'vite'
const sha=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex')
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}})
try{
 const original=await fs.readFile('tests/fixtures/original-confidence/selectionReason.txt','utf8'),tableRaw=await fs.readFile('tests/fixtures/original-confidence/confidence_bands.json','utf8'),bands=JSON.parse(tableRaw),rules=JSON.parse(await fs.readFile('src/data/skip_rules.json'))
 assert.equal(await fs.readFile('src/selectionReason.js','utf8'),original,'exact pre-nearest source restored, not redesigned');assert.equal(await fs.readFile('src/data/confidence_bands.json','utf8'),tableRaw,'exact original table bytes restored')
 const current=await server.ssrLoadModule('/src/selectionReason.js'),trio=await server.ssrLoadModule('/src/trio.js'),memro=await server.ssrLoadModule('/src/memrobo.js'),core=await server.ssrLoadModule('/src/learnCore.js'),moisture=await server.ssrLoadModule('/src/moisture.js')
 const text=original.replace(/^import .*$/gm,'').replace(/export function /g,'function ').replace(/export \{ FEATURE_JP \}/g,'')+'\n;({lookupConfidence,buildRaceRecommendation})'
 const old=vm.runInNewContext(text,{rules,bands,axisGate:trio.axisGate,rankedPreds:trio.rankedPreds,trifectaBox3:trio.trifectaBox3,isMemrobo:memro.isMemrobo,findMemrobo:memro.findMemrobo,FEATURE_NAMES:core.FEATURE_NAMES,resolveMoisture:moisture.resolveMoisture})
 let comparisons=0;const fallback=new Set()
 for(const pf of [null,NaN,.1,.64999,.65,.66765873,.69999,.7,.79999,.8,1])for(const field of [0,7,8,9,10,12])for(const moist of [null,NaN,0,1.49,1.5,1.79,1.8,1.9,2.99,3,8])for(const isGrade of [false,true]){const input={pf,field,moist,isGrade},a=current.lookupConfidence(input),b=old.lookupConfidence(input);assert.equal(JSON.stringify(a),JSON.stringify(b));fallback.add(a.source);comparisons++}
 const sample=current.lookupConfidence({pf:.66765873,field:10,moist:1.9,isGrade:false});assert.equal(sample.confidence,.744);assert.equal(sample.source,'065_070|ge10|wet|normal');assert.equal(sample.stats.N,62);assert.equal(bands.joint[sample.source].hits,3)
 let corrections=0
 for(const pf of [null,.1,.649,.65,.7,.9])for(const n of [7,8,9,10])for(const m of [1,1.6,1.9,3.5])for(const special of [false,true]){
  const race={race_id:'20261108-R04',race_date:'2026-11-08',race_no:4,name:'テスト',track_moisture:m,entries:Array.from({length:n},(_,i)=>({horse_id:'h'+i,umaban:i+1,name:special&&i===0?'メムロボブサップ':'馬'+i}))},preds=race.entries.map((e,i)=>({...e,score:1-i*.05,past_form:i===0?pf:.7,top_contribs:[]})),a=current.buildRaceRecommendation(race,preds),b=old.buildRaceRecommendation(race,preds)
  assert.equal(JSON.stringify(a),JSON.stringify(b));if(!a.recommended)assert.ok(a.confidence<=.25);if(special){assert.equal(a.recommended,true);const raw=current.lookupConfidence({pf:pf??.5,field:n,moist:m,isGrade:false}).confidence;assert.equal(a.confidence,Math.min(.95,raw+.05))}corrections++
 }
 const {calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js'),{horseComments}=await server.ssrLoadModule('/src/components/SelectionComment.jsx'),races=JSON.parse(await fs.readFile('src/data/races_from_pdf.json')),snapshot=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),golden=JSON.parse(await fs.readFile('tests/fixtures/pre-nearest-invariants.json'))
 const replay=calculateRows(races,snapshot.meta.weather.raw,snapshot.meta.snapshot_saved_at),strip=m=>Object.fromEntries(Object.entries(m).filter(([k])=>!['confidence','confidence_label','confidence_source','confidence_stats','confidence_bands'].includes(k)))
 for(const row of snapshot.races){const prior=golden.rows.find(r=>r.race_id===row.race_id),again=replay.find(r=>r.race_id===row.race_id);assert.equal(sha(row.predictions),prior.predictions_sha256);assert.equal(sha(strip(row.selection_meta)),prior.selection_sha256);assert.equal(row.confidence,again.confidence);assert.deepEqual(row.selection_meta,again.selection_meta);for(const key of ['recommended','tickets','snapshot_saved_at','snapshot_timing'])assert.deepEqual(row[key],prior[key])}
 // Fixed CURRENT inputs were captured once before removal; no result-driven selection or weather drift.
 const fixed=JSON.parse(await fs.readFile('tests/fixtures/confidence-restore-current-input.json')),after=calculateRows(races,fixed.weather,fixed.generated),withoutConfidence=row=>{const {confidence,confidence_status,confidence_saved_at,confidence_timing,selection_comment,selection_meta,...rest}=row;return {...rest,selection_meta:strip(selection_meta)}}
 for(const row of after){const before=fixed.rows.find(r=>r.race_id===row.race_id);assert.deepEqual(withoutConfidence(row),withoutConfidence(before),row.race_id+' current input all horse ranking/score/features/BOX/gate unchanged');assert.deepEqual(horseComments(row),fixed.comments.find(r=>r.race_id===row.race_id).comments)}
 const modes=new Set([...fallback].map(source=>source==='baseline'?'baseline':source.includes('|')?(source.split('|').length===4?'joint':'coarse'):'pf_only'));assert.deepEqual([...modes].sort(),['baseline','coarse','joint','pf_only'])
 const model=JSON.parse(await fs.readFile('src/data/learned_model.json'));assert.equal(model.confidence_method,undefined);const {comment_style,...predictionModel}=model;assert.equal(sha(predictionModel),'877b650d3f340d403ad61667c415c8ee2f1967e76a928466ee31d4436edb55a5');assert.equal(model.features.length,29)
 const info=JSON.parse(await fs.readFile('src/data/confidence_table_meta.json'));assert.equal(info.table_sha256,sha(tableRaw));assert.equal(snapshot.meta.confidence_method,'condition-table-v1');assert.equal(snapshot.meta.confidence_history,undefined)
 for(const name of ['confidenceNearest.js','confidenceHistory.js','confidenceCorpus.js'])await assert.rejects(()=>fs.access('src/'+name))
 for(const name of ['confidence-history.json','confidence-history-version.json','confidence-policy.json'])await assert.rejects(()=>fs.access('public/'+name))
 const source=await fs.readFile('src/predictionSnapshot.js','utf8');assert.ok(!/nearest|corpus|historyLoader|confidenceHistory|confidenceNearest|zscore|Euclidean|QEA|utility|cutoff_exclusive_date/i.test(source));assert.ok(source.includes('CONFIDENCE_METHOD')&&source.includes('contentIdentity')&&source.includes('persistSharedSnapshot'))
 console.log(JSON.stringify({pass:'exact original source/table; lookup fallback and old corrections parity; original R4 .744; all36 saved/current-input rankings/scores/BOX/gates/comments unchanged;29features and original model payload unchanged; no nearest runtime/assets; stable shared-store/persistence retained',lookup_cases:comparisons,fallback_modes:[...modes],correction_cases:corrections,table_sha256:info.table_sha256,sample,baseline_current_generated_jst:fixed.generated}))
}finally{await server.close()}
