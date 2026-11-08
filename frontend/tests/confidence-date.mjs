import {renderResolved} from './render-resolved.mjs'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// Keep browser-only storage writes in memory; model and fixture files remain read-only.
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}

// Vite loads the actual application, including its import.meta.glob data.
const server = await createServer({ server: { middlewareMode: true } })
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  const { default: ConfidenceRank } = await server.ssrLoadModule('/src/components/ConfidenceRank.jsx')
  const { DATES, dayInfo } = await server.ssrLoadModule('/src/lib/paginate.js')
  const {snapshotRows} = await server.ssrLoadModule('/src/predictionSnapshot.js')
  const { buildRaceRecommendation } = await server.ssrLoadModule('/src/selectionReason.js')
  const ui = { App, ConfidenceRank, DATES, dayInfo, buildRaceRecommendation, createElement, renderToStaticMarkup }
  const render = (Component, props) => ui.renderToStaticMarkup(ui.createElement(Component, props))
  let checked = 0
  for (const date of [...ui.DATES, '2099-01-01']) {
    const expected = ui.dayInfo(date).races.map(race => ({
      race, rec: snapshotRows(date).find(r=>r.race_id===race.race_id) || {recommended:false},
    })).filter(({ rec }) => rec.recommended)
      .sort((a, b) => b.rec.confidence - a.rec.confidence || a.race.race_no - b.race.race_no)
    const html = render(ui.ConfidenceRank, { date })
    const cards = [...html.matchAll(/<article[^>]*data-confidence="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)]
    assert.equal(cards.length, expected.length, date)
    cards.forEach((card, i) => {
      assert.equal(Number(card[1]), expected[i].rec.confidence, date)
      assert.ok(card[2].includes(`${expected[i].race.race_no}R`)&&card[2].includes(date),date)
    })
    if (!expected.length) assert.ok(html.includes(`対象: ${date}`), date)
    globalThis.location = { search: `?view=confidence&date=${date}` }
    const app = await renderResolved(createElement(ui.App))
    assert.ok(app.includes(`type="date" value="${date}"`), date)
    assert.ok(!app.includes('日別まとめ'), 'Removed summary navigation must not reappear')
    assert.ok(app.includes('自信度順'))
    assert.ok(app.includes(html), `App forwards selected date ${date}`)
    checked += cards.length
  }
  globalThis.location = { search: '?view=summary&date=2026-11-06' }
  const legacy = await renderResolved(createElement(ui.App))
  assert.ok(!legacy.includes('日別まとめ'))
  assert.ok(!legacy.includes('confidence-rank'))
  assert.ok(legacy.includes('recommendation-card'), 'Removed summary URL falls back to normal races')
  assert.ok(checked > 0, 'Fixture must include recommended races')
  console.log(`PASS: ${ui.DATES.length} available dates plus empty date; ${checked} recommendations, date isolation, confidence order, shared date picker and URL date.`)
} finally {
  await server.close()
}
