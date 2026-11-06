import { learnedPredict } from './learnScore.js'
import rules from './data/skip_rules.json' with { type: 'json' }
import { adjustedScore, forceAxisOrder, isMemrobo } from './memrobo.js'
// ban_ei_feedback.py の JS 移植。永続化は localStorage。
export const FEATURES = ['weight_pull', 'recent_form_3', 'recent_form_5', 'gate', 'jockey', 'time_index', 'sled_light', 'age_prime', 'body_mass', 'apprentice', 'prev_field_strength', 'prev_opp_quality', 'peer_form_3', 'track_moisture', 'moisture_form']
export const DEFAULT_WEIGHTS = { weight_pull: 0.4, recent_form_3: 0.22, recent_form_5: 0.13, gate: 0.05, jockey: 0.2, time_index: 0.1, sled_light: 0.08, age_prime: 0.05, body_mass: 0.06, apprentice: 0.03, prev_field_strength: 0.03, prev_opp_quality: 0.05, peer_form_3: 0.05, track_moisture: 0.02, moisture_form: 0.05 }
export const LEARNING_RATE = 0.05
import LEARNED from './data/learned_weights.json' with { type: 'json' }
import { prevFinish, recentForm, prevRaceContext, peerForm, moistureForm } from './prevFinish.js'
import { resolveMoisture, normMoisture } from './moisture.js'
export const KEEP_RACES = Infinity // 全レース保持（容量安全弁は storageGuard.js）
import { guardList, safeSet } from './storageGuard.js'
const K = { w: 'banma.weights', p: 'banma.predictions', r: 'banma.results', f: 'banma.feedback' }
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const store = (k, v) => safeSet(k, v)
const now = () => new Date().toISOString()

