import RaceResult from './RaceResult.jsx'
export default function MissingSnapshot({race,note}){
 return <article className="card"><div className="recommendation-body"><h2>{race.race_date} {race.race_no}R</h2><p className="notice">{note||'保存予想がありません。'} ライブ再計算による代替は行いません。</p></div><RaceResult race={race} predictionOverride={null}/></article>
}
