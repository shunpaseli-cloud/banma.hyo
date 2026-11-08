import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}})
try{
 const {default:Results}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx'),{canonicalResultsUrl}=await server.ssrLoadModule('/src/App.jsx'),snapshot=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),verified=JSON.parse(await fs.readFile('src/data/verified_results.json')),css=await fs.readFile('src/styles/theme.css','utf8'),resultsCss=css.slice(css.indexOf('/* Compact Results:'))
 for(const date of ['2026-11-06','2026-11-07','2026-11-08']){
  const html=renderToStaticMarkup(createElement(Results,{date})),expanded=renderToStaticMarkup(createElement(Results,{date,detailsOpen:true})),rows=[...html.matchAll(/<tr[^>]*data-race-id="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)]
  assert.equal(rows.length,12);assert.ok(html.includes('3頭BOX')&&html.includes('BOXは順不同'));assert.ok(!html.includes('results-box-tickets')&&!html.includes('results-table-scroll')&&!html.includes('左右にスクロール'))
  for(const [i,[,id,body]] of rows.entries()){
   const row=snapshot.races.find(r=>r.race_id===id),result=verified.races[id];assert.equal(row.race_no,i+1)
   const pick=body.match(/<td data-box-numbers="([^"]*)">([\s\S]*?)<\/td>/);assert.equal(pick[1],row.selection_meta.top3.map(h=>h.umaban).join('-'));assert.equal((pick[2].match(/<b>/g)||[]).length,3,'main BOX is exactly3 numbers, not6 permutations');assert.ok(!pick[2].includes('番'))
   for(const horse of row.selection_meta.top3){assert.ok(expanded.includes(horse.name));assert.ok(!body.includes(horse.name))}
   for(const ticket of row.tickets)assert.ok(expanded.includes(ticket.join('−')))
   if(result.status==='final'){const actual=result.finishes.filter(f=>f.finish>=1&&f.finish<=3).sort((a,b)=>a.finish-b.finish);assert.ok(body.includes(`data-finish-numbers="${actual.map(f=>f.umaban).join('-')}"`));for(const f of actual)assert.ok(expanded.includes(f.name)&&!body.includes(f.name))}
   else assert.ok(body.includes('未確定')&&!body.includes('不的中')&&!body.includes('¥0'))
  }
  assert.equal((expanded.match(/class="results-box-tickets"/g)||[]).length,12);assert.equal((expanded.match(/class="horse-comment"/g)||[]).length,36)
 }
 assert.ok(!/overflow(?:-x)?\s*:\s*(?:auto|scroll|hidden)|position\s*:\s*sticky|min-width\s*:\s*(?:900|960)px/.test(resultsCss),'no scroll/clip/sticky workaround')
 assert.ok(resultsCss.includes('table-layout:fixed')&&resultsCss.includes('min-width:0')&&resultsCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'))
 assert.ok(resultsCss.includes('.results-col-r{width:48px}.results-col-verdict{width:64px}')&&resultsCss.includes('font-size:18px'))
 // Conservative static budget, NOT a browser-computed layout assertion. Two-digit numeral at1.2em=21.6px.
 const widths=[320,375,1280].map(viewport=>{const app=Math.min(viewport,880),padding=viewport<=480?24:32,table=app-padding-2,r=48,verdict=64,numberCell=(table-r-verdict)/2,numberInner=numberCell-8,numeralSlot=(numberInner-4)/3;assert.ok(numeralSlot>=21.6,`${viewport}:2-digit18px numerals fit`);assert.ok(verdict-8>=3*14,'14px three-character verdict fits');assert.ok(r-8>=32,'12R fits at16px');return {viewport,table,numberCell,numeralSlot,r,verdict}})
 assert.equal(canonicalResultsUrl('https://example.test/?view=confidence-results&date=2026-11-08&x=1#r4'),'https://example.test/?view=results&date=2026-11-08&x=1#r4')
 console.log(JSON.stringify({pass:'compact Results3 BOX numbers beside ordered actual3; all36 unchanged records/12R order; default no6-ticket/name clutter; full details/tickets/comments preserved; no clip/scroll/sticky CSS; old redirect; static320/375/1280 width budget',widths}))
}finally{await server.close()}
