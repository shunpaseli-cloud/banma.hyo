// vite-node scripts/export_recommendations.mjs
// 出走表各レースの selection_comment / confidence を JSON 化（UI同梱用）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// browser APIs used by feedback.js
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const { predict } = await import('../src/feedback.js')
const { buildRaceRecommendation } = await import('../src/selectionReason.js')
const races = JSON.parse(fs.readFileSync(new URL('../src/data/races_from_pdf.json', import.meta.url), 'utf8'))

const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(FE, 'src/data/recommendations.json')
const publicPath = path.join(FE, 'public/recommendations.json')

const rows = []
for (const race of races) {
  const preds = predict(race, false)
  const rec = buildRaceRecommendation(race, preds)
  rows.push({
    race_id: race.race_id,
    race_date: race.race_date,
    race_no: race.race_no,
    race_name: race.name || null,
    recommended: rec.recommended,
    confidence: rec.confidence,
    selection_comment: rec.selection_comment,
    selection_meta: rec.selection_meta,
  })
}

const payload = {
  meta: {
    generated_at_asia_tokyo: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T') + '+09:00',
    config: 'plus_hjz BOX123 pf≥0.65 k=0.05',
    races: rows.length,
    recommended: rows.filter(r => r.recommended).length,
    fields: ['recommended', 'confidence', 'selection_comment', 'selection_meta'],
  },
  races: rows,
}
const text = JSON.stringify(payload, null, 1)
fs.writeFileSync(outPath, text)
fs.writeFileSync(publicPath, text)
console.log(`wrote ${outPath} (${rows.length}R, recommended=${payload.meta.recommended})`)
const sample = rows.find(r => r.recommended) || rows[0]
console.log('SAMPLE', JSON.stringify({
  race_id: sample.race_id,
  recommended: sample.recommended,
  confidence: sample.confidence,
  selection_comment: sample.selection_comment,
}, null, 2))
