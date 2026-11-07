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
 const expected=snapshot.races.filter(r=>r.recommended)
 assert.equal(data.races.length,expected.length)
 for(const row of data.races){const original=expected.find(r=>r.race_id===row.race_id);for(const key of Object.keys(original))assert.deepEqual(row[key],original[key]);assert.equal(row.tickets.length,6);if(row.snapshot_timing!=='prestart')assert.equal(row.hit,null);if(row.result.status!=='final')assert.equal(row.hit,null)}
 const {default:View,summarizeRows,predictionOf}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx'),{default:App}=await server.ssrLoadModule('/src/App.jsx'),{reconcileBox}=await server.ssrLoadModule('/src/raceResults.js')
 const before=JSON.stringify([...memory])
 for(const date of ['2026-11-06','2026-11-07','2026-11-08']){
  const rows=data.races.filter(r=>r.race_date===date),html=renderToStaticMarkup(createElement(View,{date})),counts=summarizeRows(rows)
  assert.deepEqual([...html.matchAll(/data-confidence="([^"]+)"/g)].map(m=>+m[1]),[...rows].sort((a,b)=>b.confidence-a.confidence||a.race_no-b.race_no).map(r=>r.confidence))
  assert.equal((html.match(/BOX6券を見る/g)||[]).length,rows.length)
  assert.ok(!html.includes('class="ticket-grid"'));assert.ok(html.includes('選定理由'))
  if(date==='2026-11-08'){assert.equal(counts.pending,rows.length);for(const row of rows)assert.equal(reconcileBox(row.result,predictionOf(row)).returnYen,null);assert.ok(!html.includes('払戻 ¥0')&&!html.includes('収支'))}
  else{assert.equal(counts.prestart,0);assert.equal(counts.reference,rows.length);assert.ok(html.includes('事後再計算'))}
  globalThis.location={search:`?view=confidence-results&date=${date}`}
  const app=await renderResolved(createElement(App));assert.ok(app.includes('class="confidence-results"')&&app.includes('自信度順')&&!app.includes('日別まとめ'))
 }
 assert.equal(JSON.stringify([...memory]),before,'primary views must never calculate or train')
 const archive='public/prediction-history/legacy-20261106T190648/',manifest=JSON.parse(await readFile(archive+'manifest.json'))
 for(const [file,sha] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(archive+file)).digest('hex'),sha)
 assert.deepEqual(manifest.prestart_summary,{races:7,hits:0,stake_yen:4200,return_yen:0})
 console.log('PASS: common current recommendation version, exact metadata/tickets, postrace-only reference, unknown future returns, bytewise legacy archive and independent old prestart 7R/0 hits.')
}finally{await server.close()}
