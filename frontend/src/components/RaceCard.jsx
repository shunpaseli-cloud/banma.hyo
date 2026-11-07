import { resultForRace, learningInput } from '../raceResults.js'
import { TrioPayout } from '../trioPayout.jsx'
import { useMemo, useState } from 'react'
import { predict, updateWithResult } from '../feedback.js'
import { markOf } from '../marks.js'
import RaceDetail from './RaceDetail.jsx'
import Disclosure from './Disclosure.jsx'
import { skipWarnings } from '../skipWarn.js'
import { buildRaceRecommendation } from '../selectionReason.js'
import { analyzeMisses, missWarnings } from '../missAnalysis.js'
export default function RaceCard({ race, onLearn, fetchStatus }) {
  const preds = useMemo(() => predict(race), [race])
  const P = useMemo(()=>Object.fromEntries(preds.map(p=>[p.horse_id,p])),[preds])
  const [open,setOpen]=useState(false),[fin,setFin]=useState({}),[msg,setMsg]=useState(''),[detail,setDetail]=useState(false)
  const skipW=useMemo(()=>skipWarnings(race,preds),[race,preds])
  const rec=useMemo(()=>buildRaceRecommendation(race,preds),[race,preds])
  const warns=useMemo(()=>missWarnings(race),[race])
  const [,setMisses]=useState([])
  const importedInput=learningInput(race,resultForRace(race))
  const learn=()=>{
    predict(race,true)
    const r=updateWithResult(race,fin)
    setMisses(analyzeMisses(race,preds,fin))
    setMsg(`${r.updated}頭分の結果で重みを更新しました`);setOpen(false);onLearn?.()
  }
  const participants=<div className="participants-scroll"><table className="horses participants-table"><thead><tr><th>馬番・馬名</th><th>騎手</th><th>斤量</th>{open&&<th>実着順</th>}</tr></thead><tbody>
    {race.entries.map(h=><tr key={h.horse_id} className={P[h.horse_id]?.pred_rank===1?'top':''}>
      <td>{h.umaban??'—'}<span className="mark-in">{markOf(P[h.horse_id]?.pred_rank)}</span> {h.name}{warns[h.horse_id]&&<span className="warn" title={warns[h.horse_id]}> ⚠</span>}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td>
      {open&&<td><input aria-label={`${h.umaban}番の実着順`} className="fin" type="number" min="1" max={race.entries.length} inputMode="numeric" value={fin[h.horse_id]||''} onChange={event=>setFin({...fin,[h.horse_id]:event.target.value})}/></td>}
    </tr>)}</tbody></table></div>
  return <article className="card race-card">
    <header className="recommendation-head"><div><p className="eyebrow">{race.race_date} · {rec.recommended?'推奨':'見送り'}</p><h2>{race.race_no}R <span className="race-title">{race.name||''}</span></h2></div><p className="confidence-score">自信度 <strong>{Number(rec.confidence).toFixed(3)}</strong></p></header>
    {!!skipW.length&&<p className="notice">条件に注意が必要なレースです。推奨・見送りの表示を確認してください。</p>}
    <TrioPayout race={race} preds={preds} rec={rec} showReason={!detail}/>
    <div className="race-tools">
      {open?participants:<Disclosure label="出走馬・馬場情報を見る"><p className="meta">{race.entries.length}頭 · {race.track_moisture!=null?`馬場水分 ${race.track_moisture}%`:race.track_moisture_est!=null?`予報による推定水分 ${race.track_moisture_est}%`:"馬場水分未取得"}</p>{participants}</Disclosure>}
      <div className="fb">
        {importedInput&&<button className="link" onClick={()=>{setFin(importedInput.results);setOpen(true);setMsg('同梱の確定着順を入力しました。学習・重み更新はまだ実行していません。')}}>同梱結果を入力欄へ</button>}
        {open?<><button className="more small" onClick={learn}>結果を学習</button><button className="link" onClick={()=>setOpen(false)}>入力を閉じる</button></>:<button className="link" onClick={()=>setOpen(true)}>着順を入力して学習</button>}
        <button className="link" aria-expanded={detail} onClick={()=>setDetail(!detail)}>{detail?'詳細を閉じる':'レース詳細'}</button>
      </div>
      {msg&&<p className="msg">{msg}</p>}
      {fetchStatus&&<p className="msg">{fetchStatus.ok?'結果取得済み':'結果を取得できませんでした'}</p>}
      {detail&&<RaceDetail race={race} preds={preds} rec={rec}/>}
    </div>
  </article>
}
