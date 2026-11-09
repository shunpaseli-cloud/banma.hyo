// card-score-age4: 年齢帯判定・実験スクリプトとの特徴/効用/BOX一致・29特徴レースの不変性。
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
const sha=s=>createHash('sha256').update(s).digest('hex')
const fx=JSON.parse(await fs.readFile('tests/fixtures/card-score-age4-parity.json'))
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const C=await server.ssrLoadModule('/src/cardScoreAge4.js')
 // 1) age-band classification (scratched excluded; any <=3 -> not pure_O; missing age/sled -> unknown)
 const E=(age,status=null,sled=700)=>({umaban:1,name:'x',age,sled_weight:sled,status})
 assert.equal(C.ageType({entries:[E(4),E(5),E(9)]}),'pure_O')
 assert.equal(C.ageType({entries:[E(3),E(2),E(3)]}),'pure_Y')
 assert.equal(C.ageType({entries:[E(3),E(4),E(5)]}),'mixed')
 assert.equal(C.ageType({entries:[E(3,'取消'),E(4),E(5),E(6)]}),'pure_O','scratched 3yo does not make the race mixed')
 assert.equal(C.ageType({entries:[E(3,'除外'),E(4),E(5),E(6)]}),'pure_O')
 assert.equal(C.ageType({entries:[E(null),E(4),E(5)]}),'unknown')
 assert.equal(C.ageType({entries:[E(4,null,null),E(4),E(5)]}),'unknown')
 // 2) class parse of production card names == experiment ladder
 let classMissing=0
 for(const c of fx.class_cases){const p=C.parseClass(c.name);if(p.ctype===null){if(c.ctype!==null)classMissing++;continue}assert.equal(p.ctype,c.ctype,c.name);assert.ok(Math.abs(p.cval-c.cval)<1e-12,c.name)}
 assert.ok(classMissing<=1,'class parse: only title-only race names may be unreadable')
 assert.equal(C.cardBoxAge4({race_date:'2026-11-14',name:'帯広3R 60年に1度!炎の丙午杯!',entries:[E(4),E(5),E(6)]}).reason,'class_missing')
 // 3) feature/utility/BOX parity vs experiment prediction_rows (same monthly coefficients)
 let boxSame=0,maxF=0,maxU=0,noHist=0
 for(const r of fx.races){
  const race={race_id:r.race_id,race_date:r.race_date,entries:r.entries}
  assert.equal(C.ageType(race),'pure_O',r.race_id)
  const rows=C.cardFeatures(race,{ctype:r.ctype,cval:r.cval},{history_through:'',horses:r.history})
  for(const row of rows){const ex=r.expected.features[String(row.umaban)];for(const k of C.CARD.features){if(k==='age_months'&&row.history==='no_history'){noHist++;continue}maxF=Math.max(maxF,Math.abs(row.f[k]-ex[k]))}}
  const u=C.utilities(rows,{features:C.CARD.features,mu:r.model.mu,sd:r.model.sd,beta:r.model.beta})
  if(!rows.some(x=>x.history==='no_history'))u.forEach((x,i)=>{maxU=Math.max(maxU,Math.abs(x-r.expected.u[i]))})
  const box=C.plBox(u).set.map(i=>rows[i].umaban).sort((a,b)=>a-b)
  if(JSON.stringify(box)===JSON.stringify([...r.expected.box_pl].sort((a,b)=>a-b)))boxSame++
 }
 assert.ok(maxF<1e-9,'feature parity '+maxF);assert.ok(maxU<1e-9,'utility parity '+maxU)
 assert.equal(boxSame,fx.races.length,`BOX identical ${boxSame}/${fx.races.length}`)
 // 4) production model/history wiring: final race date gating and history prior-only
 const H=JSON.parse(await fs.readFile('src/data/card_history_age4.json'))
 assert.equal(H.history_through,C.CARD.history_file.history_through);assert.equal(sha(await fs.readFile('src/data/card_history_age4.json')),C.CARD.history_file.sha256)
 assert.ok(H.history_through<C.CARD.applies_to.effective_from_race_date)
 const races=JSON.parse(await fs.readFile('src/data/races_from_pdf.json'))
 for(const race of races)assert.equal(C.cardBoxAge4(race).reason,'before_effective_date','saved Nov 6-8 cards keep 29-feature BOX')
 const future=races.map(r=>({...r,race_date:'2026-11-14',race_id:'20261114'+r.race_id.slice(8)}))
 const res=future.map(r=>C.cardBoxAge4(r)),elig=res.filter(x=>x.eligible)
 assert.equal(elig.length,races.filter(r=>C.ageType(r)==='pure_O'&&C.parseClass(r.name).ctype).length)
 for(const [i,x] of res.entries()){if(C.ageType(future[i])!=='pure_O'||!C.parseClass(future[i].name).ctype)assert.equal(x.eligible,false);else{assert.equal(x.box.length,3);assert.equal(new Set(x.box.map(h=>h.umaban)).size,3)}}
 // history gap guard: a candidate horse that ran after history_through but before the race date -> not applied
 const fR=future.find((r,i)=>res[i].eligible),gapCard={race_date:'2026-11-13',entries:[{name:fR.entries[0].name,status:null}]}
 assert.equal(C.cardBoxAge4(fR,{laterCards:[gapCard]}).reason,'history_gap')
 // memrobo forced into the BOX (fixed-axis rule preserved)
 const mem={...fR,entries:fR.entries.map((e,i)=>i===fR.entries.length-1?{...e,name:'メムロボブサップ'}:e)},mb=C.cardBoxAge4(mem)
 assert.equal(mb.eligible,true);assert.equal(mb.box[0].name,'メムロボブサップ');assert.equal(mb.memrobo_forced,true)
 // 5) selection layer: <=3/mixed/old dates unchanged; pure_O only BOX replaced, gate/confidence unchanged
 const {buildSelection}=await server.ssrLoadModule('/src/boxSelection.js'),{buildRaceRecommendation}=await server.ssrLoadModule('/src/selectionReason.js')
 const snap=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),byId=new Map(races.map(r=>[r.race_id,r]))
 let replaced=0
 for(const row of snap.races){
  const race={...byId.get(row.race_id),track_moisture:row.selection_meta.track_moisture}
  const old=buildRaceRecommendation(race,row.predictions),now=buildSelection(race,row.predictions,{laterCards:races})
  assert.deepEqual(now,old,'saved date: identical recommendation object '+row.race_id)
  assert.deepEqual(old.selection_meta.top3,row.selection_meta.top3);assert.equal(old.confidence,row.confidence)
  const fr={...race,race_date:'2026-11-14'},fut=buildSelection(fr,row.predictions,{laterCards:races}),base=buildRaceRecommendation(fr,row.predictions)
  assert.equal(fut.recommended,base.recommended);assert.equal(fut.confidence,base.confidence);assert.equal(fut.selection_meta.gate_skip,base.selection_meta.gate_skip)
  assert.deepEqual(fut.selection_meta.confidence_bands,base.selection_meta.confidence_bands)
  if(C.cardBoxAge4(fr).eligible){assert.equal(fut.selection_meta.box_method,'card_score_age4');assert.equal(fut.selection_meta.confidence_axis.horse_id,base.selection_meta.axis.horse_id);assert.equal(fut.selection_meta.top3.length,3);if(JSON.stringify(fut.selection_meta.top3.map(h=>h.umaban).sort())!==JSON.stringify(base.selection_meta.top3.map(h=>h.umaban).sort()))replaced++}
  else{assert.equal(fut.selection_meta.box_method,'model29');assert.deepEqual(fut.selection_meta.top3,base.selection_meta.top3);assert.deepEqual(fut.selection_meta.axis,base.selection_meta.axis);assert.equal(fut.selection_comment,base.selection_comment)}
 }
 console.log(JSON.stringify({class_missing:classMissing,parity_races:fx.races.length,box_identical:boxSame,max_feature_diff:maxF,max_utility_diff:maxU,no_history_age_fallbacks:noHist,future_counterfactual_pure_O:elig.length,box_changed_vs_model29:replaced}))
}finally{await server.close()}
console.log('card-score-age4 ok')
