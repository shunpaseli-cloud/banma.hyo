import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
import {renderResolved} from './render-resolved.mjs'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const data=JSON.parse(await readFile('src/data/confidence-results.json')),snapshot=JSON.parse(await readFile('src/data/prediction_snapshot.json'))
 assert.deepEqual(data,JSON.parse(await readFile('public/confidence-results.json')))
 assert.equal(data.meta.version,snapshot.meta.version)
 const expected=snapshot.races
 assert.equal(data.races.length,expected.length)
 for(const row of data.races){const original=expected.find(r=>r.race_id===row.race_id);for(const key of Object.keys(original))assert.deepEqual(row[key],original[key]);assert.equal(row.tickets.length,6);if(row.snapshot_timing!=='prestart')assert.equal(row.hit,null);if(row.result.status!=='final')assert.equal(row.hit,null)}
 const {default:View,summarizeRows,predictionOf}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx'),{default:App}=await server.ssrLoadModule('/src/App.jsx'),{reconcileBox}=await server.ssrLoadModule('/src/raceResults.js')
 const before=JSON.stringify([...memory])
 for(const date of ['2026-11-06','2026-11-07','2026-11-08']){
  const rows=data.races.filter(r=>r.race_date===date),html=renderToStaticMarkup(createElement(View,{date})),counts=summarizeRows(rows)
  assert.deepEqual([...html.matchAll(/data-confidence="([^"]+)"/g)].map(m=>+m[1]),[...rows].sort((a,b)=>a.race_no-b.race_no).map(r=>r.confidence))
  assert.equal((html.match(/data-box-numbers=/g)||[]).length,12);assert.equal((html.match(/class="results-box-tickets"/g)||[]).length,0,'six permutations stay out of the compact main list');assert.deepEqual([...html.matchAll(/data-race-id="([^"]+)"/g)].map(m=>m[1]),rows.sort((a,b)=>a.race_no-b.race_no).map(r=>r.race_id))
  assert.ok(!html.includes('class="ticket-grid"'));assert.ok(html.includes('詳細'))
  const rendered=[...html.matchAll(/<tr[^>]*data-race-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];assert.equal(rendered.length,12)
  const expanded=renderToStaticMarkup(createElement(View,{date,detailsOpen:true}));assert.equal((expanded.match(/class="results-box-tickets"/g)||[]).length,12)
  for(const [i,match] of rendered.entries()){const row=rows.find(r=>r.race_id===match[1]),body=match[2];assert.equal(row.race_no,i+1);assert.ok(html.includes(row.race_name));assert.ok(body.includes(`data-box-numbers="${row.selection_meta.top3.map(h=>h.umaban).join('-')}"`));assert.equal(new Set(row.tickets.map(t=>t.join('-'))).size,6);for(const t of row.tickets)assert.ok(expanded.includes(t.join('−')));if(row.result.status==='final'){const actual=row.result.finishes.filter(f=>f.finish>=1&&f.finish<=3).sort((a,b)=>a.finish-b.finish);assert.ok(body.includes(`data-finish-numbers="${actual.map(f=>f.umaban).join('-')}"`));for(const f of actual)assert.ok(expanded.includes(`${f.finish}着`)&&expanded.includes(`${f.umaban}番`)&&expanded.includes(f.name));const hit=row.result.payouts.trifecta.some(p=>row.tickets.some(t=>t.join('-')===p.combo.join('-')));assert.ok(body.includes(hit?'的中':'不的中'))}else assert.ok(body.includes('未確定')&&!body.includes('不的中')&&!body.includes('¥0'))}
  if(date==='2026-11-08'){const pending=rows.filter(row=>row.result.status!=='final'||!row.result.payouts?.trifecta?.length);assert.equal(counts.pending,pending.length);for(const row of pending)assert.equal(reconcileBox(row.result,predictionOf(row)).returnYen,null);assert.ok(!html.includes('払戻 ¥0')&&!html.includes('収支'))}
  else{assert.equal(counts.prestart,0);assert.equal(counts.reference,rows.length);assert.ok(html.includes('事後再計算'))}
  globalThis.location={search:`?view=results&date=${date}`}
  const app=await renderResolved(createElement(App));assert.ok(app.includes('class="confidence-results results-page"')&&app.includes('自信度順')&&!app.includes('日別まとめ'))
 }
 assert.equal(JSON.stringify([...memory]),before,'primary views must never calculate or train')
 const archive='public/prediction-history/legacy-20261106T190648/',manifest=JSON.parse(await readFile(archive+'manifest.json'))
 for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(archive+file)).digest('hex'),sha)
 assert.deepEqual(manifest.prestart_summary,{races:7,hits:0,stake_yen:4200,return_yen:0})
 console.log('PASS: common current recommendation version, exact metadata/tickets, postrace-only reference, unknown future returns, bytewise legacy archive and independent old prestart 7R/0 hits.')
}finally{await server.close()}
