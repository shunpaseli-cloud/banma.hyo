// 時系列学習(指数重み λ=0.92 リッジOLS, lam=1)。検証: /tmp/horse_learn_loop.py, /tmp/lambda_sweep.py
// 純粋関数のみ(JSON読込なし)。オフライン scripts/train_learned_model.mjs とブラウザ learnScore.js で共用
// plus_hjz: horse_win_streak/rate10, jockey_win_streak/rate100, is_grade（ラムダBOX寄せ選定#2）
import { estimateMoisture } from './moisture.js'
export const LAMBDA = 0.92
export const FEATURE_NAMES = ['est_moist', 'sled_weight', 'body_weight', 'age', 'sex_male', 'sex_gelding', 'field', 'race_no', 'gate', 'umaban', 'jockey_count', 'horse_starts', 'horse_prev_fin_mean', 'moist_x_body', 'moist_x_sled', 'body_x_sled',
  'last5_fin_std', 'last5_fin_mean', 'same_jockey_n', 'same_jockey_fin_mean', 'same_moist_bucket_n', 'same_moist_bucket_fin_mean', 'sled_change_prev', 'sled_change_vs_last3mean',
  'horse_win_streak', 'horse_win_rate_10', 'jockey_win_streak', 'jockey_win_rate_100', 'is_grade']
// 水分帯 <1.5 / 1.5-3 / >=3 (%)
export const moistBucket = m => m < 1.5 ? 0 : m < 3 ? 1 : 2
// 過去走エントリ: { y: 着順スコア, jk: 騎手, mb: 水分帯, sl: ソリ重量 }（古い順）
export const histEntry = (y, jk, rid, sl) => ({ y, jk: jk || null, mb: moistBucket(estimateMoisture(dateOf(rid)) ?? 1.6), sl: sl == null || sl === '' ? null : +sl })
export const dateOf = rid => `${rid.slice(0, 4)}-${rid.slice(4, 6)}-${rid.slice(6, 8)}`
export const raceNoOf = rid => +rid.split('-R')[1]
export const tsec = (t, s) => { if (s != null) return s; const a = (t || '').split('.'); return a.length === 3 ? +a[0] * 60 + +a[1] + +a[2] / 10 : null }
export const finScore = (f, n) => 1 - (f - 1) / Math.max(n - 1, 1)

/** 連勝数: y===1 を末尾から数える */
export function winStreak(flags) {
  let s = 0
  for (let i = flags.length - 1; i >= 0; i--) {
    if (flags[i]) s++; else break
  }
  return s
}
export function winRate(flags, lastN) {
  const a = lastN ? flags.slice(-lastN) : flags
  if (!a.length) return NaN
  return a.reduce((x, y) => x + (y ? 1 : 0), 0) / a.length
}

// 特徴ベクトル。ctx = { jockeyCount, hist, jockeyWins(0/1配列), isGrade(0|1) }
export function featureVec(e, rid, field, ctx) {
  const N = v => (v == null || v === '' ? NaN : +v), h = (ctx.hist || []).map(q => typeof q === 'number' ? { y: q } : q)
  const mo = estimateMoisture(dateOf(rid)) ?? 1.6, sl = N(e.sled_weight), bw = N(e.body_weight)
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN, ys = h.map(q => q.y)
  const l5 = ys.slice(-5), m5 = mean(l5), jk = ctx.jockey || e.jockey
  const sj = jk ? h.filter(q => q.jk === jk).map(q => q.y) : [], mbk = moistBucket(mo), sm = h.filter(q => q.mb === mbk).map(q => q.y)
  const sls = h.slice(-3).map(q => q.sl).filter(v => v), has = !Number.isNaN(sl) && sl && sls.length
  const hw = ys.map(y => y === 1)
  const jw = ctx.jockeyWins || []
  const hs = winStreak(hw), hr = winRate(hw, 10)
  const js = winStreak(jw), jr = winRate(jw, 100)
  const jz = ctx.isGrade ? 1 : 0
  return [mo, sl, bw, N(e.age), e.sex === '牡' ? 1 : 0, e.sex === 'セ' ? 1 : 0,
    field, raceNoOf(rid), N(e.gate), N(e.umaban), ctx.jockeyCount || 0, h.length, h.length ? mean(ys) : 0.5,
    mo * bw, mo * sl, bw * sl,
    l5.length >= 2 ? Math.sqrt(mean(l5.map(v => (v - m5) ** 2))) : NaN, l5.length ? m5 : NaN, sj.length, sj.length ? mean(sj) : NaN,
    sm.length, sm.length ? mean(sm) : NaN, has ? sl - sls.at(-1) : NaN, has ? sl - mean(sls) : NaN,
    hs, Number.isNaN(hr) ? NaN : hr, js, Number.isNaN(jr) ? NaN : jr, jz]
}
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] } }
  return M.map((r, i) => r[n] / r[i]) }
