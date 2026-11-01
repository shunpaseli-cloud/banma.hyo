// 3連複上位3点(各100円)の的中率・回収率で重みを再調整するバックテスト。 node scripts/tune_weights.mjs [--write]
import fs from 'node:fs'
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] } }
const D = new URL('../src/data/', import.meta.url)
const { extractFeatures, horseScore, FEATURES, DEFAULT_WEIGHTS } = await import('../src/feedback.js')
const { trioPredictions } = await import('../src/trio.js')
const LW = JSON.parse(fs.readFileSync(new URL('learned_weights.json', D)))
const R = JSON.parse(fs.readFileSync(new URL('results_from_pdf.json', D)))
const cards = Object.fromEntries(fs.readdirSync(new URL('past/', D)).flatMap(f => JSON.parse(fs.readFileSync(new URL('past/' + f, D)))).map(r => [r.race_id, r]))
// 出走表が無いレースは結果から本番と同じ情報量のカードを復元（当日馬体重・騎手なし、recent_form=0.3固定）
const races = []
for (const [rid, rows] of Object.entries(R.races)) {
  if (!rows?.length || rows.length < 4) continue
  const card = cards[rid] || { race_id: rid, entries: [...rows].sort((a, b) => a.umaban - b.umaban).map(e => ({ gate: e.gate, umaban: e.umaban, name: e.name, sled_weight: e.sled_weight, age: e.age, race_id: rid, horse_id: `${rid}-${String(e.umaban).padStart(2, '0')}`, recent_form: 0.3 })) }
  const top3 = rows.filter(e => e.finish >= 1 && e.finish <= 3).map(e => e.umaban).sort((a, b) => a - b)
  if (top3.length !== 3) continue
  const feats = extractFeatures(card)
  races.push({ rid, card, feats, key: top3.join('-'), payout: R.trio_payouts?.[rid]?.payout ?? null })
}
races.sort((a, b) => a.rid.localeCompare(b.rid))
const um = Object.fromEntries(races.flatMap(r => r.card.entries.map(e => [e.horse_id, e.umaban])))
function evalW(w, set) {
  let hit = 0, n = 0, pn = 0, ret = 0, phit = 0
  for (const r of set) {
    const preds = Object.entries(r.feats).map(([h, f]) => ({ horse_id: h, score: horseScore(f, w) })).sort((a, b) => b.score - a.score)
    const top = trioPredictions(preds).combos.slice(0, 3).map(c => c.horses.map(x => um[x.horse_id]).sort((a, b) => a - b).join('-'))
    const h = top.includes(r.key); n++; hit += h
    if (r.payout != null) { pn++; if (h) { phit++; ret += r.payout } }
  }
  return { races: n, hit_rate: +(hit / n).toFixed(4), payout_races: pn, payout_hits: phit, roi: pn ? +(ret / (pn * 300)).toFixed(3) : null }
}
const cut = Math.floor(races.length * 0.7), train = races.slice(0, cut), test = races.slice(cut)
const before = { ...DEFAULT_WEIGHTS, ...(LW.weights || {}) }
// 寄与分析: 各特徴量単独での的中率
const single = Object.fromEntries(FEATURES.map(f => [f, evalW(Object.fromEntries(FEATURES.map(g => [g, g === f ? 1 : 0])), train).hit_rate]))
// ランダム探索 + 座標微調整（trainで最適化、testで検証）
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
const norm = w => { const t = FEATURES.reduce((s, f) => s + w[f], 0) || 1; return Object.fromEntries(FEATURES.map(f => [f, w[f] / t])) }
const obj = w => evalW(w, train).hit_rate
let best = norm(before), bestS = obj(best)
for (let i = 0; i < 600; i++) { const w = norm(Object.fromEntries(FEATURES.map(f => [f, rnd() ** 2]))); const s = obj(w); if (s > bestS) { best = w; bestS = s } }
for (let it = 0; it < 3; it++) for (const f of FEATURES) for (const m of [0, 0.5, 1.5, 2.5]) { const w = norm({ ...best, [f]: best[f] * m + (m ? 0 : 0) }); const s = obj(w); if (s > bestS) { best = w; bestS = s } }
const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(4)]))
const out = { n_races: races.length, train: train.length, test: test.length, single_feature_hit_rate_train: single,
  before: { weights: round(before), all: evalW(before, races), train: evalW(before, train), test: evalW(before, test) },
  after: { weights: round(best), all: evalW(best, races), train: evalW(best, train), test: evalW(best, test) } }
console.log(JSON.stringify(out, null, 1))
if (process.argv.includes('--write')) {
  fs.writeFileSync(new URL('learned_weights.json', D), JSON.stringify({ ...LW, weights: round(best), previous_weights: round(before), tuning: { before: out.before, after: out.after }, tuned_at: new Date().toISOString() }, null, 1))
  console.error('wrote learned_weights.json')
}
