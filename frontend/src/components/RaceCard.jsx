import {lazy,Suspense,useState} from 'react'
import RecommendationCard from './RecommendationCard.jsx'
import MissingSnapshot from './MissingSnapshot.jsx'
import RaceDetail from './RaceDetail.jsx'
import Disclosure from './Disclosure.jsx'
import {snapshotForRace,predictionOf,SNAPSHOT_ERROR,useSnapshot} from '../predictionSnapshot.js'
import {markOf} from '../marks.js'
const RaceLearning=lazy(()=>import('./RaceLearning.jsx'))
export default function RaceCard({race,onLearn,fetchStatus}){
 const current=useSnapshot(),row=snapshotForRace(race.race_id,current.snapshot),[detail,setDetail]=useState(false)
 if(!row||row.prediction_status!=='available')return <MissingSnapshot race={race} note={SNAPSHOT_ERROR||row?.note}/>
 const byHorse=Object.fromEntries(row.predictions.map(p=>[p.horse_id,p]))
 return <RecommendationCard race={race} rec={row} tickets={row.tickets} predictionOverride={predictionOf(row)}>
  <div className="race-tools">
   <Disclosure label="出走馬・馬場情報を見る"><p className="meta">{race.entries.length}頭 · 計算時の水分 {row.moisture.model_selection_pct}% · {row.moisture.weather_timing==='posthoc_weather'?'事後取得の気象':'取得時の予報'}</p><div className="participants-scroll"><table className="horses"><thead><tr><th>馬番・馬名</th><th>騎手</th><th>斤量</th></tr></thead><tbody>{race.entries.map(h=><tr key={h.horse_id}><td>{h.umaban}<span className="mark-in">{markOf(byHorse[h.horse_id]?.pred_rank)}</span> {h.name}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td></tr>)}</tbody></table></div></Disclosure>
   <button className="link" aria-expanded={detail} onClick={()=>setDetail(!detail)}>{detail?'詳細を閉じる':'レース詳細'}</button>
   {detail&&<RaceDetail rec={row}/>}
   <Disclosure label="着順入力・学習ツール"><Suspense fallback={<p>ツールを読み込み中…</p>}><RaceLearning race={race} row={row} onLearn={onLearn}/></Suspense></Disclosure>
   {fetchStatus&&<p>{fetchStatus.ok?'結果取得済み':'結果未取得'}</p>}
  </div>
 </RecommendationCard>
}
