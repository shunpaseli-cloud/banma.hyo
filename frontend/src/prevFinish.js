import R from './data/results_from_pdf.json' with { type: 'json' }
// name -> [{date, raceNo, finish, field}] sorted desc by race_id
const idx = {}
for (const [rid, rows] of Object.entries(R.races || {})) {
  for (const r of rows || []) {
    if (!r.name) continue
    ;(idx[r.name] ||= []).push({ rid, date: `${rid.slice(0,4)}-${rid.slice(4,6)}-${rid.slice(6,8)}`, raceNo: +rid.split('-R')[1], finish: r.finish, time: r.time, time_index: r.time_index, age: r.age, sex: r.sex, body_weight: r.body_weight, sled_weight: r.sled_weight, field: rows.length })
  }
}
for (const k in idx) idx[k].sort((a, b) => (a.rid < b.rid ? 1 : -1))
export function prevFinish(name, raceId) {
  const l = idx[name]; if (!l) return null
  return l.find(x => x.rid < raceId) || null
}
// raceId より前(rid < raceId)の過去走を新しい順に最大 n 件
export function priorFinishes(name, raceId, n = 5) {
  const l = idx[name]; if (!l) return []
  return l.filter(x => x.rid < raceId && x.finish >= 1 && x.field >= 1).slice(0, n)
}
// 近走スコア: 各走 score_i = 1 - (finish - 1) / max(field - 1, 1)（1着=1.0, 最下位≈0）
// 直近最大 n 走の score_i の単純平均。過去走が1〜(n-1)走なら使える分だけで平均、0走なら 0.5
export function recentForm(name, raceId, n) {
  const p = priorFinishes(name, raceId, n)
  if (!p.length) return 0.5
  return p.reduce((s, x) => s + Math.max(0, 1 - (x.finish - 1) / Math.max(x.field - 1, 1)), 0) / p.length
}
// 前走のレース文脈。対戦相手行は results_from_pdf.json の R.races[prev.rid] から自馬以外を取得
// 注: データに距離・クラス帯フィールドは無い（ばんえいは距離固定）
const tiN = v => Math.max(0, Math.min(1, (v - 30) / 40))
export function prevRaceContext(name, raceId) {
  const prev = prevFinish(name, raceId); if (!prev) return null
  const oppRows = (R.races[prev.rid] || []).filter(r => r.name !== name)
  const tis = oppRows.map(r => r.time_index).filter(v => v != null)
  const oppMeanTimeIndex = tis.length ? tis.reduce((a, b) => a + b, 0) / tis.length : null
  return { prev, field: prev.field, oppRows, oppMeanTimeIndex,
    // 前走頭数の強さ代理: clamp((field-1)/9, 0, 1)（最大10頭想定）
    fieldStrength: Math.max(0, Math.min(1, (prev.field - 1) / 9)),
    // 対戦馬の質: clamp((対戦馬 time_index 平均 - 30)/40, 0, 1)。time_index 無しなら null
    oppQuality: oppMeanTimeIndex == null ? null : tiN(oppMeanTimeIndex) }
}
// 同条件成績: クラス情報が無いため、今回の sled_weight ±50kg の過去走を「同条件」の代理とする。
// 該当過去走の直近最大3走で score_i = 1-(finish-1)/max(field-1,1) を平均。該当なし/今回ソリ重量不明 → 0.5
export function peerForm(name, raceId, sled, n = 3) {
  if (sled == null) return 0.5
  const p = priorFinishes(name, raceId, 1e9).filter(x => x.sled_weight != null && Math.abs(x.sled_weight - sled) <= 50).slice(0, n)
  if (!p.length) return 0.5
  return p.reduce((s, x) => s + Math.max(0, 1 - (x.finish - 1) / Math.max(x.field - 1, 1)), 0) / p.length
}
// 水分適性: 今回の馬場水分(正規化)と ±0.15 以内の推定/実測水分だった過去走の直近最大3走の正規化着順平均。
// 過去走の水分は気象推定(estimateMoisture)。該当なし/今回水分不明 → 0.5
import { estimateMoisture, normMoisture } from './moisture.js'
export function moistureForm(name, raceId, mNorm, n = 3) {
  if (mNorm == null) return 0.5
  const p = priorFinishes(name, raceId, 1e9).filter(x => { const m = normMoisture(estimateMoisture(x.date)); return m != null && Math.abs(m - mNorm) <= 0.15 }).slice(0, n)
  if (!p.length) return 0.5
  return p.reduce((s, x) => s + Math.max(0, 1 - (x.finish - 1) / Math.max(x.field - 1, 1)), 0) / p.length
}
