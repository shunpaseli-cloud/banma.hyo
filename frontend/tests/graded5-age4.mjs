import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
const sha = s => createHash('sha256').update(s).digest('hex')
const numeric = (v, p = '') => typeof v === 'number' ? [[p, v]] : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => numeric(x, p + '/' + k)) : []
const model = JSON.parse(await fs.readFile('src/data/learned_model.json'))
assert.ok(model.graded5_age4?.version === 'graded5-age4-v1')
assert.ok(model.card_score_age4?.version === 'card-score-age4-v1')
const { comment_style, confidence_method, card_score_age4, graded5_age4, ...predictive } = model
assert.equal(sha(JSON.stringify(predictive)), '877b650d3f340d403ad61667c415c8ee2f1967e76a928466ee31d4436edb55a5')
assert.equal(sha(JSON.stringify(numeric(predictive))), '3b20528d5641cf6e96eeac8df244afee7411c2c408ce873c55af409040b5f3b8')
const H = JSON.parse(await fs.readFile('src/data/graded_form_history_age4.json'))
assert.equal(H.history_through, model.graded5_age4.history_file.history_through)
assert.equal(sha(await fs.readFile('src/data/graded_form_history_age4.json')), model.graded5_age4.history_file.sha256)
assert.ok(H.history_through < model.graded5_age4.applies_to.effective_from_race_date)

const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) }
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true } })
try {
  const G = await server.ssrLoadModule('/src/gradedScoreAge4.js')
  const C = await server.ssrLoadModule('/src/cardScoreAge4.js')
  const { buildSelection } = await server.ssrLoadModule('/src/boxSelection.js')
  const { buildRaceRecommendation } = await server.ssrLoadModule('/src/selectionReason.js')
  assert.equal(G.isGradedRace({ name: '第47回北見記念(BG2)' }), true)
  assert.equal(G.isGradedRace({ name: '帯広記念', grade: 'BG1' }), true)
  assert.equal(G.isGradedRace({ name: '一般 B4-1' }), false)
  assert.equal(G.isGradedRace({ name: '第12回朱雀賞(準重賞)' }), false)

  const races = JSON.parse(await fs.readFile('src/data/races_from_pdf.json'))
  for (const race of races) {
    const g = G.gradedCombineBox(race)
    if (G.isGradedRace(race)) assert.equal(g.reason, 'before_effective_date', race.race_id)
    else assert.equal(g.reason, 'not_graded', race.race_id)
  }
  // saved snapshot: buildSelection identical to pre-change path for old dates
  const snap = JSON.parse(await fs.readFile('src/data/prediction_snapshot.json'))
  const byId = new Map(races.map(r => [r.race_id, r]))
  for (const row of snap.races) {
    const race = { ...byId.get(row.race_id), track_moisture: row.selection_meta.track_moisture }
    const old = buildRaceRecommendation(race, row.predictions)
    const now = buildSelection(race, row.predictions, { laterCards: races })
    assert.deepEqual(now, old, 'saved date unchanged ' + row.race_id)
  }
  // future pure_O non-graded still card_score; future graded uses combined when eligible
  let nCard = 0, nComb = 0, n29 = 0
  for (const row of snap.races) {
    const race = { ...byId.get(row.race_id), race_date: '2026-11-14', track_moisture: row.selection_meta.track_moisture }
    const fut = buildSelection(race, row.predictions, { laterCards: races })
    const base = buildRaceRecommendation(race, row.predictions)
    assert.equal(fut.recommended, base.recommended)
    assert.equal(fut.confidence, base.confidence)
    assert.equal(fut.selection_meta.gate_skip, base.selection_meta.gate_skip)
    if (fut.selection_meta.box_method === 'graded5_card_combined' || fut.selection_meta.box_method === 'card_score_age4') {
      assert.equal(fut.selection_meta.confidence_axis.horse_id, base.selection_meta.axis.horse_id)
    }
    if (fut.selection_meta.box_method === 'graded5_card_combined') nComb++
    else if (fut.selection_meta.box_method === 'card_score_age4') nCard++
    else n29++
  }
  // counterfactual: force a graded name on a pure_O future race
  const pure = races.find(r => C.ageType(r) === 'pure_O' && C.parseClass(r.name).ctype)
  assert.ok(pure)
  const gr = { ...pure, race_date: '2026-11-14', name: pure.name + '(BG2)' }
  const gbox = G.gradedCombineBox(gr, { laterCards: races })
  assert.equal(gbox.eligible, true, gbox.reason)
  assert.equal(gbox.box.length, 3)
  const sel = buildSelection(gr, snap.races.find(r => r.race_id === pure.race_id).predictions, { laterCards: races })
  assert.equal(sel.selection_meta.box_method, 'graded5_card_combined')
  assert.equal((sel.selection_meta.confidence_axis||sel.selection_meta.axis).horse_id, buildRaceRecommendation(gr, snap.races.find(r => r.race_id === pure.race_id).predictions).selection_meta.axis.horse_id)
  console.log(JSON.stringify({ nCard, nComb, n29, graded_box: gbox.box.map(h => h.umaban), graded_version: G.GRADED.version }))
} finally { await server.close() }
console.log('graded5-age4 ok')
