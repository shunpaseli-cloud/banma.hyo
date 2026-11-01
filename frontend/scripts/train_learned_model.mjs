// 学習済みモデル再生成: node scripts/train_learned_model.mjs → src/data/learned_model.json
// 各開催日 D のスナップショットは D より前の日だけで学習(未来リークなし)。final は全日で学習(以降の日の予想用)
import fs from 'node:fs'
import { trainChronological, FEATURE_NAMES, LAMBDA, applyModel, featureVec, histEntry, finScore, tsec } from '../src/learnCore.js'
const R = JSON.parse(fs.readFileSync(new URL('../src/data/results_from_pdf.json', import.meta.url))).races
const dir = new URL('../src/data/past/', import.meta.url), cards = []
for (const f of fs.readdirSync(dir)) { const d = JSON.parse(fs.readFileSync(new URL(f, dir))); cards.push(...(d.races || d)) }
const t = trainChronological(R, cards)
const r4 = m => ({ mu: m.mu.map(v => +v.toFixed(5)), sd: m.sd.map(v => +v.toFixed(5)), b: m.b.map(v => +v.toFixed(6)) })
const pack = s => ({ finish: r4(s.finish), time: r4(s.time) })
const out = { version: 1, method: `exp-weighted ridge OLS lambda=${LAMBDA}, ridge=1, standardized`, lambda: LAMBDA, features: FEATURE_NAMES,
  trained_at: new Date().toISOString(), train_days: t.days.length, train_rows: t.n_rows, last_result_date: t.days.at(-1),
  final: pack(t.final), snapshots: Object.fromEntries(Object.entries(t.snapshots).map(([d, s]) => [d, pack(s)])) }
fs.writeFileSync(new URL('../src/data/learned_model.json', import.meta.url), JSON.stringify(out))
// 簡易バックテスト: 各日のスナップショット(過去日のみ)で本命(着順スコア1位)の1着率・タイムMAE
// 注: 騎手出走数・馬の過去成績は学習時と同じ逐次値を使うため trainChronological の内部行を再現せず、ここでは
//     馬の過去成績を日付順に再構築して評価する
const hist = {}, JK = {}, cnt = {}; for (const r of cards) for (const e of r.entries || []) JK[`${e.race_id}|${e.name}`] = e.jockey
let win = 0, races = 0, ae = 0, n = 0
const byDay = {}; for (const rid of Object.keys(R).sort()) (byDay[rid.slice(0, 8)] ||= []).push(rid)
for (const dk of Object.keys(byDay).sort()) { const d = `${dk.slice(0,4)}-${dk.slice(4,6)}-${dk.slice(6,8)}`, s = t.snapshots[d], upd = []
  for (const rid of byDay[dk]) { const ent = R[rid].filter(e => Number.isInteger(e.finish)), nn = R[rid].length
    const ps = ent.map(e => { const jk = JK[`${rid}|${e.name}`], x = featureVec(e, rid, nn, { jockeyCount: jk ? cnt[jk] || 0 : 0, jockey: jk, hist: hist[e.name] }); upd.push([e, jk, finScore(e.finish, nn), rid])
      return s && { e, f: applyModel(s.finish, x), t: applyModel(s.time, x) } })
    if (s && ps.length) { races++; if (ps.reduce((a, b) => b.f > a.f ? b : a).e.finish === 1) win++
      for (const p of ps) { const y = tsec(p.e.time, p.e.time_sec); if (y != null) { ae += Math.abs(p.t - y); n++ } } } }
  for (const [e, jk, y, rid] of upd) { if (jk) cnt[jk] = (cnt[jk] || 0) + 1; (hist[e.name] ||= []).push(histEntry(y, jk, rid, e.sled_weight)) } }
out.backtest = { eval_races: races, winner_top1_rate: +(win / races).toFixed(4), time_mae_sec: +(ae / n).toFixed(2) }
fs.writeFileSync(new URL('../src/data/learned_model.json', import.meta.url), JSON.stringify(out))
console.log(JSON.stringify({ days: t.days.length, rows: t.n_rows, snapshots: Object.keys(t.snapshots).length, final_finish_b: out.final.finish.b, backtest: out.backtest, final_time_b: out.final.time.b }))