export function getWeights() {
  const w = load(K.w, null)
  if (!w) { const init = { ...DEFAULT_WEIGHTS, ...(LEARNED?.weights || {}) }; store(K.w, init); return init }
  if (FEATURES.some(f => w[f] == null) || 'recent_form' in w) { for (const f of FEATURES) w[f] ??= (LEARNED?.weights?.[f] ?? DEFAULT_WEIGHTS[f]); delete w.recent_form; store(K.w, w) }
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
  const sl = race.entries.map(e => e.sled_weight).filter(Boolean), sMin = Math.min(...sl), sMax = Math.max(...sl)
  const prev = Object.fromEntries(race.entries.map(e => [e.horse_id, prevFinish(e.name, race.race_id)]))
  const bws = Object.values(prev).map(q => q?.body_weight).filter(Boolean), bMin = Math.min(...bws), bMax = Math.max(...bws)
  const ageScore = a => a == null ? null : a <= 2 ? 0.3 : a === 3 ? 0.6 : a <= 6 ? 1 : Math.max(0.2, 1 - (a - 6) * 0.15)
  const mo = resolveMoisture(race), mN = normMoisture(mo.pct)
  for (const e of race.entries) {
    const q = prev[e.horse_id]
    const pull = (e.body_weight || 1000) / Math.max(e.sled_weight || 600, 1)
    out[e.horse_id] = {
      weight_pull: Math.min(pull / 2, 1),
      recent_form_3: recentForm(e.name, race.race_id, 3), // 直近3走の正規化着順平均（過去走なし=0.5）
      recent_form_5: recentForm(e.name, race.race_id, 5), // 直近5走の正規化着順平均（過去走なし=0.5）
      gate: 1 - (e.gate - 1) / n,
      jockey: jockeyRate(e.jockey),
      // 前走タイム指数(レース内偏差値)。取れない馬は null → スコア計算でスキップ
      time_index: (q => q?.time_index != null ? Math.max(0, Math.min(1, (q.time_index - 30) / 40)) : null)(q),
      sled_light: e.sled_weight && sMax > sMin ? (sMax - e.sled_weight) / (sMax - sMin) : null, // 相対的に軽いソリほど高い
      age_prime: ageScore(e.age ?? q?.age ?? null), // 4〜6歳が充実期
      body_mass: q?.body_weight && bws.length > 1 && bMax > bMin ? (q.body_weight - bMin) / (bMax - bMin) : null, // 前走馬体重（重い=牽引有利）
      apprentice: e.weight_reduction ? 1 : 0, // 減量騎手(☆等)
      ...(c => ({ prev_field_strength: c?.fieldStrength ?? 0.5, prev_opp_quality: c?.oppQuality ?? 0.5 }))(prevRaceContext(e.name, race.race_id)), // 前走なし/time_index無し=0.5
      peer_form_3: peerForm(e.name, race.race_id, e.sled_weight), // 同条件(ソリ重量±50kg)直近3走
      track_moisture: mN ?? 0.5, // 馬場水分 実測>気象推定>0.5。レース内全馬同値のため順位には影響しない
      moisture_form: moistureForm(e.name, race.race_id, mN), // 似た水分の過去走成績
    }
  }
  return out
}
// 欠損(null)の特徴量は除外し、残りの重みで総重み分に再スケール
export function horseScore(features, weights = getWeights()) {
  let s = 0, used = 0, all = 0
  for (const f of FEATURES) { all += weights[f] || 0; if (features[f] == null) continue; s += weights[f] * features[f]; used += weights[f] || 0 }
  return used ? s * all / used : 0
}
export function savePrediction(raceId, horseId, score, predRank, features = {}) {
  const ps = load(K.p, []); const id = (ps.at(-1)?.id || 0) + 1
  ps.push({ id, race_id: raceId, horse_id: horseId, score, pred_rank: predRank, features, status: 'pending', created_at: now() })
  store(K.p, ps); return id
}
// 予想: 学習モデル(learnScore.js, λ=0.92 時系列OLS)の着順スコアがあればそれで順位付け、無い日は従来の重み付きスコア。
//   legacy_score は従来式の値(結果入力時の重み更新は従来どおり features と pred_rank を使用)
export function predict(race, save = false) {
  const w = getWeights(), feats = extractFeatures(race), L = learnedPredict(race)
  const names = Object.fromEntries((race.entries || []).map(e => [e.horse_id, e.name]))
  const k = rules.streakPenaltyK ?? 0, pw = rules.pastFormBonusW ?? 0
  const raw = Object.entries(feats).map(([hid, f]) => {
    const lp = L?.byHorse[hid], legacy = horseScore(f, w)
    const base = lp ? Math.max(lp.finish_score, 0.001) : legacy
    const hs = lp?.horse_streak ?? 0
    const pf = lp?.past_form ?? 0.5
    const row = { horse_id: hid, name: names[hid] ?? null, score: base, horse_streak: hs, past_form: pf }
    const adj = adjustedScore(row, { k, w: pw, scoreKey: 'score' })
    return { hid, f, legacy, lp, base, adj, hs, pf, name: names[hid] ?? null }
  })
  // 調整スコア降順。メムロがいれば軸固定
  const ordered = forceAxisOrder(raw.map(q => ({ ...q, score: q.adj, horse_id: q.hid, name: q.name, horse_streak: q.hs, past_form: q.pf })), 'score')
  return ordered.map((q, i) => {
    const { hid, f, legacy, lp, base, adj, hs, pf, name } = raw.find(r => r.hid === q.hid)
    const score = +adj.toFixed(4)
    return {
      horse_id: hid, name, score, pred_rank: i + 1, features: f,
      legacy_score: +legacy.toFixed(4),
      finish_score: lp ? +lp.finish_score.toFixed(4) : null,
      raw_finish_score: lp ? +lp.finish_score.toFixed(4) : null,
      pred_time_sec: lp ? +lp.pred_time_sec.toFixed(1) : null,
      past_form: pf ?? null,
      horse_streak: hs,
      jockey_streak: lp?.jockey_streak ?? null,
      horse_win_rate_10: lp?.horse_win_rate_10 ?? null,
      jockey_win_rate_100: lp?.jockey_win_rate_100 ?? null,
      is_grade: lp?.is_grade ?? L?.is_grade ?? null,
      top_contribs: lp?.top_contribs ?? null,
      model: L ? { asOf: L.asOf, kind: L.kind, which: L.model, moist: L.moist, plus_hjz: !!rules.features?.plus_hjz, k, w: pw } : null,
      prediction_id: save ? savePrediction(race.race_id, hid, score, i + 1, f) : null,
    }
  })
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
    for (const f of FEATURES) {
      if (p.features[f] == null) continue
      w[f] = Math.max(0, (w[f] ?? DEFAULT_WEIGHTS[f]) + LEARNING_RATE * err * (p.features[f] || 0))
    }
    const tot = FEATURES.reduce((s, f) => s + w[f], 0) || 1
    for (const f of FEATURES) w[f] /= tot
    fb.push({ prediction_id: p.id, race_id: p.race_id, horse_id: p.horse_id, pred_rank: p.pred_rank, actual_finish: finish,
      error: err, hit_win: +(p.pred_rank === 1 && finish === 1), hit_place: +(p.pred_rank <= 3 && finish <= 3), created_at: now() })
    p.status = 'done'; details.push({ prediction_id: p.id, error: +err.toFixed(4), finish })
  }
  store(K.w, w); store(K.p, ps); store(K.f, fb); pruneHistory()
  return { race_id: race.race_id, updated: details.length, details, weights: w }
}
export function accuracyReport() {
  const fb = load(K.f, []), n = fb.length
  const top = fb.filter(x => x.pred_rank === 1).length, top3 = fb.filter(x => x.pred_rank <= 3).length
  return { n, mae: n ? +(fb.reduce((s, x) => s + Math.abs(x.error), 0) / n).toFixed(4) : 0,
    win_rate: top ? +(fb.reduce((s, x) => s + x.hit_win, 0) / top).toFixed(3) : null,
    place_rate: top3 ? +(fb.reduce((s, x) => s + x.hit_place, 0) / top3).toFixed(3) : null }
}
// 全レース保持。容量(~4.5MB)/件数(5000R)超過時のみ最古レースから間引く（重みは保持）
const bytes = k => (localStorage.getItem(k) || '').length * 2
export function pruneHistory() {
  store(K.p, guardList(load(K.p, []), x => x.race_id, bytes(K.p)))
  store(K.f, guardList(load(K.f, []), x => x.race_id, bytes(K.f)))
  const res = Object.entries(load(K.r, {})), kept = guardList(res, ([k]) => k.split('|')[0], bytes(K.r))
  store(K.r, Object.fromEntries(kept))
}
