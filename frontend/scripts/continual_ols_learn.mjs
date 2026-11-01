// 継続学習: node scripts/continual_ols_learn.mjs [--no-fetch] [--no-push] [--tol-hit 0.005] [--tol-mae 0.3]
// 1) 公式成績PDFから新規レースを results_from_pdf.json に追加（既存キー・trio_payouts・extra_sources は保持）
// 2) 16特徴 OLS λ=0.92 を同梱全結果で再学習 (train_learned_model.mjs)
// 3) 本命的中率/タイムMAE を旧 learned_model.json と比較
// 4) 悪化(的中率 -tolHit 超 or MAE +tolMae 超)なら旧係数に戻す
// 5) 改善 or データ追加なら build → docs/ & gh-pages 更新、main と gh-pages を push
// 履歴: src/data/ols_metric_log.json。localStorage は端末内のみのため使わない（捏造しない）。
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'
import { execSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'
const FE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ROOT = path.resolve(FE, '..')
const D = p => path.join(FE, 'src/data', p), arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d }
const has = k => process.argv.includes(k), TOL_HIT = arg('--tol-hit', 0.005), TOL_MAE = arg('--tol-mae', 0.3)
const sh = (c, cwd = FE) => execSync(c, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString()
const rj = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const RES = D('results_from_pdf.json'), PUB = path.join(FE, 'public/results.json'), MODEL = D('learned_model.json'), LOG = D('ols_metric_log.json')

// 1) 取り込み (fetch_pdf_results.py は全体上書きするので退避→マージ→復元)
const base = rj(RES), resBak = fs.readFileSync(RES), pubBak = fs.existsSync(PUB) ? fs.readFileSync(PUB) : null
let added = [], fetchErr = null
if (!has('--no-fetch')) {
  try {
    const py = fs.existsSync(path.join(FE, '.venv/bin/python')) ? '.venv/bin/python' : 'python3'
    sh(`${py} scripts/fetch_pdf_results.py`)
    const fresh = rj(RES).races
    for (const [k, v] of Object.entries(fresh)) if (!base.races[k] && v?.length) { base.races[k] = v; added.push(k) }
  } catch (e) { fetchErr = String(e.message || e).slice(0, 300) }
  fs.writeFileSync(RES, resBak); pubBak ? fs.writeFileSync(PUB, pubBak) : 0
  if (added.length) {
    base.races = Object.fromEntries(Object.entries(base.races).sort(([a], [b]) => a.localeCompare(b)))
    base.meta = { ...base.meta, races: Object.keys(base.races).length, continual_updated_at: new Date().toISOString() }
    const s = JSON.stringify(base, null, 1); fs.writeFileSync(RES, s); fs.writeFileSync(PUB, s)
  }
}
// umanity 自動取り込みは未実装（ページ構造が不安定なため。手動取り込み分は extra_sources に記録済み）

// 2-4) 再学習と比較
const oldModelRaw = fs.readFileSync(MODEL, 'utf8'), old = JSON.parse(oldModelRaw).backtest || {}
sh('node scripts/train_learned_model.mjs')
const nu = rj(MODEL).backtest
const dHit = nu.winner_top1_rate - (old.winner_top1_rate ?? 0), dMae = nu.time_mae_sec - (old.time_mae_sec ?? Infinity)
const worse = dHit < -TOL_HIT || dMae > TOL_MAE, improved = !worse && (dHit > 0 || dMae < 0)
let status = worse ? 'reverted' : improved ? 'improved' : 'kept_new'
if (worse) fs.writeFileSync(MODEL, oldModelRaw)
const log = fs.existsSync(LOG) ? rj(LOG) : { entries: [] }
log.entries.push({ at: new Date().toISOString(), status, races_total: Object.keys(base.races).length, added, fetch_error: fetchErr,
  prev: { hit: old.winner_top1_rate, mae: old.time_mae_sec, eval_races: old.eval_races },
  cand: { hit: nu.winner_top1_rate, mae: nu.time_mae_sec, eval_races: nu.eval_races },
  tol: { hit: TOL_HIT, mae: TOL_MAE }, localStorage_used: false })
fs.writeFileSync(LOG, JSON.stringify(log, null, 1))
console.log(JSON.stringify(log.entries.at(-1)))

// 5) ビルド・デプロイ
if (!(improved || added.length) || has('--no-push')) process.exit(0)
const msg = `continual OLS: ${status}, +${added.length} races, hit ${nu.winner_top1_rate} mae ${nu.time_mae_sec}`
sh('npx vite build')
fs.rmSync(path.join(ROOT, 'docs'), { recursive: true, force: true }); fs.cpSync(path.join(FE, 'dist'), path.join(ROOT, 'docs'), { recursive: true })
fs.copyFileSync(path.join(ROOT, 'docs/index.html'), path.join(ROOT, 'docs/404.html'))
sh(`git add -A frontend/src/data frontend/public/results.json frontend/dist docs && git commit -q -m "${msg}" && git push -q origin main`, ROOT)
const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'ghp-'))
sh(`git worktree add -f ${wt} gh-pages`, ROOT)
try {
  for (const f of fs.readdirSync(wt)) if (f !== '.git') fs.rmSync(path.join(wt, f), { recursive: true, force: true })
  fs.cpSync(path.join(ROOT, 'docs'), wt, { recursive: true }); fs.writeFileSync(path.join(wt, '.nojekyll'), '')
  sh(`git add -A && (git diff --cached --quiet || git commit -q -m "${msg}") && git push -q origin gh-pages`, wt)
} finally { sh(`git worktree remove --force ${wt}`, ROOT) }
