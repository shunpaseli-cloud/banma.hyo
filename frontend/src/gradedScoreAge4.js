// 重賞×4歳以上: 直近フォームのロジスティック(top3)と出走表スコアを等重み合成してBOX選定（graded5-age4-v1, t279u）。
// 点数・購入/見送り・自信度には使わない。非重賞の pure_O は card_score_age4 のみ（本モジュールは重賞判定時のみ呼ばれる）。
import MODEL from './data/learned_model.json' with { type: 'json' }
import HISTORY from './data/graded_form_history_age4.json' with { type: 'json' }
import GRADE from './data/grade_races.json' with { type: 'json' }
import { ageType, isScratched, cardFeatures, utilities, parseClass, CARD } from './cardScoreAge4.js'
import { isMemrobo } from './memrobo.js'

export const GRADED = MODEL.graded5_age4
const DAY = 86400000
const days = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)
const nk = s => String(s ?? '').normalize('NFKC')
const BG_RE = /\(BG[123]\)|BG[123]/i

/** 事前判定: レース名の(BG1/2/3)、gradeフィールド、または grade_races.json の name_keywords。 */
export function isGradedRace(race) {
  if (!race) return false
  const g = race.grade || race.metadata?.grade
  if (g === 'BG1' || g === 'BG2' || g === 'BG3') return true
  const name = nk(race.name || race.race_name || race.race_name_official || '')
  if (BG_RE.test(name)) return true
  const kws = GRADE?.name_keywords || []
  return kws.some(k => k && name.includes(nk(k)))
}

function historyOf(name, age, date, hist) {
  const h = hist.horses[nk(name)]
  if (!h) return { h: null, birthMismatch: false }
  if (h.b && +h.b.slice(0, 4) !== +date.slice(0, 4) - +age) return { h: null, birthMismatch: true }
  return { h, birthMismatch: false }
}

/** レース日前の履歴だけから7特徴。finished 先行がない場合は imputation。 */
export function gradedFeatures(race, hist = HISTORY, model = GRADED) {
  const D = race.race_date
  const imp = model?.imputation?.no_finished_prior || {}
  const st = (race.entries || []).filter(e => !isScratched(e))
  return st.map(e => {
    const { h, birthMismatch } = historyOf(e.name, e.age, D, hist)
    const all = (h?.h || []).filter(row => row[0] < D)
    const finished = all.filter(row => row[7] === 0 && row[1] != null)
    const last5 = finished.slice(-5)
    const nPrior = all.length
    const priorGraded = all.reduce((s, row) => s + (row[6] ? 1 : 0), 0)
    let feat
    if (!last5.length) {
      feat = { ...imp, n_prior_starts: nPrior, prior_graded_count: priorGraded }
    } else {
      const nfs = last5.map(r => r[2]).filter(v => v != null)
      const last = finished.at(-1)
      const winsPrior = all.filter(r => r[3] === 1).length
      feat = {
        last5_mean_norm_finish: nfs.length ? nfs.reduce((a, b) => a + b, 0) / nfs.length : imp.last5_mean_norm_finish,
        last5_win_rate: last5.reduce((s, r) => s + r[3], 0) / last5.length,
        career_win_rate_before: nPrior ? winsPrior / nPrior : imp.career_win_rate_before,
        last_start_finish: +last[1],
        days_since_last: Math.max(0, days(D, last[0])),
        prior_graded_count: priorGraded,
        n_prior_starts: nPrior,
      }
    }
    return {
      umaban: +e.umaban, name: e.name, horse_id: e.horse_id, f: feat,
      history: last5.length ? 'official_history' : birthMismatch ? 'birth_year_mismatch_imputed' : 'no_history_imputed',
    }
  })
}

export function gradedLogits(rows, model = GRADED) {
  const F = model.features, mu = model.normalization.mu, sd = model.normalization.sd
  const beta = model.coefficients.beta, intercept = model.coefficients.intercept
  return rows.map(r => {
    let z = intercept
    for (const k of F) z += ((r.f[k] - mu[k]) / sd[k]) * beta[k]
    return z
  })
}

