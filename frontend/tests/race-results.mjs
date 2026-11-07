import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const memory = new Map()
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) }
const server = await createServer({ server: { middlewareMode: true } })
try {
  const api = await server.ssrLoadModule('/src/raceResults.js')
  const { dayInfo } = await server.ssrLoadModule('/src/lib/paginate.js')
  const { default: RaceResult } = await server.ssrLoadModule('/src/components/RaceResult.jsx')
  const { default: ConfidenceRank } = await server.ssrLoadModule('/src/components/ConfidenceRank.jsx')
  const bundled = JSON.parse(await readFile(new URL('../src/data/verified_results.json', import.meta.url)))
  api.validateResults(bundled)
  assert.deepEqual(JSON.parse(await readFile(new URL('../public/verified-results.json', import.meta.url))), bundled)
  assert.ok(!/"[^"\n]*(odds|popularity|オッズ|人気)[^"\n]*"\s*:/.test(JSON.stringify(bundled)))
  const totals = { recommended: 0, hit: 0, miss: 0, unavailable: 0, stake: 0, return: 0, learningHorses: 0 }
  const storageBefore = JSON.stringify([...memory])
  for (const date of ['2026-11-06', '2026-11-07']) {
    const races = dayInfo(date).races
    assert.equal(races.length, 12)
    for (const race of races) {
      const result = api.resultForRace(race), snapshot = api.savedBox(race.race_id)
      const settlement = api.reconcileBox(result, snapshot), learning = api.learningInput(race, result)
      const html = renderToStaticMarkup(createElement(RaceResult, { race }))
      assert.equal(result.status, 'final')
      const top = [1,2,3].map(n => result.finishes.find(f => f.finish === n).umaban)
      assert.ok(result.payouts.trifecta.some(p => p.combo.join('-') === top.join('-')))
      assert.ok(result.payouts.trio.some(p => [...p.combo].sort().join('-') === [...top].sort().join('-')))
      assert.ok(html.includes('実着順'))
      assert.equal(Object.keys(learning.results).length, result.finishes.filter(f => f.status === 'finished').length, race.race_id)
      totals.learningHorses += Object.keys(learning.results).length
      assert.ok(!/odds|popularity|単勝人気/.test(JSON.stringify(learning)))
      if (snapshot.recommended) {
        totals.recommended++; totals[settlement.status]++
        if (settlement.returnYen != null) { totals.stake += 600; totals.return += settlement.returnYen }
      }
    }
  }
  assert.equal(JSON.stringify([...memory]), storageBefore, 'adapter/display must not train or write storage')
  const sample = bundled.races['20261106-R01']
  const prediction = { recommended: true, stakeYen: 600, tickets: [sample.payouts.trifecta[0].combo] }
  assert.equal(api.reconcileBox(sample, prediction).status, 'hit')
  assert.equal(api.reconcileBox(sample, { ...prediction, tickets: [[98,99,100]] }).status, 'miss')
  assert.equal(api.reconcileBox({ ...sample, payouts: {} }, prediction).returnYen, null)
  assert.equal(api.reconcileBox({ ...sample, refunds: [{ umaban: 1 }] }, prediction).status, 'unavailable')
  for (const status of ['missing','provisional','cancelled','not_held']) assert.equal(api.reconcileBox({ status }, prediction).returnYen, null)
  assert.equal(api.reconcileBox(sample, null).status, 'unavailable')
  assert.equal(api.reconcileBox(sample, { ...prediction, recommended: false }).returnYen, null)
  assert.equal(api.learningInput(dayInfo('2026-11-06').races[0], { ...sample, finishes: sample.finishes.slice(0,3) }).meta.partial, true)
  const bad = structuredClone(bundled); bad.races['20261106-R01'].payouts.trifecta[0].yen = null
  assert.throws(() => api.validateResults(bad))
  const conf = renderToStaticMarkup(createElement(ConfidenceRank, { date: '2026-11-06' }))
  assert.ok(conf.includes('実結果・保存予想との照合')); assert.ok(conf.includes('発走以後'))
  console.log('PASS: 24R official results/payout consistency; unknown states remain unavailable; saved BOX settlement; missing/refunds/cancelled/partial; no training writes.')
  console.log('REFERENCE snapshot settlement (not actual purchases or proven pre-race):', JSON.stringify(totals))
} finally { await server.close() }
