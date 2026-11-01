// 時系列学習(指数重み λ=0.92 リッジOLS, lam=1)。検証: /tmp/horse_learn_loop.py, /tmp/lambda_sweep.py
// 純粋関数のみ(JSON読込なし)。オフライン scripts/train_learned_model.mjs とブラウザ learnScore.js で共用
import { estimateMoisture } from './moisture.js'
export const LAMBDA = 0.92
export const FEATURE_NAMES = ['est_moist', 'sled_weight', 'body_weight', 'age', 'sex_male', 'sex_gelding', 'field', 'race_no', 'gate', 'umaban', 'jockey_count', 'horse_starts', 'horse_prev_fin_mean', 'moist_x_body', 'moist_x_sled', 'body_x_sled']
// 交互作用項(末尾に追加・各列は wfit で独立に標準化)。片方NaNならNaN→列平均で補完
export const dateOf = rid => `${rid.slice(0, 4)}-${rid.slice(4, 6)}-${rid.slice(6, 8)}`
export const raceNoOf = rid => +rid.split('-R')[1]
export const tsec = (t, s) => { if (s != null) return s; const a = (t || '').split('.'); return a.length === 3 ? +a[0] * 60 + +a[1] + +a[2] / 10 : null }
export const finScore = (f, n) => 1 - (f - 1) / Math.max(n - 1, 1)
// 特徴ベクトル。ctx = { jockeyCount, hist(着順スコア配列: その日より前のみ) }
export function featureVec(e, rid, field, ctx) {
  const N = v => (v == null || v === '' ? NaN : +v), h = ctx.hist || []
  const mo = estimateMoisture(dateOf(rid)) ?? 1.6, sl = N(e.sled_weight), bw = N(e.body_weight)
  return [mo, sl, bw, N(e.age), e.sex === '牡' ? 1 : 0, e.sex === 'セ' ? 1 : 0,
    field, raceNoOf(rid), N(e.gate), N(e.umaban), ctx.jockeyCount || 0, h.length, h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0.5,
    mo * bw, mo * sl, bw * sl]
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
export function applyModel(m, x) { let s = m.b[0]; x.forEach((v, j) => { s += m.b[j + 1] * ((Number.isNaN(v) ? m.mu[j] : v) - m.mu[j]) / m.sd[j] }); return s }
// 結果JSON + 過去カード(騎手) から日付順の学習行を作り、各開催日 D について「D より前の日だけ」で当てたモデルを返す
export function trainChronological(results, pastCards = [], lambda = LAMBDA, warm = 10, keep = null) {
  // keep(rid): 学習行に入れるレースの条件(例: 雨用=水分>=閾値)。馬/騎手の履歴は全レースで更新
  const JK = {}; for (const r of pastCards) for (const e of r.entries || []) JK[`${e.race_id}|${e.name}`] = e.jockey
  const byDay = {}; for (const [rid, ent] of Object.entries(results)) (byDay[dateOf(rid)] ||= []).push([rid, ent])
  const days = Object.keys(byDay).sort(), X = [], KD = new Set(), YF = [], YT = [], DN = [], cnt = {}, hist = {}, snapshots = {}
  const fitAt = i => { const w = DN.map(dn => lambda ** (i - 1 - dn)); return { finish: wfit(X, YF, w), time: wfit(X, YT, w) } }
  days.forEach((d, i) => {
    if ((keep ? KD.size : i) >= warm) snapshots[d] = fitAt(i) // 当日の結果を入れる前 = 過去日のみ
    const rows = []
    for (const [rid, ent] of byDay[d].sort()) { const n = ent.length
      for (const e of ent) { if (!Number.isInteger(e.finish)) continue; const jk = JK[`${rid}|${e.name}`]
        rows.push({ e, jk, k: !keep || keep(rid), x: featureVec(e, rid, n, { jockeyCount: jk ? cnt[jk] || 0 : 0, hist: hist[e.name] }), yf: finScore(e.finish, n), yt: tsec(e.time, e.time_sec) }) } }
    for (const r of rows) { if (!r.k) continue; KD.add(d); X.push(r.x); YF.push(r.yf); YT.push(r.yt); DN.push(i) }
    for (const r of rows) { if (r.jk) cnt[r.jk] = (cnt[r.jk] || 0) + 1; (hist[r.e.name] ||= []).push(r.yf) }
  })
  return { days, snapshots, final: fitAt(days.length), n_rows: X.length }
}
