// 本番の学習スコア: learned_model.json(オフライン学習)を起動時に読み込み、レース日 D に対し
//   D に開催結果がある日 → snapshots[D]（D より前の日だけで学習したモデル）
//   D が最終結果日より後 → final（同梱結果の全日で学習）
//   それ以外(ウォームアップ期間) → null（従来スコアにフォールバック）
import MODEL from './data/learned_model.json' with { type: 'json' }
import { featureVec, applyModel, dateOf, finScore } from './learnCore.js'
import { prevFinish, priorFinishes } from './prevFinish.js'
const cards = Object.values(import.meta.glob ? import.meta.glob('./data/past/*.json', { eager: true, import: 'default' }) : {}).flatMap(d => d.races || d)
export { MODEL }
export function modelFor(date) {
  if (MODEL.snapshots[date]) return { m: MODEL.snapshots[date], asOf: date, kind: 'snapshot' }
  if (date > MODEL.last_result_date) return { m: MODEL.final, asOf: MODEL.last_result_date, kind: 'final' }
  return null
}
const jockeyCount = (jk, rid) => jk ? cards.reduce((s, r) => s + (r.race_id < rid ? (r.entries || []).filter(e => e.jockey === jk).length : 0), 0) : 0
// 各馬 { horse_id: { finish_score, pred_time_sec } }。モデルが無い日は null
export function learnedPredict(race) {
  const date = race.race_date || dateOf(race.race_id), mm = modelFor(date); if (!mm) return null
  const n = race.entries.length, out = {}
  for (const e of race.entries) {
    const hist = priorFinishes(e.name, race.race_id, 1e9).map(x => finScore(x.finish, x.field)).reverse()
    const ee = { ...e, body_weight: e.body_weight ?? prevFinish(e.name, race.race_id)?.body_weight } // 出走表に馬体重が無い時は前走値
    const x = featureVec(ee, race.race_id, n, { jockeyCount: jockeyCount(e.jockey, race.race_id), hist })
    out[e.horse_id] = { finish_score: applyModel(mm.m.finish, x), pred_time_sec: applyModel(mm.m.time, x), past_form: hist.length ? x[12] : null }
  }
  return { byHorse: out, asOf: mm.asOf, kind: mm.kind }
}
export const fmtTime = s => s == null || !isFinite(s) ? '—' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`
