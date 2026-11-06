// 雨用OLS: 推定/実測水分 >= RAIN_THRESHOLD の開催日だけを学習行に使う(履歴特徴は全レースで更新)
// node scripts/train_rain_model.mjs [threshold] → src/data/learned_model_rain.json + 通常モデルとの比較
import fs from 'node:fs'
import { trainChronological, FEATURE_NAMES, LAMBDA, applyModel, featureVec, histEntry, finScore, tsec, dateOf, isGradeRace } from '../src/learnCore.js'
const GRADE = JSON.parse(fs.readFileSync(new URL('../src/data/grade_races.json', import.meta.url)))
import { estimateMoisture } from '../src/moisture.js'
const TH = +(process.argv[2] || 1.8)
const R = JSON.parse(fs.readFileSync(new URL('../src/data/results_from_pdf.json', import.meta.url))).races
const dir = new URL('../src/data/past/', import.meta.url), cards = []
for (const f of fs.readdirSync(dir)) { const d = JSON.parse(fs.readFileSync(new URL(f, dir))); cards.push(...(d.races || d)) }
const wet = rid => (estimateMoisture(dateOf(rid)) ?? 1.6) >= TH
const norm = trainChronological(R, cards, LAMBDA, 10, null, GRADE), rain = trainChronological(R, cards, LAMBDA, 5, wet, GRADE)
const JK = {}; for (const r of cards) for (const e of r.entries || []) JK[`${e.race_id}|${e.name}`] = e.jockey
const st = () => ({ races: 0, win: 0, ae: 0, n: 0 }), S = { normal_wet: st(), rain_wet: st(), normal_dry: st(), normal_all: st(), switch_all: st() }
const hist = {}, cnt = {}, jWins = {}, nameOf = {}, byDay = {}; for (const r of cards) if (r.race_id) nameOf[r.race_id] = r.name
for (const rid of Object.keys(R).sort()) (byDay[rid.slice(0, 8)] ||= []).push(rid)
const add = (s, ps, key) => { s.races++; if (ps.reduce((a, b) => b[key].f > a[key].f ? b : a).e.finish === 1) s.win++
  for (const p of ps) { const y = tsec(p.e.time, p.e.time_sec); if (y != null) { s.ae += Math.abs(p[key].t - y); s.n++ } } }
for (const dk of Object.keys(byDay).sort()) { const d = dateOf(dk), sn = norm.snapshots[d], sr = rain.snapshots[d], upd = []
  for (const rid of byDay[dk]) { const ent = R[rid].filter(e => Number.isInteger(e.finish)), nn = R[rid].length
    const g = isGradeRace(rid, nameOf[rid], GRADE)
    const ps = ent.map(e => { const jk = JK[`${rid}|${e.name}`], x = featureVec(e, rid, nn, { jockeyCount: jk ? cnt[jk] || 0 : 0, jockey: jk, hist: hist[e.name], jockeyWins: jk ? (jWins[jk] || []) : [], isGrade: g }); upd.push([e, jk, finScore(e.finish, nn), rid])
      return { e, N: sn && { f: applyModel(sn.finish, x), t: applyModel(sn.time, x) }, W: sr && { f: applyModel(sr.finish, x), t: applyModel(sr.time, x) } } })
    if (!sn || !sr || !ps.length) continue // 両モデルが揃う日だけ比較
    if (wet(rid)) { add(S.normal_wet, ps, 'N'); add(S.rain_wet, ps, 'W'); add(S.switch_all, ps, 'W') } else { add(S.normal_dry, ps, 'N'); add(S.switch_all, ps, 'N') }
    add(S.normal_all, ps, 'N') }
  for (const [e, jk, y, rid] of upd) { if (jk) { cnt[jk] = (cnt[jk] || 0) + 1; (jWins[jk] ||= []).push(e.finish === 1 ? 1 : 0) }; (hist[e.name] ||= []).push(histEntry(y, jk, rid, e.sled_weight)) } }
const fmt = s => ({ eval_races: s.races, winner_top1_rate: +(s.win / s.races).toFixed(4), time_mae_sec: +(s.ae / s.n).toFixed(2) })
const cmp = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, fmt(v)]))
const r4 = m => ({ mu: m.mu.map(v => +v.toFixed(5)), sd: m.sd.map(v => Math.max(+v.toFixed(5), 1e-9)), b: m.b.map(v => +v.toFixed(6)) })
const pack = s => ({ finish: r4(s.finish), time: r4(s.time) })
const wetDays = norm.days.filter(d => (estimateMoisture(d) ?? 1.6) >= TH)
const out = { version: 1, kind: 'rain', moisture_threshold: TH, method: `rain-only exp-weighted ridge OLS lambda=${LAMBDA}; rows from days with moisture>=${TH}`,
  lambda: LAMBDA, features: FEATURE_NAMES, trained_at: new Date().toISOString(), train_days: wetDays.length, train_rows: rain.n_rows,
  last_result_date: norm.days.at(-1), final: pack(rain.final), snapshots: Object.fromEntries(Object.entries(rain.snapshots).map(([d, s]) => [d, pack(s)])), backtest: cmp }
if (!process.argv.includes('--dry')) fs.writeFileSync(new URL('../src/data/learned_model_rain.json', import.meta.url), JSON.stringify(out))
console.log(JSON.stringify({ TH, wet_days: wetDays.length, rows: rain.n_rows, cmp }))
