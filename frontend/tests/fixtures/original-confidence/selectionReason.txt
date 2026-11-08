// 推奨レースの選定理由（日本語プロズ + confidence + UI用メタ）。オッズ・人気は使わない。
import rules from './data/skip_rules.json' with { type: 'json' }
import bands from './data/confidence_bands.json' with { type: 'json' }
import { axisGate, rankedPreds, trifectaBox3 } from './trio.js'
import { isMemrobo, findMemrobo } from './memrobo.js'
import { FEATURE_NAMES } from './learnCore.js'
import { resolveMoisture } from './moisture.js'

const FEATURE_JP = {
  est_moist: '推定馬場水分', sled_weight: 'ソリ荷重', body_weight: '馬体重', age: '年齢',
  sex_male: '牡馬', sex_gelding: 'せん馬', field: '頭数', race_no: 'レース番号',
  gate: '枠番', umaban: '馬番', jockey_count: '騎手出走数', horse_starts: '馬出走数',
  horse_prev_fin_mean: '過去着順平均', moist_x_body: '水分×馬体重', moist_x_sled: '水分×ソリ',
  body_x_sled: '馬体重×ソリ', last5_fin_std: '直近5走着順ばらつき', last5_fin_mean: '直近5走着順平均',
  same_jockey_n: '同一騎手回数', same_jockey_fin_mean: '同一騎手着順平均',
  same_moist_bucket_n: '同水分帯出走数', same_moist_bucket_fin_mean: '同水分帯着順平均',
  sled_change_prev: '前走からのソリ変更', sled_change_vs_last3mean: '直近3走平均とのソリ差',
  horse_win_streak: '馬連勝', horse_win_rate_10: '馬勝率(直近10)', jockey_win_streak: '騎手連勝',
  jockey_win_rate_100: '騎手勝率(直近100)', is_grade: '重賞フラグ',
}

function umabanOf(race, p) {
  const e = (race.entries || []).find(x => x.horse_id === p.horse_id)
  return e?.umaban ?? e?.gate ?? '?'
}

function nameOf(race, p) {
  const e = (race.entries || []).find(x => x.horse_id === p.horse_id)
  return e?.name || p.name || '?'
}

function fmtPf(v) {
  return v == null || Number.isNaN(+v) ? '不明' : (+v).toFixed(3)
}

function scoreLine(race, preds, n = 3) {
  return rankedPreds(preds).slice(0, n).map((p, i) => {
    const um = umabanOf(race, p)
    const nm = nameOf(race, p)
    const pf = fmtPf(p.past_form)
    return `${i + 1}位 ${um}番${nm}（スコア${(+p.score).toFixed(3)}・past_form ${pf}）`
  }).join('、')
}

function contribPhrase(p) {
  const tops = (p?.top_contribs || []).slice(0, 3)
  if (!tops.length) return '学習モデル寄与の内訳は未取得'
  return tops.map(c => `${FEATURE_JP[c.name] || c.name}+${(+c.contrib).toFixed(3)}`).join('、')
}

export function pfBand(pf) {
  if (pf == null || Number.isNaN(+pf)) return 'unk'
  const v = +pf
  if (v < 0.65) return 'lt065'
  if (v < 0.70) return '065_070'
  if (v < 0.80) return '070_080'
  return '080_plus'
}

export function fieldBand(n) {
  if (n <= 8) return 'le8'
  if (n === 9) return 'eq9'
  return 'ge10'
}

export function moistBand(m) {
  if (m == null || Number.isNaN(+m)) return 'unk'
  const v = +m
  if (v < 1.5) return 'dry'
  if (v < 1.8) return 'mid'
  if (v < 3.0) return 'wet'
  return 'heavy'
}

export function gradeBand(isGrade) {
  return isGrade ? 'grade' : 'normal'
}

/**
 * Lookup confidence (0–1) from historical similar-condition bands.
 * Backoff: joint → coarse → pf_only → baseline.
 */
