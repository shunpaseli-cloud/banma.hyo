import {useState} from 'react'
import {savePrediction,updateWithResult} from '../feedback.js'
import {learningInput,resultForRace} from '../raceResults.js'
export default function RaceLearning({race,row,onLearn}){
 const [fin,setFin]=useState({}),[msg,setMsg]=useState('')
 const input=learningInput(race,resultForRace(race))
 const learn=()=>{
  // Store the displayed snapshot, never a weather-dependent recomputation.
  for(const p of row.predictions)savePrediction(race.race_id,p.horse_id,p.score,p.pred_rank,p.features)
  const result=updateWithResult(race,fin);setMsg(`${result.updated}頭分を端末内で学習しました。共通保存版の予想・モデルファイルは変更していません。`);onLearn?.()
 }
 return <div><p>同じ保存版の予想を入力に使います。端末内の学習で主表示の保存予想は変わりません。</p>{input&&<button className="link" onClick={()=>{setFin(input.results);setMsg('同梱の着順を入力しました。学習は未実行です。')}}>同梱結果を入力欄へ</button>}
  <div className="participants-scroll"><table className="horses"><thead><tr><th>馬</th><th>実着順</th></tr></thead><tbody>{race.entries.map(h=><tr key={h.horse_id}><td>{h.umaban}番 {h.name}</td><td><input aria-label={`${h.umaban}番の実着順`} className="fin" type="number" min="1" max={race.entries.length} inputMode="numeric" value={fin[h.horse_id]||''} onChange={e=>setFin({...fin,[h.horse_id]:e.target.value})}/></td></tr>)}</tbody></table></div>
  <button className="link" onClick={learn}>結果を学習</button>{msg&&<p>{msg}</p>}
 </div>
}
