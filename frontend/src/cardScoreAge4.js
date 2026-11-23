// 4歳以上限定・出走表スコアによる三連単3頭BOX候補選定（card-score-age4-v1, t269u）。
// 出走表（年齢・性・ソリ重量・取消/除外）と同梱の公式確定成績（history_through 以前の日付のみ）から
// 17特徴を計算し、Plackett-Luce 3着内確率で最大の3頭集合を選ぶ。
// 点数・購入/見送り・自信度には使わない（呼び出し側 boxSelection.js が BOX の3頭だけを差し替える）。
import MODEL from './data/learned_model.json' with { type: 'json' }
import HISTORY from './data/card_history_age4.json' with { type: 'json' }
import { isMemrobo } from './memrobo.js'

export const CARD = MODEL.card_score_age4
const LAD = { A1: 1, A2: 2, B1: 3, B2: 4, B3: 5, B4: 6, C1: 7, C2: 8 }
const SCRATCH = /取消|除外|withdrawn|excluded|scratch/i
const DAY = 86400000
const days = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)
const nk = s => String(s ?? '').normalize('NFKC')

/** build_dataset.parse_class と同じ梯子。本番カード名の全角/マイナス記号は '-' に正規化。 */
export function parseClass(name) {
  const n = nk(name).replace(/[\s\u3000]/g, '').replace(/[\u2212\u2010-\u2015\uFF0D]/g, '-')
  let ms = [...n.matchAll(/([23])歳([A-D])(?:-(\d+))?/g)], m = ms.at(-1)
  if (m) return { ctype: 'Y', cval: 'ABCD'.indexOf(m[2]) + 1 + (m[3] ? +m[3] / 20 : 0) }
  ms = [...n.matchAll(/([ABC][12]|B[34])(?:-(\d+))?/g)]; m = ms.at(-1)
  if (m) return { ctype: 'G', cval: LAD[m[1]] + (m[2] ? +m[2] / 20 : 0) }
  if (n.includes('オープン')) return { ctype: 'G', cval: 0 }
  if (n.includes('選抜')) return n.includes('2歳選抜') ? { ctype: 'Y', cval: 0.5 } : { ctype: 'G', cval: 0 }
  if (n.endsWith('2歳新馬')) return { ctype: 'Y', cval: 5 }
  return { ctype: null, cval: null }
}

export const isScratched = e => SCRATCH.test(String(e?.status ?? ''))
/** 出走予定馬（取消・除外を除く）の年齢で Y(<=3) / O(>=4) / mixed / unknown に分類。 */
export function ageType(race) {
  const st = (race.entries || []).filter(e => !isScratched(e))
  if (!st.length || st.some(e => !Number.isFinite(+e.age) || e.age === null || !Number.isFinite(+e.sled_weight) || e.sled_weight === null)) return 'unknown'
  const b = new Set(st.map(e => (+e.age <= 3 ? 'Y' : 'O')))
  return b.size === 1 ? 'pure_' + [...b][0] : 'mixed'
}

function historyOf(name, age, date, hist) {
  const h = hist.horses[nk(name)]
  if (!h) return { h: null, birthMismatch: false }
  if (+h.b.slice(0, 4) !== +date.slice(0, 4) - +age) return { h: null, birthMismatch: true }
  return { h, birthMismatch: false }
}

/** pipeline.build_features と同一定義の17特徴（M1）。 */
export function cardFeatures(race, { ctype, cval } = parseClass(race.name), hist = HISTORY) {
  const D = race.race_date, st = (race.entries || []).filter(e => !isScratched(e))
  const mean = st.reduce((s, e) => s + +e.sled_weight, 0) / st.length
  return st.map(e => {
    const { h, birthMismatch } = historyOf(e.name, e.age, D, hist), H = h?.h || [], last = H.at(-1)
    const w = +e.sled_weight, f = {}
    f.w_rel = w - mean
    f.w_delta_prev = last ? w - last[4] : 0
    f.w_minus_best_top3 = h?.bt != null ? w - h.bt : 0
    f.best_top3_missing = h?.bt != null ? 0 : 1
    f.female = e.sex === '牝' ? 1 : 0
    const b = h?.b || e.birth_date || `${+D.slice(0, 4) - +e.age}0415`
    f.age_months = days(D, `${b.slice(0, 4)}-${b.slice(4, 6)}-${b.slice(6, 8)}`) / 30.44
    f.form_last1 = last ? last[1] : 0.5
    const l3 = H.slice(-3); f.form_avg3 = l3.length ? l3.reduce((s, x) => s + x[1], 0) / l3.length : 0.5
    const l5 = H.slice(-5), k = l5.length
    f.win_rate5 = (l5.reduce((s, x) => s + x[2], 0) + 0.12 * 2) / (k + 2)
    f.top3_rate5 = (l5.reduce((s, x) => s + x[3], 0) + 0.35 * 2) / (k + 2)
    f.log_starts = Math.log1p(h?.n || 0)
    f.log_days_since = Math.log1p(last ? Math.min(days(D, last[0]), 365) : 365)
    f.no_history = H.length ? 0 : 1
    f.last_dnf = last && last[7] ? 1 : 0
    if (last && ctype && last[5] === ctype) { f.class_change = cval - last[6]; f.class_unknown_or_switch = 0 } else { f.class_change = 0; f.class_unknown_or_switch = 1 }
    f.scratch_hist = Math.log1p((h?.s || []).filter(s => days(D, s) <= 180).length)
    return { umaban: +e.umaban, name: e.name, horse_id: e.horse_id, f, history: H.length ? 'official_history' : birthMismatch ? 'birth_year_mismatch_no_history' : 'no_history' }
  })
}