export function lookupConfidence({ pf, field, moist, isGrade }) {
  const pb = pfBand(pf)
  const fb = fieldBand(field)
  const mb = moistBand(moist)
  const gb = gradeBand(!!isGrade)
  const jointKey = `${pb}|${fb}|${mb}|${gb}`
  const coarseKey = `${pb}|${fb}|${gb}`

  const tryGet = (table, key) => {
    const row = table?.[key]
    if (!row || row.N == null || row.N <= 0 || row.confidence == null) return null
    return { confidence: +row.confidence, source: key, stats: { N: row.N, hit_pct: row.hit_pct, ROI_pct: row.ROI_pct } }
  }

  return (
    tryGet(bands.joint, jointKey) ||
    tryGet(bands.coarse, coarseKey) ||
    tryGet(bands.pf_only, pb) ||
    {
      confidence: +(bands.baseline?.confidence ?? 0.45),
      source: 'baseline',
      stats: {
        N: bands.baseline?.N ?? 0,
        hit_pct: bands.baseline?.hit_pct ?? null,
        ROI_pct: bands.baseline?.ROI_pct ?? null,
      },
    }
  )
}

function confLabel(c) {
  if (c >= 0.75) return '高'
  if (c >= 0.55) return '中'
  if (c >= 0.40) return 'やや低'
  return '低'
}

/**
 * @returns {{
 *   recommended: boolean,
 *   confidence: number,
 *   selection_comment: string,
 *   selection_meta: object
 * }}
 */
