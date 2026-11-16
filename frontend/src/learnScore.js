// 本番の学習スコア: learned_model.json(オフライン学習)を起動時に読み込み、レース日 D に対し
//   D に開催結果がある日 → snapshots[D]（D より前の日だけで学習したモデル）
//   D が最終結果日より後 → final（同梱結果の全日で学習）
//   それ以外(ウォームアップ期間) → null（従来スコアにフォールバック）
// plus_hjz: horse/jockey win streak・rate と is_grade を特徴に含む（29列）
import MODEL from './data/learned_model.json' with { type: 'json' }
import RAIN from './data/learned_model_rain.json' with { type: 'json' }
import GRADE from './data/grade_races.json' with { type: 'json' }
import { estimateMoisture } from './moisture.js'
import { featureVec, applyModel, featureContribs, dateOf, finScore, histEntry, isGradeRace, winStreak, winRate } from './learnCore.js'
import { prevFinish, priorFinishes } from './prevFinish.js'
const cards = Object.values(import.meta.glob ? import.meta.glob('./data/past/*.json', { eager: true, import: 'default' }) : {}).flatMap(d => d.races || d)
export { MODEL, RAIN, GRADE }
export const RAIN_TH = RAIN.moisture_threshold
export function modelFor(date, moist) {
  const mo = moist ?? estimateMoisture(date) ?? 1.6
  if (mo >= RAIN_TH) { if (RAIN.snapshots[date]) return { m: RAIN.snapshots[date], asOf: date, kind: 'snapshot', model: 'rain', moist: mo }
    if (date > RAIN.last_result_date) return { m: RAIN.final, asOf: RAIN.last_result_date, kind: 'final', model: 'rain', moist: mo } }
  if (MODEL.snapshots[date]) return { m: MODEL.snapshots[date], asOf: date, kind: 'snapshot', model: 'normal', moist: mo }
  if (date > MODEL.last_result_date) return { m: MODEL.final, asOf: MODEL.last_result_date, kind: 'final', model: 'normal', moist: mo }
  return null
}
const JK = {}; const nameOf = {}
for (const r of cards) {
  if (r.race_id) nameOf[r.race_id] = r.name
  for (const e of r.entries || []) JK[`${e.race_id || r.race_id}|${e.name}`] = e.jockey
}
const jockeyCount = (jk, rid) => jk ? cards.reduce((s, r) => s + (r.race_id < rid ? (r.entries || []).filter(e => e.jockey === jk).length : 0), 0) : 0
/** 当該レースより前の騎手勝敗フラグ(1/0)を古い順で */
function jockeyWinsBefore(jk, rid) {
  if (!jk) return []
  const out = []
  for (const r of cards) {
    if (!r.race_id || r.race_id >= rid) continue
    for (const e of r.entries || []) {
      if (e.jockey === jk && Number.isInteger(e.finish)) out.push(e.finish === 1 ? 1 : 0)
    }
  }
  return out
}
export function learnedPredict(race) {
  const date = race.race_date || dateOf(race.race_id), mm = modelFor(date, race.track_moisture != null ? +race.track_moisture : undefined); if (!mm) return null
  const n = race.entries.length, out = {}
  const g = isGradeRace(race.race_id, race.name || nameOf[race.race_id], GRADE)
  for (const e of race.entries) {
    const hist = priorFinishes(e.name, race.race_id, 1e9).map(x => histEntry(finScore(x.finish, x.field), JK[`${x.rid}|${e.name}`], x.rid, x.sled_weight)).reverse()
    const ee = { ...e, body_weight: e.body_weight ?? prevFinish(e.name, race.race_id)?.body_weight }
    const jw = jockeyWinsBefore(e.jockey, race.race_id)
    const x = featureVec(ee, race.race_id, n, { jockeyCount: jockeyCount(e.jockey, race.race_id), jockey: e.jockey, hist, jockeyWins: jw, isGrade: g })
    const hw = hist.map(q => q.y === 1)
    const finish = applyModel(mm.m.finish, x)
    const top = featureContribs(mm.m.finish, x).filter(c => c.contrib > 0).slice(0, 5)
      .map(c => ({ name: c.name, contrib: +c.contrib.toFixed(4), value: +(+c.value).toFixed(4) }))
    out[e.horse_id] = {
      finish_score: finish,
      pred_time_sec: applyModel(mm.m.time, x),
      past_form: hist.length ? x[12] : null,
      horse_streak: winStreak(hw),
      horse_win_rate_10: winRate(hw, 10),
      jockey_streak: winStreak(jw),
      jockey_win_rate_100: winRate(jw, 100),
      is_grade: g,
      top_contribs: top,
    }
  }
  return { byHorse: out, asOf: mm.asOf, kind: mm.kind, model: mm.model, moist: mm.moist, is_grade: g }
}
export const fmtTime = s => s == null || !isFinite(s) ? '—' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