export function utilities(rows, model = CARD) {
  const F = model.features, mu = model.normalization?.mu ?? model.mu, sd = model.normalization?.sd ?? model.sd, beta = model.beta
  return rows.map(r => F.reduce((s, k, i) => s + ((r.f[k] - mu[i]) / sd[i]) * beta[k], 0))
}

/** BOX_PL: 6順列のPL確率和が最大の3頭集合（同値は馬番順で最初の集合）。mustInclude は index。 */
export function plBox(u, mustInclude = null) {
  const mx = Math.max(...u), e = u.map(x => Math.exp(x - mx)), S = e.reduce((a, b) => a + b, 0), p = e.map(x => x / S), n = p.length
  const mass = new Map()
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    if (i === j || j === k || i === k) continue
    const q = p[i] * p[j] / (1 - p[i]) * p[k] / (1 - p[i] - p[j]), key = [i, j, k].sort((a, b) => a - b).join(',')
    mass.set(key, (mass.get(key) || 0) + q)
  }
  let best = null
  for (const [key, m] of mass) { const s = key.split(',').map(Number); if (mustInclude != null && !s.includes(mustInclude)) continue; if (!best || m > best.m) best = { s, m } }
  return { set: best.s, mass: best.m, p }
}

/** レース単位の判定と BOX。eligible=false のときは理由のみ返す（呼び出し側は29特徴BOXを維持）。 */
export function cardBoxAge4(race, { model = CARD, hist = HISTORY, laterCards = [] } = {}) {
  if (!model) return { eligible: false, reason: 'model_missing' }
  const date = race.race_date
  if (!date || date < model.applies_to.effective_from_race_date) return { eligible: false, reason: 'before_effective_date' }
  if (date <= hist.history_through) return { eligible: false, reason: 'history_not_prior' }
  const type = ageType(race)
  if (type !== 'pure_O') return { eligible: false, reason: type === 'unknown' ? 'age_or_sled_missing' : type, age_type: type }
  let cls = parseClass(race.name)
  if (!cls.ctype && race.race_class_raw) cls = parseClass(race.race_class_raw)
  // クラスが読めないカードは検証済みの入力と異なるため適用しない（29特徴BOXのまま）
  if (!cls.ctype) return { eligible: false, reason: 'class_missing', age_type: type }
  const rows = cardFeatures(race, cls, hist)
  if (rows.length < 3) return { eligible: false, reason: 'fewer_than_3_candidates', age_type: type }
  // 同梱履歴の後〜当日前の開催に出走した候補馬がいれば、その成績が未反映なので適用しない（当日結果は使わない）
  const gap = laterCards.filter(r => r.race_date > hist.history_through && r.race_date < date)
  const gapHorses = new Set(gap.flatMap(r => (r.entries || []).filter(e => !isScratched(e)).map(e => nk(e.name))))
  if (rows.some(r => gapHorses.has(nk(r.name)))) return { eligible: false, reason: 'history_gap', age_type: type }
  const u = utilities(rows, model)
  const mi = rows.findIndex(r => isMemrobo(r.name)), { set, mass, p } = plBox(u, mi >= 0 ? mi : null)
  const order = [...set].sort((a, b) => (mi >= 0 && a === mi ? -1 : mi >= 0 && b === mi ? 1 : u[b] - u[a] || a - b))
  return {
    eligible: true, age_type: type, model_version: model.version, history_through: hist.history_through, memrobo_forced: mi >= 0,
    box: order.map(i => ({ umaban: rows[i].umaban, name: rows[i].name, horse_id: rows[i].horse_id, card_rank: [...u].sort((a, b) => b - a).indexOf(u[i]) + 1 })),
    box_mass: mass, scores: rows.map((r, i) => ({ umaban: r.umaban, u: u[i], p: p[i], history: r.history })),
  }
}