export function buildRaceRecommendation(race, preds, r = rules) {
  const gate = axisGate(preds, r)
  const ordered = rankedPreds(preds || [])
  const ax = ordered[0] || null
  const thr = r.pastFormThreshold ?? 0.65
  const k = r.streakPenaltyK ?? 0
  const boxIdx = r.ticket?.boxIdx || [0, 1, 2]
  const field = race.entries?.length || 0
  const isGrade = !!(ax?.is_grade || ordered.some(p => p.is_grade) || /ＢＧ|BG|重賞/.test(race.name || ''))
  const memrobo = !!(findMemrobo(preds) || findMemrobo(race.entries) || (ax && isMemrobo(ax)))
  const recommended = !gate.skip
  const boxHorses = trifectaBox3(preds, boxIdx).length
    ? boxIdx.map(i => ordered[i]).filter(Boolean).map(p => `${umabanOf(race, p)}番${nameOf(race, p)}`)
    : []
  const pf = ax?.past_form
  const pfOk = memrobo || (pf != null && pf >= thr)
  const moist = race.track_moisture ?? race.track_moisture_est ?? resolveMoisture(race)?.pct ?? null

  const confInfo = lookupConfidence({ pf: pf ?? 0.5, field, moist, isGrade })
  // 見送りは自信度を下げて表示（購入しないため）
  let confidence = confInfo.confidence
  if (!recommended) confidence = Math.min(confidence, 0.25)
  if (memrobo) confidence = Math.min(0.95, confidence + 0.05) // 特例で推奨に含めるが過信しない

  const parts = []
  if (recommended) {
    parts.push(`【推奨】軸の past_form が閾値 ${thr} 以上（またはメムロ特例）のため、本番構成（${r.ticket?.label || '三連単三頭ボックス'}・BOX${boxIdx.map(i => i + 1).join('')}・pf≥${thr}・k=${k}${r.features?.plus_hjz ? '・plus_hjz' : ''}）で購入対象。`)
  } else {
    parts.push(`【見送り】${gate.reason || `軸 past_form ${fmtPf(pf)} < ${thr}`}。買い目は参考表示のみ。`)
  }

  if (ax) {
    const um = umabanOf(race, ax)
    const nm = nameOf(race, ax)
    parts.push(`軸は ${um}番${nm}（モデル1位・スコア ${(+ax.score).toFixed(3)}・past_form ${fmtPf(pf)}${pfOk ? `≥${thr}` : `<${thr}`}）。`)
    if (ax.horse_streak) parts.push(`軸の馬連勝 ${ax.horse_streak}（k=${k} の連勝ペナルティ適用${memrobo ? 'なし・メムロ免除' : ''}）。`)
    if (ax.jockey_streak) parts.push(`騎手連勝 ${ax.jockey_streak}。`)
  } else {
    parts.push('軸候補を特定できませんでした。')
  }

  if (memrobo) {
    parts.push('メムロボブサップ出走のため軸固定・連勝ペナルティ免除で推奨に含める。')
  }

  parts.push(`出走 ${field} 頭${isGrade ? '・重賞（BG等）扱い' : '・一般'}。${race.name ? `レース名「${race.name}」。` : ''}`)
  if (moist != null) parts.push(`馬場水分 ${(+moist).toFixed(1)}%（帯=${moistBand(moist)}）。`)
  if (ordered.length >= 3) {
    parts.push(`上位3頭: ${scoreLine(race, ordered, 3)}。`)
  }
  if (boxHorses.length === 3) {
    parts.push(`主買い目は三連単三頭ボックス6点（${boxHorses.join('−')}の全順列）。`)
  }
  if (ax) {
    parts.push(`軸スコアへの主な正寄与: ${contribPhrase(ax)}。`)
  }

  const st = confInfo.stats || {}
  parts.push(
    `自信度 ${confidence.toFixed(2)}（${confLabel(confidence)}）。` +
    `類似条件（pf帯=${pfBand(pf)}・頭数帯=${fieldBand(field)}・水分帯=${moistBand(moist)}・${gradeBand(isGrade)}／照合=${confInfo.source}）の過去実績は` +
    (st.N ? `N=${st.N}・的中率${st.hit_pct}%・回収率${st.ROI_pct}%` : 'サンプル不足のためベースライン') +
    '。選定はオッズ・人気を使わず、学習着順スコアと past_form ゲートのみ。',
  )

  const selection_comment = parts.join(' ')
  const selection_meta = {
    recommended,
    confidence,
    confidence_label: confLabel(confidence),
    confidence_source: confInfo.source,
    confidence_stats: st,
    confidence_bands: {
      pf: pfBand(pf),
      field: fieldBand(field),
      moist: moistBand(moist),
      grade: gradeBand(isGrade),
    },
    race_id: race.race_id,
    race_date: race.race_date,
    race_no: race.race_no,
    race_name: race.name || null,
    field_size: field,
    track_moisture: moist,
    is_grade: isGrade,
    memrobo_axis: memrobo,
    past_form_threshold: thr,
    streak_penalty_k: k,
    box_idx: boxIdx,
    ticket_label: r.ticket?.label || '三連単三頭ボックス6点',
    plus_hjz: !!r.features?.plus_hjz,
    gate_skip: !!gate.skip,
    gate_reason: gate.reason || null,
    axis: ax ? {
      horse_id: ax.horse_id,
      umaban: umabanOf(race, ax),
      name: nameOf(race, ax),
      score: +(+ax.score).toFixed(4),
      finish_score: ax.finish_score != null ? +(+ax.finish_score).toFixed(4) : null,
      past_form: pf == null ? null : +(+pf).toFixed(4),
      past_form_ok: pfOk,
      horse_streak: ax.horse_streak ?? 0,
      jockey_streak: ax.jockey_streak ?? null,
      top_contribs: (ax.top_contribs || []).slice(0, 5),
    } : null,
    top3: ordered.slice(0, 3).map(p => ({
      umaban: umabanOf(race, p),
      name: nameOf(race, p),
      score: +(+p.score).toFixed(4),
      past_form: p.past_form == null ? null : +(+p.past_form).toFixed(4),
    })),
    box_horses: boxHorses,
    feature_names: FEATURE_NAMES,
  }
  return { recommended, confidence, selection_comment, selection_meta }
}

export { FEATURE_JP }
