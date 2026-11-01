// 予想と実着順のズレを分析し localStorage(banma.miss_log) に保存。次回予想時に警告として使う。
import { guardList, safeSet } from './storageGuard.js'
const KEY = 'banma.miss_log'
const LABEL = { weight_pull: '牽引力(ソリ重量比)', recent_form_3: '近走3走', recent_form_5: '近走5走', gate: '枠/馬番', jockey: '騎手' }
export const loadMissLog = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const bucket = h => ({
  age: h.age != null ? (h.age <= 3 ? '若駒(≤3)' : h.age >= 7 ? '高齢(≥7)' : '中堅') : null,
  sled: h.sled_weight != null ? (h.sled_weight >= 700 ? '重ソリ(≥700kg)' : h.sled_weight <= 550 ? '軽ソリ(≤550kg)' : '中ソリ') : null,
  gate: h.umaban != null ? (h.umaban <= 3 ? '内枠' : h.umaban >= 8 ? '外枠' : '中枠') : null,
  jockey: h.jockey || null,
})
export function analyzeMisses(race, preds, results) {
  const n = race.entries.length || 1, H = Object.fromEntries(race.entries.map(e => [e.horse_id, e]))
  const avg = {}; for (const p of preds) for (const [f, v] of Object.entries(p.features || {})) avg[f] = (avg[f] || 0) + v / preds.length
  const out = []
  for (const p of preds) {
    const fin = +results[p.horse_id]; if (!fin || Math.abs(fin - p.pred_rank) < 3) continue
    const h = H[p.horse_id] || {}, over = fin > p.pred_rank // 過大評価
    const deltas = Object.fromEntries(Object.entries(p.features || {}).map(([f, v]) => [f, +(v - (avg[f] || 0)).toFixed(3)]))
    const culprit = Object.entries(deltas).sort((a, b) => over ? b[1] - a[1] : a[1] - b[1])[0]?.[0]
    const b = bucket(h), conds = [b.age, b.sled, b.gate].filter(Boolean)
    const reason = `${h.name}: 予想${p.pred_rank}位→実際${fin}着（${over ? '過大評価' : '過小評価'}）。` +
      `${LABEL[culprit] || culprit}を${over ? '高く' : '低く'}見すぎた可能性。条件: ${conds.join('・')}${h.jockey ? '・' + h.jockey : ''}` +
      (race.track_moisture != null ? `・馬場水分${race.track_moisture}%` : '')
    out.push({ race_id: race.race_id, horse_id: p.horse_id, name: h.name, pred_rank: p.pred_rank, actual: fin,
      direction: over ? 'over' : 'under', culprit, deltas, buckets: b, moisture: race.track_moisture ?? null, reason, at: new Date().toISOString() })
  }
  const log = loadMissLog().filter(x => x.race_id !== race.race_id).concat(out)
  const trimmed = guardList(log, x => x.race_id, (localStorage.getItem(KEY) || '').length * 2) // 全レース保持＋容量安全弁
  safeSet(KEY, trimmed); return out
}
// 過去に同条件で2回以上外した馬へ警告
export function missWarnings(race, log = loadMissLog()) {
  const w = {}
  for (const h of race.entries) {
    const b = bucket(h), msgs = []
    for (const k of ['age', 'sled', 'gate', 'jockey']) {
      if (!b[k]) continue
      const hits = log.filter(x => x.buckets?.[k] === b[k])
      if (hits.length >= 2) { const over = hits.filter(x => x.direction === 'over').length
        msgs.push(`${b[k]}は過去${hits.length}回外れ（${over >= hits.length / 2 ? '過大評価' : '過小評価'}傾向）`) }
    }
    if (log.some(x => x.horse_id === h.horse_id)) msgs.push('この馬は過去に予想を外した')
    if (msgs.length) w[h.horse_id] = 'この条件の馬は過去に外しやすい: ' + msgs.join(' / ')
  }
  return w
}
