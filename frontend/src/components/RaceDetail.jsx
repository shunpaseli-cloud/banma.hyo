import { prevFinish } from '../prevFinish.js'
import { FEATURES, getWeights } from '../feedback.js'
const JP = { weight_pull: '牽引力（馬体重/ソリ重量）', recent_form: '近走成績', gate: '枠順', jockey: '騎手勝率' }
export default function RaceDetail({ race, preds }) {
  const w = getWeights(), H = Object.fromEntries(race.entries.map(h => [h.horse_id, h]))
  const n = preds.length
  const avg = Object.fromEntries(FEATURES.map(f => [f, preds.reduce((s, p) => s + w[f] * (p.features[f] || 0), 0) / n]))
  const reason = p => {
    const d = FEATURES.map(f => [f, w[f] * (p.features[f] || 0) - avg[f]]).sort((a, b) => b[1] - a[1])
    const plus = d.filter(x => x[1] > 0.002).slice(0, 2).map(x => `${JP[x[0]].split('（')[0]}が平均より+${x[1].toFixed(3)}`)
    const minus = d.filter(x => x[1] < -0.002).slice(-1).map(x => `${JP[x[0]].split('（')[0]}が${x[1].toFixed(3)}`)
    return [plus.length ? `強み: ${plus.join('、')}` : '突出した強みなし', minus.length ? `弱み: ${minus.join('')}` : ''].filter(Boolean).join(' ／ ')
  }
  return <div className="detail trio">
    <h3>採点の詳細</h3>
    <p className="meta">スコア = Σ 重み × 特徴量。現在の重み: {FEATURES.map(f => `${JP[f].split('（')[0]} ${w[f].toFixed(3)}`).join('・')}</p>
    <div style={{ overflowX: 'auto' }}><table className="horses"><thead><tr><th>順</th><th>馬</th><th>前走</th>{FEATURES.map(f => <th key={f}>{JP[f].split('（')[0]}</th>)}<th>合計</th></tr></thead>
      <tbody>{preds.map(p => { const h = H[p.horse_id] || {}; return <tr key={p.horse_id}><td>{p.pred_rank}</td><td>{h.umaban ?? h.gate} {h.name}</td><td>{(() => { const q = prevFinish(h.name, race.race_id); return q ? <span>{q.finish != null ? `${q.finish}着` : '—'}<small> ({q.date.slice(5).replace('-','/')} {q.raceNo}R/{q.field}頭)</small></span> : '—' })()}</td>
        {FEATURES.map(f => <td key={f}>{(w[f] * (p.features[f] || 0)).toFixed(3)}<small> ({(p.features[f] || 0).toFixed(2)})</small></td>)}<td><b>{p.score.toFixed(3)}</b></td></tr> })}</tbody></table></div>
    <p className="meta">各欄: 寄与（重み×値）、括弧内は特徴量の値(0〜1)。前走は公式結果PDF（同梱分）から馬名で照合、不明は「—」</p>
    <h3>順位の理由</h3>
    <ol>{preds.map((p, i) => { const h = H[p.horse_id] || {}; const gap = i > 0 ? `（上位との差 ${(preds[i - 1].score - p.score).toFixed(3)}）` : ''
      return <li key={p.horse_id}><b>{h.umaban ?? h.gate} {h.name}</b>{gap}: {reason(p)}</li> })}</ol>
  </div>
}
