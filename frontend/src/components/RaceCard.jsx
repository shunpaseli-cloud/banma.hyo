import { resultForRace, learningInput } from '../raceResults.js'
import { TrioPayout } from '../trioPayout.jsx'
import { useMemo, useState } from 'react'
import { predict, updateWithResult } from '../feedback.js'
import { trioPredictions, topBox, axisGate, axis3 } from '../trio.js'
import { fmtTime } from '../learnScore.js'
import { markOf, MARK_LEGEND } from '../marks.js'
import RaceDetail from './RaceDetail.jsx'
import { skipWarnings } from '../skipWarn.js'
import { buildRaceRecommendation } from '../selectionReason.js'
import { analyzeMisses, missWarnings } from '../missAnalysis.js'
export default function RaceCard({ race, onLearn, fetchStatus }) {
  const preds = useMemo(() => predict(race), [race])
  const P = Object.fromEntries(preds.map(p => [p.horse_id, p]))
  const max = preds[0]?.score || 1
  const [open, setOpen] = useState(false)
  const [fin, setFin] = useState({})
  const [msg, setMsg] = useState('')
  const [trioOpen, setTrioOpen] = useState(false)
  const [detail, setDetail] = useState(false)
  const trio = useMemo(() => trioPredictions(preds), [preds])
  const box = useMemo(() => topBox(preds), [preds])
  const gate = useMemo(() => axisGate(preds), [preds])
  const ax3 = useMemo(() => axis3(preds), [preds])
  const learned = preds[0]?.finish_score != null
  const skipW = useMemo(() => skipWarnings(race, preds), [race, preds])
  const rec = useMemo(() => buildRaceRecommendation(race, preds), [race, preds])
  const warns = useMemo(() => missWarnings(race), [race])
  const [misses, setMisses] = useState([])
  const H = Object.fromEntries(race.entries.map(h => [h.horse_id, h]))
  const lbl = p => { const h = H[p.horse_id] || {}; return `${h.umaban ?? h.gate ?? '?'}` }
  const importedInput = learningInput(race, resultForRace(race))
  const learn = () => {
    predict(race, true)
    const r = updateWithResult(race, fin)
    setMisses(analyzeMisses(race, preds, fin))
    setMsg(`${r.updated}頭分の結果で重みを更新しました`); setOpen(false); onLearn?.()
  }
  return (
    <article className="card">
      <header className="card-head">
        <span className="rno">{race.race_no}R</span>
        <div>
          <p className="meta">{race.race_date}{race.track_moisture != null ? `・馬場水分 ${race.track_moisture}%` : race.track_moisture_est != null ? `・馬場水分 推定約${race.track_moisture_est}%（天気予報から）` : ''}・{race.entries.length}頭
            {rec.recommended
              ? <span style={{marginLeft:8,color:'#2A6B3C',fontWeight:700}}>推奨・自信度{(rec.confidence*100).toFixed(0)}%</span>
              : <span style={{marginLeft:8,color:'#8A6A3A'}}>見送り</span>}
          </p></div>
      </header>
      {skipW.map(w => <div key={w} className="skipwarn" style={{border:'2px solid #D85A2A',color:'#D85A2A',background:'#F3EEE4',padding:'4px 8px',margin:'6px 0',fontWeight:700}}>⚠ {w}<small style={{color:'#221E18',fontWeight:400}}>（参考表示）</small></div>)}
      <table className="horses">
        <thead><tr><th>枠</th><th>馬番 印</th><th>騎手</th><th>ソリ</th><th>{learned ? '着順スコア' : '予想スコア'}</th>{learned && <th>予想タイム</th>}{open && <th>着</th>}</tr></thead>
        <tbody>
          {race.entries.map(h => { const p = P[h.horse_id]; return (
            <tr key={h.horse_id} className={p.pred_rank === 1 ? 'top' : ''}>
              <td className="gate">{h.gate}</td><td className="nowrap">{h.umaban ?? '—'}<span className="mark-in">{markOf(p.pred_rank)}</span>{warns[h.horse_id] && <span className="warn" title={warns[h.horse_id]}> ⚠</span>}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td>
              <td><div className="bar"><span style={{ width: `${(p.score / max) * 100}%` }} /></div>{p.score.toFixed(3)}</td>{learned && <td className="nowrap">{fmtTime(p.pred_time_sec)}</td>}
              {open && <td><input className="fin" type="number" min="1" max={race.entries.length} inputMode="numeric"
                value={fin[h.horse_id] || ''} onChange={e => setFin({ ...fin, [h.horse_id]: e.target.value })} /></td>}
            </tr>) })}
        </tbody>
      </table>
      <p className="meta legend">{MARK_LEGEND}{learned && `・着順スコア/予想タイム = 時系列学習モデル（${preds[0].model.which === 'rain' ? '☔雨用' : '通常'}・λ=0.92、${preds[0].model.asOf}${preds[0].model.kind === 'snapshot' ? ' より前の結果' : ' までの結果'}で学習）`}</p>
      <div className="fb">
        {importedInput && <button className="link" onClick={() => {
          setFin(importedInput.results); setOpen(true)
          setMsg('同梱の確定着順を入力しました。学習・重み更新はまだ実行していません。')
        }}>同梱結果を入力欄へ（学習は未実行）</button>}
        {open ? <><button className="more small" onClick={learn}>結果を学習</button>
          <button className="link" onClick={() => setOpen(false)}>閉じる</button></>
          : <button className="link" onClick={() => setOpen(true)}>着順を入力して学習</button>}
        <button className="more small" onClick={() => setDetail(!detail)}>{detail ? '詳細を閉じる' : '詳細'}</button>
        {msg && <span className="msg">{msg}</span>}
        {fetchStatus && <span className="msg">{fetchStatus.ok
          ? `結果取得OK（${fetchStatus.source === 'pdf' ? '公式PDF' : 'HTML'}・${fetchStatus.updated}頭）`
          : '⚠ 結果を取得できませんでした'}</span>}
      </div>
      {detail && <RaceDetail race={race} preds={preds} />}
      <TrioPayout race={race} preds={preds} />
      {gate.skip && <div className="skipwarn" style={{border:'2px solid #D85A2A',color:'#221E18',background:'#F3EEE4',padding:'4px 8px',margin:'6px 0'}}>⚠ {gate.reason}</div>}
          </article>
  )
}
