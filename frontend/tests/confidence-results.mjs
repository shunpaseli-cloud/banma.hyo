import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}
const server=await createServer({server:{middlewareMode:true}})
try {
  const raw=await readFile(new URL('../src/data/recommendations.json',import.meta.url))
  const original=JSON.parse(raw)
  const data=JSON.parse(await readFile(new URL('../src/data/confidence-results.json',import.meta.url)))
  assert.deepEqual(data,JSON.parse(await readFile(new URL('../public/confidence-results.json',import.meta.url))))
  assert.equal(data.meta.source_sha256,createHash('sha256').update(raw).digest('hex'))
  const expected=original.races.filter(r=>r.recommended===true)
  assert.equal(data.races.length,expected.length);assert.equal(data.races.length,15)
  assert.deepEqual(new Set(data.races.map(r=>r.race_id)),new Set(expected.map(r=>r.race_id)))
  for(const row of data.races){
    const source=expected.find(r=>r.race_id===row.race_id)
    for(const key of Object.keys(source))assert.deepEqual(row[key],source[key],`${row.race_id} unchanged ${key}`)
    assert.equal(row.tickets.length,6);assert.equal(new Set(row.tickets.map(t=>t.join('-'))).size,6)
    const horses=row.selection_meta.top3.map(h=>h.umaban).sort((a,b)=>a-b)
    for(const t of row.tickets)assert.deepEqual([...t].sort((a,b)=>a-b),horses)
    assert.equal(row.ticket_yen,100);assert.equal(row.stake_yen,600)
  }
  const {default:View,summarizeRows,predictionOf}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx')
  const {default:App}=await server.ssrLoadModule('/src/App.jsx')
  const {reconcileBox}=await server.ssrLoadModule('/src/raceResults.js')
  const before=JSON.stringify([...memory])
  for(const date of ['2026-11-06','2026-11-07','2026-11-08']){
    const rows=data.races.filter(r=>r.race_date===date)
    const html=renderToStaticMarkup(createElement(View,{date}))
    const confidences=[...html.matchAll(/data-confidence="([^"]+)"/g)].map(m=>+m[1])
    assert.deepEqual(confidences,[...rows].sort((a,b)=>b.confidence-a.confidence||a.race_no-b.race_no).map(r=>r.confidence))
    assert.equal((html.match(/（100円）/g)||[]).length,rows.length*6)
    assert.ok(html.includes('選定理由comment（保存原文）'))
    const summary=summarizeRows(rows)
    if(date==='2026-11-08'){
      assert.equal(summary.pending,7);assert.equal(summary.settled,0)
      for(const row of rows)assert.equal(reconcileBox(row.result,predictionOf(row)).returnYen,null)
      assert.ok(!html.includes('収支'))
    }else{
      assert.equal(summary.settled,rows.length);assert.equal(summary.pending,0)
      assert.ok(html.includes('公式確定発表時刻'))
    }
    if(date==='2026-11-06')assert.ok(html.includes('発走以後'))
    globalThis.location={search:`?view=confidence-results&date=${date}`}
    const app=renderToStaticMarkup(createElement(App))
    assert.ok(app.includes('class="confidence-results"'));assert.ok(app.includes('自信度順'))
    assert.ok(!app.includes('日別まとめ'))
  }
  assert.equal(JSON.stringify([...memory]),before,'new view must not predict, train or alter storage')
  const final=data.races.filter(r=>r.race_date<='2026-11-07')
  const totals=summarizeRows(final)
  assert.deepEqual(totals,{recommended:8,settled:8,pending:0,hit:0,prestart:7,reference:1,returnYen:0,stakeYen:4800})
  console.log('PASS confidence-results: frozen 15 recommendations, exact score/comment/meta, six tickets each, date sorting, separate pending/reference, original confidence tab retained, no prediction/storage writes.')
  console.log('Nov 6–7 counts:',JSON.stringify(totals))
}finally{await server.close()}
