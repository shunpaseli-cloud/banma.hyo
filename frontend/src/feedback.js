// ban_ei_feedback.py の JS 移植。永続化は localStorage。
export const FEATURES = ['weight_pull', 'recent_form', 'gate', 'jockey']
export const DEFAULT_WEIGHTS = { weight_pull: 0.4, recent_form: 0.35, gate: 0.05, jockey: 0.2 }
export const LEARNING_RATE = 0.05
const K = { w: 'banma.weights', p: 'banma.predictions', r: 'banma.results', f: 'banma.feedback' }
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const store = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const now = () => new Date().toISOString()

export function getWeights() {
  const w = load(K.w, null)
  if (!w) { store(K.w, DEFAULT_WEIGHTS); return { ...DEFAULT_WEIGHTS } }
  return w
}
export function resetModel() { Object.values(K).forEach(k => localStorage.removeItem(k)) }

function jockeyRate(jockey) {
  const res = load(K.r, {}); let n = 0, w = 0
  for (const [key, fin] of Object.entries(res)) if (key.split('|')[2] === jockey) { n++; if (fin === 1) w++ }
  return (w + 1) / (n + 5) // ラプラス平滑化
}
export function extractFeatures(race) {
  const n = Math.max(race.entries.length, 1), out = {}
  for (const e of race.entries) {
    const pull = (e.body_weight || 1000) / Math.max(e.sled_weight || 600, 1)
    out[e.horse_id] = {
      weight_pull: Math.min(pull / 2, 1),
      recent_form: e.recent_form ?? 0.5,
      gate: 1 - (e.gate - 1) / n,
      jockey: jockeyRate(e.jockey),
    }
  }
  return out
}
export function horseScore(features, weights = getWeights()) {
  return FEATURES.reduce((s, f) => s + weights[f] * (features[f] || 0), 0)
}
export function savePrediction(raceId, horseId, score, predRank, features = {}) {
  const ps = load(K.p, []); const id = (ps.at(-1)?.id || 0) + 1
  ps.push({ id, race_id: raceId, horse_id: horseId, score, pred_rank: predRank, features, status: 'pending', created_at: now() })
  store(K.p, ps); return id
}
export function predict(race, save = false) {
  const w = getWeights(), feats = extractFeatures(race)
  return Object.entries(feats).map(([hid, f]) => ({ hid, f, s: horseScore(f, w) }))
    .sort((a, b) => b.s - a.s)
    .map(({ hid, f, s }, i) => ({ horse_id: hid, score: +s.toFixed(4), pred_rank: i + 1, features: f,
      prediction_id: save ? savePrediction(race.race_id, hid, s, i + 1, f) : null }))
}
// results: {horse_id: finish}
export function updateWithResult(race, results) {
  const res = load(K.r, {})
  for (const e of race.entries) if (results[e.horse_id]) res[`${race.race_id}|${e.horse_id}|${e.jockey}`] = +results[e.horse_id]
  store(K.r, res)
  const ps = load(K.p, []), fb = load(K.f, []), field = race.entries.length || 1, details = []
  let w = getWeights()
  for (const p of ps) {
    if (p.race_id !== race.race_id || p.status !== 'pending') continue
    const finish = +results[p.horse_id]; if (!finish) continue
    const d = Math.max(field - 1, 1)
    const err = (1 - (finish - 1) / d) - (1 - (p.pred_rank - 1) / d)
    for (const f of FEATURES) w[f] = Math.max(0, w[f] + LEARNING_RATE * err * (p.features[f] || 0))
    const tot = FEATURES.reduce((s, f) => s + w[f], 0) || 1
    for (const f of FEATURES) w[f] /= tot
    fb.push({ prediction_id: p.id, race_id: p.race_id, horse_id: p.horse_id, pred_rank: p.pred_rank, actual_finish: finish,
      error: err, hit_win: +(p.pred_rank === 1 && finish === 1), hit_place: +(p.pred_rank <= 3 && finish <= 3), created_at: now() })
    p.status = 'done'; details.push({ prediction_id: p.id, error: +err.toFixed(4), finish })
  }
  store(K.w, w); store(K.p, ps); store(K.f, fb)
  return { race_id: race.race_id, updated: details.length, details, weights: w }
}
export function accuracyReport() {
  const fb = load(K.f, []), n = fb.length
  const top = fb.filter(x => x.pred_rank === 1).length, top3 = fb.filter(x => x.pred_rank <= 3).length
  return { n, mae: n ? +(fb.reduce((s, x) => s + Math.abs(x.error), 0) / n).toFixed(4) : 0,
    win_rate: top ? +(fb.reduce((s, x) => s + x.hit_win, 0) / top).toFixed(3) : null,
    place_rate: top3 ? +(fb.reduce((s, x) => s + x.hit_place, 0) / top3).toFixed(3) : null }
}