// 重み付きリッジ(標準化・切片は罰則なし)。NaN特徴は加重前の単純平均で補完(Python版と同じ)
export function wfit(X, y, w, lam = 1) {
  const idx = y.map((v, i) => i).filter(i => y[i] != null && !Number.isNaN(y[i])), d = X[0].length
  const mu = Array.from({ length: d }, (_, j) => { const v = idx.map(i => X[i][j]).filter(x => !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 })
  const fill = x => x.map((v, j) => Number.isNaN(v) ? mu[j] : v)
  const Xf = idx.map(i => fill(X[i]))
  const sd = mu.map((m, j) => Math.sqrt(Xf.reduce((s, x) => s + (x[j] - m) ** 2, 0) / Xf.length) + 1e-9)
  const A = Array.from({ length: d + 1 }, () => Array(d + 1).fill(0)), B = Array(d + 1).fill(0)
  Xf.forEach((x, k) => { const z = [1, ...x.map((v, j) => (v - mu[j]) / sd[j])], wi = w[idx[k]], yi = y[idx[k]]
    for (let a = 0; a <= d; a++) { B[a] += wi * z[a] * yi; for (let c = 0; c <= d; c++) A[a][c] += wi * z[a] * z[c] } })
  for (let a = 1; a <= d; a++) A[a][a] += lam
  return { mu, sd, b: solve(A, B) }
}
export function applyModel(m, x) { let s = m.b[0]; x.forEach((v, j) => { const sd = Math.max(m.sd[j] || 0, 1e-9); s += m.b[j + 1] * ((Number.isNaN(v) ? m.mu[j] : v) - m.mu[j]) / sd }); return s }
/** 標準化特徴 × 係数の寄与。寄与の絶対値降順。 */
export function featureContribs(m, x, names = FEATURE_NAMES) {
  const out = []
  for (let j = 0; j < names.length; j++) {
    const v = Number.isNaN(x[j]) ? m.mu[j] : x[j]
    const sd = Math.max(m.sd[j] || 0, 1e-9)
    const c = m.b[j + 1] * (v - m.mu[j]) / sd
    out.push({ name: names[j], value: v, contrib: Number.isFinite(c) ? c : 0 })
  }
  out.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
  return out
}

/** grade lookup: dates Set of YYYYMMDD or YYYY-MM-DD; keywords string[] */
export function isGradeRace(rid, raceName, grade) {
  if (!grade) return 0
  const dk = String(rid || '').replace(/-/g, '').slice(0, 8)
  if (grade.dates?.includes?.(dk) || grade.dateSet?.has?.(dk)) return 1
  const nm = String(raceName || '')
  if (nm && grade.name_keywords?.some(k => nm.includes(k))) return 1
  return 0
}

// 結果JSON + 過去カード(騎手) から日付順の学習行を作り、各開催日 D について「D より前の日だけ」で当てたモデルを返す
// grade: optional { dates: ['YYYYMMDD',...], name_keywords: [...] } for is_grade feature
export function trainChronological(results, pastCards = [], lambda = LAMBDA, warm = 10, keep = null, grade = null) {
  const JK = {}; for (const r of pastCards) for (const e of r.entries || []) JK[`${e.race_id}|${e.name}`] = e.jockey
  const nameOf = {}; for (const r of pastCards) if (r.race_id) nameOf[r.race_id] = r.name
  const byDay = {}; for (const [rid, ent] of Object.entries(results)) (byDay[dateOf(rid)] ||= []).push([rid, ent])
  const days = Object.keys(byDay).sort(), X = [], KD = new Set(), YF = [], YT = [], DN = [], cnt = {}, hist = {}, jWins = {}, snapshots = {}
  const fitAt = i => { const w = DN.map(dn => lambda ** (i - 1 - dn)); return { finish: wfit(X, YF, w), time: wfit(X, YT, w) } }
  days.forEach((d, i) => {
    if ((keep ? KD.size : i) >= warm) snapshots[d] = fitAt(i) // 当日の結果を入れる前 = 過去日のみ
    const rows = []
    for (const [rid, ent] of byDay[d].sort()) { const n = ent.length
      const g = isGradeRace(rid, nameOf[rid], grade)
      for (const e of ent) { if (!Number.isInteger(e.finish)) continue; const jk = JK[`${rid}|${e.name}`]
        rows.push({ e, jk, rid, g, k: !keep || keep(rid), x: featureVec(e, rid, n, { jockeyCount: jk ? cnt[jk] || 0 : 0, jockey: jk, hist: hist[e.name], jockeyWins: jk ? (jWins[jk] || []) : [], isGrade: g }), yf: finScore(e.finish, n), yt: tsec(e.time, e.time_sec) }) } }
    for (const r of rows) { if (!r.k) continue; KD.add(d); X.push(r.x); YF.push(r.yf); YT.push(r.yt); DN.push(i) }
    for (const r of rows) {
      if (r.jk) { cnt[r.jk] = (cnt[r.jk] || 0) + 1; (jWins[r.jk] ||= []).push(r.e.finish === 1 ? 1 : 0) }
      (hist[r.e.name] ||= []).push(histEntry(r.yf, r.jk, r.rid, r.e.sled_weight))
    }
  })
  return { days, snapshots, final: fitAt(days.length), n_rows: X.length }
}
