// 過去開催の公式PDF（出走表 src/data/past/*.json + 結果 results_from_pdf.json）で一括学習し
// src/data/learned_weights.json に書き出す。ユーザー入力不要。 node scripts/learn_past.mjs
import fs from 'node:fs'
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] } }
const D = new URL('../src/data/', import.meta.url)
fs.writeFileSync(new URL('learned_weights.json', D), '{"weights":null}')
const { predict, updateWithResult, getWeights, DEFAULT_WEIGHTS } = await import('../src/feedback.js')
const { analyzeMisses } = await import('../src/missAnalysis.js')
const races = fs.readdirSync(new URL('past/', D)).filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(new URL('past/' + f, D)))).concat(JSON.parse(fs.readFileSync(new URL('races_from_pdf.json', D))))
const results = JSON.parse(fs.readFileSync(new URL('results_from_pdf.json', D))).races
const learned = [], skipped = []
for (const race of races.sort((a, b) => a.race_id.localeCompare(b.race_id))) {
  const fin = results[race.race_id]; if (!fin?.length) { skipped.push(race.race_id); continue }
  const map = {}
  for (const e of race.entries) { const r = fin.find(x => x.name === e.name) || fin.find(x => x.umaban === e.umaban); if (r?.finish) map[e.horse_id] = r.finish }
  if (Object.keys(map).length < 3) { skipped.push(race.race_id); continue }
  const preds = predict(race, true); const u = updateWithResult(race, map); analyzeMisses(race, preds, map)
  learned.push({ race_id: race.race_id, matched: Object.keys(map).length, updated: u.updated })
}
const w = getWeights(), round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]))
const delta = Object.fromEntries(Object.keys(w).map(k => [k, +(w[k] - DEFAULT_WEIGHTS[k]).toFixed(4)]))
fs.writeFileSync(new URL('learned_weights.json', D), JSON.stringify({ weights: round(w), delta, races_learned: learned.length,
  race_ids: learned.map(x => x.race_id), skipped_no_result: skipped, learned_at: new Date().toISOString() }, null, 1))
console.log(JSON.stringify({ learned: learned.length, skipped, weights: round(w), delta, kept_preds_races: [...new Set(JSON.parse(mem['banma.predictions']).map(p => p.race_id))], miss_log_races: [...new Set(JSON.parse(mem['banma.miss_log'] || '[]').map(x => x.race_id))] }))
