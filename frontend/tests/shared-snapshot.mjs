import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
const render=(C,p)=>renderToStaticMarkup(createElement(C,p))
const articles=html=>[...html.matchAll(/<(?:article|tr)[^>]*data-confidence="([^"]+)"[^>]*data-snapshot-version="([^"]+)"[^>]*data-top3="([^"]+)"[^>]*>/g)]
try{
 const store=await server.ssrLoadModule('/src/predictionSnapshot.js'),policy=await server.ssrLoadModule('/src/snapshotPolicy.js'),{calculateRows}=await server.ssrLoadModule('/src/calculateSnapshot.js')
 const {default:Normal}=await server.ssrLoadModule('/src/components/RaceCard.jsx'),{default:Rank}=await server.ssrLoadModule('/src/components/ConfidenceRank.jsx'),{default:Results}=await server.ssrLoadModule('/src/components/ConfidenceResults.jsx'),{default:Detail}=await server.ssrLoadModule('/src/components/RaceDetail.jsx'),{default:Info}=await server.ssrLoadModule('/src/components/SnapshotInfo.jsx')
 const original=store.getSnapshotState().snapshot,rawRaces=JSON.parse(await readFile('src/data/races_from_pdf.json')),rawSnapshot=await readFile('public/prediction-snapshot.json','utf8')
 const nearest=await server.ssrLoadModule('/src/confidenceNearest.js'),index=new nearest.NearestIndex(JSON.parse(await readFile('public/confidence-history.json')));nearest.setConfidenceIndex(index);const historyLoader=async()=>({index,version:index.version,latest_result_date:index.latest,races:index.rows.length})
 assert.equal(original.races.length,36);assert.equal(original.races.filter(r=>r.snapshot_timing==='postrace').length,24);assert.equal(original.races.filter(r=>r.snapshot_timing==='prestart').length,12)
 const replay=calculateRows(rawRaces,original.meta.weather.raw,original.meta.snapshot_saved_at)
 for(const row of original.races){const r=replay.find(r=>r.race_id===row.race_id);for(const key of ['selection_meta','predictions','confidence','tickets','recommended'])assert.deepEqual(r[key],row[key],`one calculator replay ${row.race_id} ${key}`)}
 function allViews(snapshot){
  for(const date of ['2026-11-06','2026-11-07','2026-11-08']){
   const rows=snapshot.races.filter(r=>r.race_date===date)
   for(const View of [Rank,Results]){
    const html=render(View,{date});for(const a of articles(html)){const row=rows.find(r=>r.selection_meta.top3.map(h=>h.umaban).join('-')===a[3]&&r.confidence===+a[1]);assert.ok(row);assert.equal(a[2],snapshot.meta.version)}
   }
   for(const row of rows){const race=rawRaces.find(r=>r.race_id===row.race_id),html=render(Normal,{race}),found=articles(html);assert.equal(found.length,1);assert.equal(found[0][2],snapshot.meta.version);assert.equal(found[0][3],row.selection_meta.top3.map(h=>h.umaban).join('-'));assert.equal(+found[0][1],row.confidence)
    assert.ok(render(Detail,{rec:row}).includes(snapshot.meta.version));assert.equal(new Set(row.tickets.map(t=>t.join('-'))).size,6)
   }
  }
 }
 allViews(original)
 const race4=original.races.find(r=>r.race_id==='20261108-R04');assert.deepEqual(race4.selection_meta.top3.map(h=>h.umaban),[4,10,8]);assert.equal(race4.confidence,nearest.confidenceForSelection(rawRaces.find(r=>r.race_id===race4.race_id),race4.selection_meta,{index,at:original.meta.snapshot_saved_at}).confidence);assert.notEqual(race4.confidence,.744)
 for(const View of [Normal,Rank,Results]){const html=render(View,View===Normal?{race:rawRaces.find(r=>r.race_id===race4.race_id)}:{date:'2026-11-08'});assert.ok(html.includes('data-top3="4-10-8"')&&html.includes(`data-confidence="${race4.confidence}"`))}
 const weather=structuredClone(original.meta.weather.raw);weather.daily.precipitation_sum[weather.daily.time.indexOf('2026-11-08')]+=10
 let calculations=0,weatherCalls=0
 const pointer={version:original.meta.version,snapshot_sha256:createHash('sha256').update(rawSnapshot).digest('hex')}
 const fetcher=async url=>{if(url.includes('prediction-version.json'))return {ok:true,json:async()=>pointer};if(url.includes('prediction-snapshot.json'))return {ok:true,text:async()=>rawSnapshot};weatherCalls++;return {ok:true,json:async()=>weather}}
 const calculate=async(...args)=>{calculations++;return calculateRows(...args)}
 await Promise.all([store.refreshSnapshot({force:true,fetcher,calculate,historyLoader}),store.refreshSnapshot({force:true,fetcher,calculate,historyLoader})]);assert.equal(calculations,1);assert.equal(weatherCalls,1)
 const updated=store.getSnapshotState().snapshot;assert.notEqual(updated.meta.version,original.meta.version);allViews(updated)
 const immutableHistory=[...memory].filter(([key])=>key.startsWith('banma.snapshot.history.'))
 assert.equal(immutableHistory.length,1)
 store.acceptSnapshot(original);assert.equal(store.adoptLocalSnapshot(),true);assert.equal(store.getSnapshotState().snapshot.meta.version,updated.meta.version,'revisit/other tab adopts the same latest shared history')
 await store.refreshSnapshot({force:true,fetcher,calculate,historyLoader});assert.equal(calculations,1,'unchanged inputs never recalculate independently');assert.equal(store.getSnapshotState().snapshot.meta.version,updated.meta.version);assert.deepEqual([...memory].filter(([key])=>key.startsWith('banma.snapshot.history.')),immutableHistory)
 await store.refreshSnapshot({force:true,fetcher:async()=>{throw new Error('offline')}});assert.equal(store.getSnapshotState().status,'stale');assert.equal(store.getSnapshotState().snapshot.meta.version,updated.meta.version);assert.ok(render(Info,{date:'2026-11-08',view:'confidence'}).includes('最新確認できず'))
 const mismatchFetcher=async url=>url.includes('prediction-version.json')?{ok:true,json:async()=>({...pointer,version:'wrong'})}:{ok:true,text:async()=>rawSnapshot}
 await store.refreshSnapshot({force:true,fetcher:mismatchFetcher});assert.equal(store.getSnapshotState().status,'stale');assert.equal(store.getSnapshotState().snapshot.meta.version,updated.meta.version,'reject cross-version response')
 const missing=calculateRows([rawRaces[0]],null,original.meta.snapshot_saved_at)[0];assert.equal(missing.prediction_status,'weather_missing');assert.equal(missing.confidence,null);assert.equal(missing.tickets.length,0)
 assert.equal(policy.timingOf('2026-11-08T13:00:00+09:00','2026-11-08T14:00:00+09:00'),'prestart');assert.equal(policy.timingOf('2026-11-08T05:00:00Z','2026-11-08T14:00:00+09:00'),'postrace')
 const bad=structuredClone(original);bad.races[0].snapshot_version='wrong';assert.throws(()=>policy.validateSnapshot(bad));const dup=structuredClone(original);dup.races[0].tickets.fill(dup.races[0].tickets[0]);assert.throws(()=>policy.validateSnapshot(dup))
 assert.ok(render(Rank,{date:'2099-01-01'}).includes('ライブ再計算は行いません'));assert.ok(render(Results,{date:'2099-01-01'}).includes('ライブ再計算は行いません'))
 const priorHistory=[...memory].filter(([key])=>key.startsWith('banma.snapshot.history.'))
 const moreWeather=structuredClone(weather);moreWeather.daily.precipitation_sum[moreWeather.daily.time.indexOf('2026-11-08')]+=10
 const quotaFetcher=async url=>url.includes('prediction-version.json')?{ok:true,json:async()=>pointer}:{ok:true,json:async()=>moreWeather}
 const savedSet=localStorage.setItem;localStorage.setItem=()=>{throw new Error('quota')}
 await store.refreshSnapshot({force:true,fetcher:quotaFetcher,calculate,historyLoader});localStorage.setItem=savedSet
 assert.equal(store.getSnapshotState().persistence,'unavailable');assert.deepEqual([...memory].filter(([key])=>key.startsWith('banma.snapshot.history.')),priorHistory,'never overwrite/delete prior histories on quota failure')
 assert.ok(render(Info,{date:'2026-11-08',view:'races'}).includes('精度検証用記録としては扱えません'))
 assert.equal(memory.has('banma.feedback'),false,'no automatic learning')
 store.acceptSnapshot(original,{status:'current'})
 console.log('PASS shared snapshot: all36 exact CLI replay; normal/confidence/results/detail same version/top3/score/confidence/6 tickets; Nov8 R4 4-10-8/nearest; one concurrent calculation; stable load order; latest-input refresh; immutable history; stale/version mismatch/missing weather; strict prestart boundary; no auto learning.')
}finally{await server.close()}
