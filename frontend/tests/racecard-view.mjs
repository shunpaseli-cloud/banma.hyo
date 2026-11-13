import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false}})
try{
 const {default:View}=await server.ssrLoadModule('/src/components/RaceCardsView.jsx'),{RACECARD_DATES}=await server.ssrLoadModule('/src/racecards.js'),{VIEWS,viewSearch}=await server.ssrLoadModule('/src/App.jsx')
 assert.ok(VIEWS.has('racecard'));assert.equal(viewSearch('2026-11-14','racecard'),'?date=2026-11-14&view=racecard')
 const expect={'2026-11-14':[10,9,9,10,10,10,10,10,10,9,9,7],'2026-11-15':[10,9,10,10,10,10,10,10,10,10,9,9]}
 for(const [date,counts] of Object.entries(expect)){
  assert.ok(RACECARD_DATES.includes(date))
  const card=JSON.parse(await fs.readFile(`src/data/racecards/racecard_${date}.json`))
  assert.deepEqual(card.races.map(r=>r.race_no),[1,2,3,4,5,6,7,8,9,10,11,12]);assert.deepEqual(card.races.map(r=>r.entries.length),counts)
  for(const r of card.races){assert.equal(r.head_count,r.entries.length);assert.equal(r.verification.pdf_head_count,r.entries.length);assert.equal(r.verification.nar_head_count,r.entries.length);assert.ok(r.verification.horse_fields_agree)
   for(const e of r.entries){assert.ok(e.name&&e.umaban&&e.gate&&e.sled_weight&&e.jockey&&e.trainer);assert.equal(e.odds,null)}}
  const html=renderToStaticMarkup(createElement(View,{date,onDate:()=>{}})),rows=[...html.matchAll(/data-race-id="([^"]+)" data-head-count="(\d+)"/g)]
  assert.equal(rows.length,12);assert.deepEqual(rows.map(m=>Number(m[2])),counts)
  for(const r of card.races)for(const e of r.entries)assert.ok(html.includes(e.name))
 }
 const css=await fs.readFile('src/styles/theme.css','utf8'),rc=css.slice(css.indexOf('/* Race cards'))
 assert.ok(!/overflow(?:-x)?\s*:\s*(?:auto|scroll)|min-width\s*:\s*\d{3,}px|white-space\s*:\s*nowrap/.test(rc));assert.ok(rc.includes('table-layout:fixed'))
 assert.equal(crypto.createHash('sha256').update(await fs.readFile('src/data/learned_model.json')).digest('hex'),'e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893')
 console.log(JSON.stringify({pass:'racecard view: 2 dates x 12R, head counts, all horses rendered, no-scroll CSS, learned_model unchanged'}))
}finally{await server.close()}
