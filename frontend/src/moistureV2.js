// 馬場水分 v2（2段階）。learned_model.json とは独立した設定 moisture_model_v2.json を読むだけ。
//  stage1 = 前開催日最終Rの公式水分(持ち越し)+気象+レース番号drift − 季節の点時点バイアス補正
//  stage2 = 1Rの公式水分が2R発走前に出たら 2R以降を (1R実測 − stage1の1R) だけずらす
//  値そのものは routine(scripts/moisture_v2.py) が moisture_prediction_log.json の races[*].v2 に追記保存する。
//  ここは「保存済みの値を予想エンジンへ渡す」ことと、同じ式の再現(検証用)だけを行う。
import CONFIG from './data/moisture_model_v2.json' with { type: 'json' }
export const MOISTURE_V2 = CONFIG
export const round01 = v => Math.floor(Math.max(0.5, Math.min(8, v)) * 10 + 0.5) / 10
const WINTER = [11, 12, 1, 2], SUMMER = [7, 8]
export const seasonGroup = date => { const m = +date.slice(5, 7); return WINTER.includes(m) ? 'winter_11_2' : SUMMER.includes(m) ? 'summer_7_8' : 'other' }
export function stage1Raw(f, raceNo, date, cfg = CONFIG) {
  const x = { ...f, race_k: raceNo - 1, race_k_x_P0: (raceNo - 1) * f.P0 }
  const v = cfg.coefficients[0] + cfg.features.reduce((s, k, i) => s + cfg.coefficients[i + 1] * x[k], 0)
  return v - (cfg.season_correction.enabled ? (cfg.season_correction.values[seasonGroup(date)] ?? 0) : 0)
}
export function stage2Values(stage1RawByRace, anchor) {
  const shift = anchor - stage1RawByRace[1], out = {}
  for (const [k, v] of Object.entries(stage1RawByRace)) if (+k >= 2) out[k] = { raw: v + shift, value: round01(v + shift) }
  return { shift, values: out }
}
const before = (a, b) => Date.parse(a) < Date.parse(b)
// moisture_prediction_log.json → { race_id: {value, stage, saved_at, model_version, fallback} }。発走前に保存された値だけ。
export function effectiveV2Map(log, raceIds = null) {
  const out = {}
  for (const [id, row] of Object.entries(log?.races || {})) {
    if (raceIds && !raceIds.has(id)) continue
    const v2 = row?.v2, e = v2?.effective
    if (!e || e.value == null) continue
    const st = e.stage === 'stage2' ? v2.stage2 : v2.stage1
    if (!st?.saved_at || !row.scheduled_start_at || !before(st.saved_at, row.scheduled_start_at)) continue
    if (v2.model_version !== CONFIG.version && st.model_version !== CONFIG.version) continue
    out[id] = { value: +e.value, stage: e.stage, saved_at: st.saved_at, model_version: st.model_version, fallback: !!e.fallback }
  }
  return out
}
export const v2Fingerprint = map => JSON.stringify(Object.keys(map || {}).sort().map(k => [k, map[k].value, map[k].stage, map[k].saved_at]))
export const MOISTURE_V2_LABEL = { stage1: '朝予測(v2)', stage2: '1R補正(v2)', stage1_v1_fallback: '朝予測(v1代替)' }