function zscore(vals) {
  const n = vals.length, mean = vals.reduce((a, b) => a + b, 0) / n
  let v = 0; for (const x of vals) v += (x - mean) ** 2
  const sd = Math.sqrt(v / n)
  if (!Number.isFinite(sd) || sd === 0) return vals.map(() => 0)
  return vals.map(x => (x - mean) / sd)
}

/**
 * 重賞かつ pure_O かつ card 適用可のとき、card効用と graded logit をレース内zで等重み合成し top3。
 * card が非eligibleなら本モジュールも非eligible（呼び出し側が card / model29 に落とす）。
 */
export function gradedCombineBox(race, { model = GRADED, hist = HISTORY, cardModel = CARD, laterCards = [] } = {}) {
  if (!model) return { eligible: false, reason: 'graded_model_missing' }
  if (!isGradedRace(race)) return { eligible: false, reason: 'not_graded' }
  const date = race.race_date
  if (!date || date < model.applies_to.effective_from_race_date) return { eligible: false, reason: 'before_effective_date' }
  if (date <= hist.history_through) return { eligible: false, reason: 'history_not_prior' }
  if (ageType(race) !== 'pure_O') return { eligible: false, reason: 'not_pure_O', age_type: ageType(race) }

  // card path prerequisites (same as cardBoxAge4, without selecting PL box yet)
  let cls = parseClass(race.name)
  if (!cls.ctype && race.race_class_raw) cls = parseClass(race.race_class_raw)
  if (!cls.ctype) return { eligible: false, reason: 'class_missing' }
  const cardRows = cardFeatures(race, cls)
  if (cardRows.length < 3) return { eligible: false, reason: 'fewer_than_3_candidates' }
  const gap = laterCards.filter(r => r.race_date > (CARD?.history_file?.history_through || hist.history_through) && r.race_date < date)
  const gapHorses = new Set(gap.flatMap(r => (r.entries || []).filter(e => !isScratched(e)).map(e => nk(e.name))))
  if (cardRows.some(r => gapHorses.has(nk(r.name)))) return { eligible: false, reason: 'history_gap' }

  const cardU = utilities(cardRows, cardModel)
  const gRows = gradedFeatures(race, hist, model)
  // align by umaban
  const byUma = new Map(gRows.map(r => [r.umaban, r]))
  const ordered = cardRows.map(r => byUma.get(r.umaban))
  if (ordered.some(x => !x)) return { eligible: false, reason: 'feature_align_mismatch' }
  const logits = gradedLogits(ordered, model)
  const zc = zscore(cardU), zg = zscore(logits)
  const combined = zc.map((z, i) => 0.5 * z + 0.5 * zg[i])

  const mi = cardRows.findIndex(r => isMemrobo(r.name))
  const idx = cardRows.map((_, i) => i)
  idx.sort((a, b) => {
    if (mi >= 0 && a === mi) return -1
    if (mi >= 0 && b === mi) return 1
    return combined[b] - combined[a] || cardRows[a].umaban - cardRows[b].umaban
  })
  // force memrobo into top3 if present
  let top = idx.slice(0, 3)
  if (mi >= 0 && !top.includes(mi)) {
    top = [mi, ...idx.filter(i => i !== mi)].slice(0, 3)
    top.sort((a, b) => (a === mi ? -1 : b === mi ? 1 : combined[b] - combined[a] || cardRows[a].umaban - cardRows[b].umaban))
  }
  return {
    eligible: true,
    model_version: model.version,
    history_through: hist.history_through,
    memrobo_forced: mi >= 0,
    box_method: 'graded5_card_combined',
    box: top.map(i => ({
      umaban: cardRows[i].umaban, name: cardRows[i].name, horse_id: cardRows[i].horse_id,
      combined: combined[i], card_u: cardU[i], graded_logit: logits[i],
    })),
    scores: cardRows.map((r, i) => ({
      umaban: r.umaban, combined: combined[i], card_u: cardU[i], graded_logit: logits[i],
      graded_history: ordered[i].history,
    })),
  }
}
