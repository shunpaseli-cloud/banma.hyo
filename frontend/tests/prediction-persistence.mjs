import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createServer} from 'vite'
import {compactRecord,persistSharedSnapshot} from '../src/predictionPersistence.js'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:()=>{throw new Error('history deletion forbidden')}}
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
try{
 const {contentIdentity,forecastFingerprint}=await server.ssrLoadModule('/src/predictionSnapshot.js'),snapshot=JSON.parse(await fs.readFile('src/data/prediction_snapshot.json')),history=JSON.parse(await fs.readFile('public/confidence-history-version.json')),raw=snapshot.meta.weather.raw
 const identity=await contentIdentity(snapshot,raw,history,snapshot.races),again=await contentIdentity(snapshot,structuredClone(raw),history,snapshot.races.map(r=>({...r,snapshot_saved_at:'2026-11-08T13:00:00+09:00',snapshot_timing:'postrace',confidence_saved_at:'2026-11-08T13:00:00+09:00',snapshot_version:'random-time-id',persistence_status:'unavailable'})))
 assert.deepEqual(identity,again,'content versions ignore check/save times, random IDs, persistence flags and route load order')
 const irrelevant=structuredClone(raw);irrelevant.generationtime_ms=999;irrelevant.daily.time.push('2030-01-01');for(const key of ['precipitation_sum','relative_humidity_2m_mean','et0_fao_evapotranspiration'])irrelevant.daily[key].push(999)
 assert.equal(forecastFingerprint(snapshot,raw),forecastFingerprint(snapshot,irrelevant),'unused forecast days/provider generation metadata do not create false new content')
 assert.notEqual(identity.date_content_versions['2026-11-06'],identity.date_content_versions['2026-11-07'])
 const fixture={...snapshot,meta:{...snapshot.meta,...identity}},fullBytes=Buffer.byteLength(JSON.stringify(fixture)),compactBytes=Buffer.byteLength(JSON.stringify(compactRecord(fixture)))
 assert.ok(compactBytes<fullBytes*.15,`${compactBytes}/${fullBytes}`)
 const text=JSON.stringify(compactRecord(fixture));assert.ok(!text.includes('neighbors')&&!text.includes('normalization')&&!text.includes('top_contribs')&&!text.includes('frozen_finish_score')&&!text.includes('predictions'))
 const oldHistory='immutable old browser history';memory.set('banma.snapshot.history.old-unrelated',oldHistory)
 const first=await persistSharedSnapshot(fixture),body=memory.get(`banma.snapshot.history.${identity.version}`);assert.equal(first.meta.persistence_status,'browser_history');assert.equal(JSON.parse(body).schema_version,3)
 const later=structuredClone(fixture);later.meta.generated_at_asia_tokyo='2026-11-08T13:00:00+09:00';for(const r of later.races){r.snapshot_saved_at='2026-11-08T13:00:00+09:00';r.snapshot_timing=Date.parse(r.snapshot_saved_at)<Date.parse(r.scheduled_start_at)?'prestart':'postrace'}
 const reused=await persistSharedSnapshot(later);assert.equal(memory.get(`banma.snapshot.history.${identity.version}`),body);assert.equal(reused.meta.generated_at_asia_tokyo,first.meta.generated_at_asia_tokyo);assert.deepEqual(reused.races.map(r=>r.snapshot_saved_at),first.races.map(r=>r.snapshot_saved_at),'reuse first immutable save time, not reload time');assert.equal(memory.get('banma.snapshot.history.old-unrelated'),oldHistory)
 const backup=new Map(),quota={getItem:()=>null,setItem:()=>{throw new Error('QuotaExceededError')},removeItem:()=>{throw new Error('do not delete')}};const adapter=async r=>{if(!backup.has(r.version))backup.set(r.version,structuredClone(r));return backup.get(r.version)}
 const alternate=await persistSharedSnapshot(fixture,{storage:quota,backup:adapter});assert.equal(alternate.meta.persistence_status,'browser_indexeddb');assert.ok(alternate.meta.persistence_warning.includes('QuotaExceededError'));await persistSharedSnapshot(later,{storage:quota,backup:adapter});assert.equal(backup.size,1)
 const denied=await persistSharedSnapshot(fixture,{storage:quota,backup:async()=>{throw new Error('unsupported')}});assert.equal(denied.meta.persistence_status,'unavailable');assert.ok(denied.meta.persistence_error.includes('QuotaExceededError')&&denied.meta.persistence_error.includes('unsupported'));assert.ok(denied.races.every(r=>r.persistence_status==='unavailable'))
 const corrupt=JSON.parse(body);corrupt.races[0].tickets=[[99,98,97]];const bad={getItem:k=>k.includes(identity.version)?JSON.stringify(corrupt):null,setItem:()=>{throw new Error('must not overwrite corrupt evidence')}};assert.equal((await persistSharedSnapshot(fixture,{storage:bad,backup:async()=>{throw new Error('off')}})).meta.persistence_status,'unavailable')
 const cyclic=structuredClone(fixture);cyclic.unrelated_cycle=cyclic;assert.doesNotThrow(()=>JSON.stringify(compactRecord(cyclic)))
 const css=await fs.readFile('src/styles/theme.css','utf8');assert.ok(css.includes('.app.app-results{max-width:880px;min-width:0}')&&css.includes('table-layout:fixed'));assert.ok(!css.includes('position:sticky')&&!css.includes('min-width:900px')&&!css.includes('min-width:960px'))
 console.log(JSON.stringify({pass:'stable input/result/day content versions; no unused-day churn; minimal immutable records; original timestamps retained; quota fallback/no-history-deletion; honest total failure; malformed record guard; desktop container/table geometry',full_snapshot_bytes:fullBytes,compact_record_bytes:compactBytes,reduction_pct:100*(1-compactBytes/fullBytes)}))
}finally{await server.close()}
