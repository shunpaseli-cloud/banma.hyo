import RecommendationCard from './RecommendationCard.jsx'
import {snapshotRows,predictionOf,SNAPSHOT_ERROR,useSnapshot} from '../predictionSnapshot.js'
export default function ConfidenceRank({date}){
 const current=useSnapshot()
 const rows=snapshotRows(date,current.snapshot).filter(r=>r.prediction_status==='available'&&r.recommended&&r.confidence>=.7).sort((a,b)=>b.confidence-a.confidence||a.race_no-b.race_no)
 return <div className="confidence-rank"><p className="count">{date} 自信度順 · 同じ保存版の推奨 {rows.length}レース</p>
  {!rows.length&&<p className="end">{SNAPSHOT_ERROR||`自信度0.7以上の保存済み推奨はありません（対象: ${date}）。ライブ再計算は行いません。`}</p>}
  {[{title:'自信度 0.8以上',test:r=>r.confidence>=.8},{title:'自信度 0.7以上（0.8未満）',test:r=>r.confidence<.8}].map(band=><section className="conf-band" key={band.title}><h2 className="conf-band-title">{band.title}</h2>{rows.filter(band.test).map((row,i)=><RecommendationCard key={row.race_id} rank={i+1} race={{race_id:row.race_id,race_date:row.race_date,race_no:row.race_no,name:row.race_name,entries:[]}} rec={row} tickets={row.tickets} predictionOverride={predictionOf(row)}/>)}</section>)}
 </div>
}
