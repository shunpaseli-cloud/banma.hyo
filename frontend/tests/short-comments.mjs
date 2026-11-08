import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const sha=s=>createHash('sha256').update(s).digest('hex')
const numeric=(v,p='')=>typeof v==='number'?[[p,v]]:v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>numeric(x,p+'/'+k)):[]
const raw=await fs.readFile('src/data/learned_model.json'),model=JSON.parse(raw),{comment_style,confidence_method,...predictive}=model
assert.equal(sha(JSON.stringify(predictive)),'877b650d3f340d403ad61667c415c8ee2f1967e76a928466ee31d4436edb55a5','every pre-existing model field unchanged')
assert.equal(sha(JSON.stringify(numeric(predictive))),'3b20528d5641cf6e96eeac8df244afee7411c2c408ce873c55af409040b5f3b8','all13911 numeric scalars unchanged')
const style=JSON.parse(await fs.readFile('src/data/comment_style.json'))
assert.deepEqual(style.comment_style,comment_style)
assert.equal(style.model_file_sha256,sha(raw))
assert.deepEqual(JSON.parse(await fs.readFile('public/comment-style.json')),style)
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const {calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js')
 const snapshot=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),races=JSON.parse(await fs.readFile('src/data/races_from_pdf.json'))
 const nearest=await server.ssrLoadModule('/src/confidenceNearest.js');nearest.setConfidenceIndex(new nearest.NearestIndex(JSON.parse(await fs.readFile('public/confidence-history.json'))))
 const replay=calculateRows(races,snapshot.meta.weather.raw,snapshot.meta.snapshot_saved_at)
 assert.equal(replay.length,36)
 const golden=JSON.parse(await fs.readFile('tests/fixtures/pre-nearest-invariants.json'));for(const row of replay){const old=golden.rows.find(r=>r.race_id===row.race_id);assert.equal(sha(JSON.stringify(row.predictions)),old.predictions_sha256,'all saved horse scores/features unchanged');assert.deepEqual(row.tickets,old.tickets);assert.equal(row.recommended,old.recommended)}
 const {horseComments,default:Comments}=await server.ssrLoadModule('/src/components/SelectionComment.jsx')
 let n=0,max=0;const unique=new Set()
 for(const row of snapshot.races){
  const before=JSON.stringify(row),notes=horseComments(row),html=renderToStaticMarkup(createElement(Comments,{rec:row}))
  assert.equal(notes.length,3);assert.equal((html.match(/class="horse-comment"/g)||[]).length,3)
  assert.equal((html.match(/<h3/g)||[]).length,1);assert.ok(!/<h[12456]|<br/.test(html),'not three headline/body/closing blocks')
  assert.ok(html.includes(`data-comment-style="${comment_style.version}"`))
  for(const note of notes){
   n++;max=Math.max(max,note.text.length);unique.add(note.text)
   assert.ok(note.text.length<=comment_style.max_characters&&note.text.length>=20,note.text)
   assert.ok(!/[\d０-９]|past_form|\bpf\b|\bscore\b|係数|寄与率|λ|feature|脚質|好調|適性|必勝/.test(note.text),note.text)
   assert.ok(html.includes(note.text)&&html.includes(note.name))
   if(note.evidence_feature){
    const p=row.predictions.find(p=>p.name===note.name);assert.ok(p.top_contribs.some(c=>c.name===note.evidence_feature&&c.contrib>0))
   }
  }
  assert.equal(new Set(notes.map(n=>n.text)).size,3,'avoid identical three-horse filler')
  assert.equal(JSON.stringify(row),before,'presentation cannot mutate shared prediction')
 }
 assert.ok(unique.size>12,'grounded variations across races')
 const fixture={recommended:true,selection_meta:{axis:{umaban:1},top3:[{umaban:1,name:'甲'},{umaban:2,name:'乙'},{umaban:3,name:'丙'}]},predictions:[]}
 for(const note of horseComments(fixture))assert.equal(note.evidence_source,'saved_selection_role')
 assert.ok(horseComments({...fixture,recommended:false}).every(n=>/参考|購入対象/.test(n.text)))
 const hostile={...fixture,predictions:[{name:'甲',top_contribs:[{name:'body_weight',contrib:-1,value:999}]}]}
 assert.equal(horseComments(hostile)[0].evidence_feature,null,'negative contributions are not positive evidence')
 const custom=structuredClone(comment_style);custom.fallback.axis='選定評価の中心に据える。組合せの軸として参考にしたい。';assert.equal(horseComments(fixture,custom)[0].text,custom.fallback.axis,'model policy actually drives output')
 const views=[['/src/components/RaceCard.jsx',null],['/src/components/ConfidenceRank.jsx','2026-11-08'],['/src/components/ConfidenceResults.jsx','2026-11-08'],['/src/components/RaceDetail.jsx',null]]
 const row=snapshot.races.find(r=>r.race_id==='20261108-R04'),notes=horseComments(row),race=races.find(r=>r.race_id===row.race_id)
 for(const [file,date] of views){const {default:View}=await server.ssrLoadModule(file);const html=renderToStaticMarkup(createElement(View,date?{date,detailsOpen:true}:{race,rec:row}));for(const note of notes)assert.ok(html.includes(note.text),file);assert.ok(html.includes(comment_style.version))}
 const css=await fs.readFile('src/styles/theme.css','utf8');assert.ok(css.includes('.horse-comment')&&css.includes('max-inline-size:32em')&&css.includes('overflow-wrap:anywhere')&&css.includes('@media(max-width:480px)'))
 console.log(JSON.stringify({pass:'short newspaper capsules, model metadata only, all36 exact replay, all4 shared views, no numerical rationale/fabrication, fallback/skip/negative-evidence guards',notes:n,unique:unique.size,max_characters:max,model_before:style.predictive_payload_sha256,model_after:style.model_file_sha256,numeric_parameters_sha256:sha(JSON.stringify(numeric(predictive))),same_input_36_sha256:sha(JSON.stringify(replay)),example:notes},null,2))
}finally{await server.close()}
