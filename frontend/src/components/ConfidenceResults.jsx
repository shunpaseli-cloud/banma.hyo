import {snapshotRows,predictionOf,SNAPSHOT_ERROR,SNAPSHOT_META,useSnapshot} from '../predictionSnapshot.js'
import {resultForRace} from '../raceResults.js'
import RecommendationCard from './RecommendationCard.jsx'
import Disclosure from './Disclosure.jsx'
import { reconcileBox } from '../raceResults.js'

export {predictionOf}
export function summarizeRows(rows) {
  const summary = { recommended: rows.length, settled: 0, pending: 0, hit: 0, prestart: 0, reference: 0, returnYen: 0, stakeYen: 0, prestartReturnYen: 0, prestartStakeYen: 0, referenceHit: 0 }
  for (const row of rows) {
    const settlement = reconcileBox(row.result, predictionOf(row))
    if (settlement.returnYen == null) { summary.pending++; continue }
    summary.settled++
    if (row.snapshot_timing === 'prestart' && row.persistence_status!=='unavailable') {
      summary.prestart++; if (settlement.status === 'hit') summary.hit++
      summary.prestartReturnYen += settlement.returnYen; summary.prestartStakeYen += row.stake_yen
    } else { summary.reference++; if (settlement.status === 'hit') summary.referenceHit++ }
    summary.returnYen += settlement.returnYen; summary.stakeYen += row.stake_yen
  }
  return summary
}
export default function ConfidenceResults({ date }) {
  const current=useSnapshot()
  const rows = snapshotRows(date,current.snapshot).filter(r=>r.prediction_status==='available'&&r.recommended===true).map(r=>({...r,result:resultForRace(r)}))
    .sort((a,b) => b.confidence - a.confidence || a.race_no - b.race_no)
  const counts = summarizeRows(rows)
  return <div className="confidence-results">
    <div className="view-heading"><h2>推奨・結果 <span>{date}</span></h2><p>保存した推奨を、自信度の高い順に表示します。</p></div>
    <p className="view-status">推奨 {counts.recommended}R · 事前照合 {counts.prestart}R／的中 {counts.hit}R · 結果待ち・保留 {counts.pending}R{counts.reference > 0 && ` · 事後再計算の参考 ${counts.reference}R`}</p>
    <Disclosure label="保存時刻・集計・元データ">
      <p>事前保存分のみ: {counts.prestart > 0 ? `想定投資 ¥${counts.prestartStakeYen.toLocaleString()}／払戻 ¥${counts.prestartReturnYen.toLocaleString()}` : '金額集計対象なし。未確定を0円にしません。'}</p>
      <p>事後再計算の参考照合は事前成績に含めません。実購入記録ではありません。</p>
      <p>保存日時 {current.snapshot.meta.generated_at_asia_tokyo} · <span>各画面共通の版 {current.snapshot.meta.version}</span></p>
    </Disclosure>
    {!rows.length && <p className="end">{SNAPSHOT_ERROR||"この日の保存済み推奨はありません。ライブ再計算は行いません。"}</p>}
    {rows.map((row,i) => <RecommendationCard key={row.race_id} rank={i+1}
      race={{race_id:row.race_id,race_date:row.race_date,race_no:row.race_no,name:row.race_name,entries:[]}}
      rec={row} tickets={row.tickets} resultOverride={row.result} predictionOverride={predictionOf(row)} />)}
  </div>
}
