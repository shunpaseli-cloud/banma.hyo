import Disclosure from './Disclosure.jsx'
import SelectionComment from './SelectionComment.jsx'
import RaceResult from './RaceResult.jsx'

export default function RecommendationCard({ race, rec, tickets, resultOverride, predictionOverride, rank, children }) {
  const axis=rec.selection_meta?.axis
  const partners=(rec.selection_meta?.top3 || []).filter(h=>Number(h.umaban)!==Number(axis?.umaban))
  return <article className="card recommendation-card" data-confidence={rec.confidence} data-snapshot-version={rec.snapshot_version} data-top3={rec.selection_meta?.top3?.map(h=>h.umaban).join("-")}>
    <header className="recommendation-head">
      <div><p className="eyebrow">{race.race_date} · {rank ? `おすすめ ${rank}` : rec.recommended?'推奨':'見送り'} · {rec.snapshot_timing==='postrace'?'事後再計算':rec.snapshot_timing!=='prestart'?'保存時期不明・参考':rec.persistence_status==='unavailable'?'発走前計算・履歴未保存':'発走前保存'}</p><h2>{race.race_no}R <span className="race-title">{race.name || race.race_name || ''}</span></h2></div>
      <p className="confidence-score">自信度 <strong>{Number(rec.confidence).toFixed(3)}</strong></p>
    </header>
    <div className="recommendation-body">
      <div className="horse-picks"><p><span>軸</span><b>{axis ? `${axis.umaban}番 ${axis.name}` : '未保存'}</b></p><p><span>相手</span><b>{partners.length ? partners.map(h=>`${h.umaban}番 ${h.name}`).join(' ／ ') : '未保存'}</b></p></div>
      <SelectionComment rec={rec} />
      <Disclosure label="BOX6券を見る · 各100円／計600円">
        <ol className="ticket-grid">{tickets.map(ticket=><li key={ticket.join('-')}>{ticket.join('−')} <small>100円</small></li>)}</ol>
      </Disclosure>
    </div>
    <RaceResult race={race} resultOverride={resultOverride} predictionOverride={predictionOverride} />
    {children}
  </article>
}
