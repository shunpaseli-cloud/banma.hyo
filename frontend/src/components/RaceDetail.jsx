import { TrioPayout } from '../trioPayout.jsx'
import { prevFinish } from '../prevFinish.js'
import { FEATURES, getWeights } from '../feedback.js'
import { markOf, MARK_LEGEND } from '../marks.js'
import { useEffect, useState } from 'react'
import { getPdfResults } from '../scraper.js'
const norm = s => (s || '').replace(/[\s\u3000]/g, '')
const JP = { weight_pull: '牽引力（馬体重/ソリ重量）', recent_form_3: '近走3走', recent_form_5: '近走5走', gate: '枠順', jockey: '騎手勝率', time_index: 'タイム指数（前走）', sled_light: 'ソリ軽さ（相対）', age_prime: '年齢（充実度）', body_mass: '馬体重（前走・相対）', apprentice: '減量騎手', prev_field_strength: '前走頭数（相手の多さ）', prev_opp_quality: '前走対戦馬の強さ（タイム指数）', peer_form_3: '同条件成績（ソリ±50kg・3走）', track_moisture: '馬場水分', moisture_form: '水分適性（似た馬場水分の過去3走）' }
export default function RaceDetail({ race, preds }) {
  const w = getWeights(), H = Object.fromEntries(race.entries.map(h => [h.horse_id, h]))
  const n = preds.length
  const [res, setRes] = useState(undefined)
  useEffect(() => { let on = true; getPdfResults(race.race_id).then(r => on && setRes(r || null)).catch(() => on && setRes(null)); return () => { on = false } }, [race.race_id])
  const findE = r => race.entries.find(e => r.umaban != null && e.umaban === r.umaban && (!r.name || !e.name || norm(e.name) === norm(r.name) || norm(e.name).includes(norm(r.name)) || norm(r.name).includes(norm(e.name)))) || race.entries.find(e => norm(e.name) === norm(r.name))
  const predOf = e => e && preds.find(p => p.horse_id === e.horse_id)?.pred_rank
  const finOf = {}; (res || []).forEach(r => { const e = findE(r); if (e) finOf[e.horse_id] = r.finish })
  const avg = Object.fromEntries(FEATURES.map(f => [f, preds.reduce((s, p) => s + w[f] * (p.features[f] ?? 0.5), 0) / n]))
  const reason = p => {
    const d = FEATURES.map(f => [f, (p.features[f] == null ? avg[f] : w[f] * p.features[f]) - avg[f]]).sort((a, b) => b[1] - a[1])
    const plus = d.filter(x => x[1] > 0.002).slice(0, 2).map(x => `${JP[x[0]].split('（')[0]}が平均より+${x[1].toFixed(3)}`)
    const minus = d.filter(x => x[1] < -0.002).slice(-1).map(x => `${JP[x[0]].split('（')[0]}が${x[1].toFixed(3)}`)
    return [plus.length ? `強み: ${plus.join('、')}` : '突出した強みなし', minus.length ? `弱み: ${minus.join('')}` : ''].filter(Boolean).join(' ／ ')
  }
  return <div className="detail trio">
    <h3>採点の詳細</h3>
    <p className="meta">馬場水分: {race.track_moisture != null ? `${race.track_moisture}%（実測）` : race.track_moisture_est != null ? `約${race.track_moisture_est}%（天気からの推定・実測ではありません）` : '不明（中間値0.5で採点）'}</p>
    <p className="meta">スコア = Σ 重み × 特徴量。現在の重み: {FEATURES.map(f => `${JP[f].split('（')[0]} ${w[f].toFixed(3)}`).join('・')}</p>
    <div style={{ overflowX: 'auto' }}><table className="horses"><thead><tr><th>順</th><th>馬</th><th>前走</th><th>前走タイム</th>{FEATURES.map(f => <th key={f}>{JP[f].split('（')[0]}</th>)}<th>合計</th></tr></thead>
      <tbody>{preds.map(p => { const h = H[p.horse_id] || {}; return <tr key={p.horse_id}><td>{p.pred_rank}</td><td className="nowrap">{h.umaban ?? h.gate}<span className="mark-in">{markOf(p.pred_rank)}</span> {h.name}</td><td>{(() => { const q = prevFinish(h.name, race.race_id); return q ? <span>{q.finish != null ? `${q.finish}着` : '—'}<small> ({q.date.slice(5).replace('-','/')} {q.raceNo}R/{q.field}頭)</small></span> : '—' })()}</td><td>{(() => { const q = prevFinish(h.name, race.race_id); return q?.time ? <span>{q.time}<small> (指数{q.time_index ?? '—'})</small></span> : '—' })()}</td>
        {FEATURES.map(f => <td key={f}>{p.features[f] == null ? <small>— (スキップ)</small> : <>{(w[f] * p.features[f]).toFixed(3)}<small> ({p.features[f].toFixed(2)})</small></>}</td>)}<td><b>{p.score.toFixed(3)}</b></td></tr> })}</tbody></table></div>
    <p className="meta">各欄: 寄与（重み×値）、括弧内は特徴量の値(0〜1)。前走は公式結果PDF（同梱分）から馬名で照合、不明は「—」。タイム指数=前走のレース内偏差値（速いほど高い）。取れない馬はタイムを除いた特徴量だけで採点。{MARK_LEGEND}</p>
    <h3>レース結果（実際の着順）</h3>
    {res === undefined ? <p className="meta">結果を確認中…</p> : !res ? <p className="meta"><b>結果未公開</b></p> : <>
      <div style={{ overflowX: 'auto' }}><table className="horses results-big"><thead><tr><th>着</th><th>馬番</th><th>馬名</th><th>騎手</th><th>タイム</th><th>予想順</th><th>差</th></tr></thead>
        <tbody>{[...res].sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99)).map((r, i) => { const e = findE(r); const pr = predOf(e)
          return <tr key={i}><td>{r.finish ?? '—'}</td><td>{r.umaban ?? e?.umaban ?? '—'}</td><td>{e?.name || r.name}</td><td>{e?.jockey || r.jockey || '—'}</td><td>{r.time ?? '—'}</td><td>{pr ?? '—'}</td><td>{pr && r.finish ? (pr === r.finish ? '◎' : (r.finish - pr > 0 ? '+' : '') + (r.finish - pr)) : ''}</td></tr> })}</tbody></table></div>
      <TrioPayout race={race} preds={preds} />
      <h3>予想順 vs 実着順</h3>
      <div style={{ overflowX: 'auto' }}><table className="horses results-big"><thead><tr><th>予想</th><th>馬</th><th>騎手</th><th>実着順</th></tr></thead>
        <tbody>{preds.map(p => { const h = H[p.horse_id] || {}; const f = finOf[p.horse_id]
          return <tr key={p.horse_id}><td>{p.pred_rank}</td><td className="nowrap">{h.umaban ?? h.gate}<span className="mark-in">{markOf(p.pred_rank)}</span> {h.name}</td><td>{h.jockey || '—'}</td><td>{f != null ? <b>{f}着</b> : '—'}</td></tr> })}</tbody></table></div>
      <p className="meta">出典: 公式成績PDF（results.json）。差 = 実着順 − 予想順（◎は一致）</p></>}
    <h3>順位の理由</h3>
    <ol>{preds.map((p, i) => { const h = H[p.horse_id] || {}; const gap = i > 0 ? `（上位との差 ${(preds[i - 1].score - p.score).toFixed(3)}）` : ''
      return <li key={p.horse_id}><b>{h.umaban ?? h.gate} {h.name}</b>{gap}: {reason(p)}</li> })}</ol>
  </div>
}
