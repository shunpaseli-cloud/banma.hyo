import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}})
try{
 const {default:Results}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx'),{posthocRows}=await server.ssrLoadModule('/src/posthocPredictions.js')
 const snapshot=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),verified=JSON.parse(await fs.readFile('src/data/verified_results.json'))
 assert.ok(!snapshot.races.some(r=>r.race_date==='2026-11-14'),'no saved day-of prediction for 11/14 (post-hoc stays separate)')
 const rows=posthocRows('2026-11-14');assert.equal(rows.length,12);assert.ok(rows.every(r=>r.snapshot_timing==='posthoc'))
 const html=renderToStaticMarkup(createElement(Results,{date:'2026-11-14'})),trs=[...html.matchAll(/<tr[^>]*data-race-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)]
 assert.equal(trs.length,12);assert.ok(html.includes('事後生成'));assert.ok(html.includes('全 12R · 確定照合 12R · 未確定・保留 0R'))
 let hits=0
 for(const [,id,body] of trs){const row=rows.find(r=>r.race_id===id),res=verified.races[id];assert.equal(res.status,'final')
  const box=row.selection_meta.top3.map(h=>h.umaban),top=res.finishes.filter(f=>f.finish>=1&&f.finish<=3).sort((a,b)=>a.finish-b.finish).map(f=>f.umaban)
  assert.ok(body.includes(`data-box-numbers="${box.join('-')}"`));assert.ok(body.includes(`data-finish-numbers="${top.join('-')}"`))
  const hit=[...box].sort().join()===[...top].sort().join();if(hit)hits++;assert.ok(body.includes(hit?'的中':'不的中'))}
 assert.equal(hits,2);assert.ok(html.includes('確定12R中 的中2R'))
 // saved days unchanged: no posthoc badge on 11/8
 const h8=renderToStaticMarkup(createElement(Results,{date:'2026-11-08'}));assert.ok(!h8.includes('posthoc-note'));assert.ok(h8.includes('全 12R · 確定照合 11R'))
 assert.equal(crypto.createHash('sha256').update(await fs.readFile('src/data/learned_model.json')).digest('hex'),'e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893')
 console.log(JSON.stringify({pass:'11/14 post-hoc predictions labelled 事後生成, 12R results, 2 hits, separate from saved snapshot; 11/8 unchanged; model sha unchanged'}))
}finally{await server.close()}
