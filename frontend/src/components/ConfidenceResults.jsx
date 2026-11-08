import {snapshotRows,predictionOf,SNAPSHOT_ERROR,useSnapshot} from '../predictionSnapshot.js'
import {resultForRace,reconcileBox} from '../raceResults.js'
import Disclosure from './Disclosure.jsx'
import SelectionComment from './SelectionComment.jsx'
import OfficialFinishes from './OfficialFinishes.jsx'
export {predictionOf}
export function referenceSettlement(row){const prediction=predictionOf(row);return reconcileBox(row.result,prediction?{...prediction,recommended:true}:null)}
export function summarizeRows(rows){
 const counts={races:rows.length,recommended:rows.filter(r=>r.recommended).length,settled:0,pending:0,reference:0,referenceHit:0,prestart:0,hit:0,returnYen:0,stakeYen:0,prestartReturnYen:0,prestartStakeYen:0}
 for(const row of rows){const settlement=referenceSettlement(row);if(settlement.returnYen===null){counts.pending++;continue}counts.settled++;counts.returnYen+=settlement.returnYen;counts.stakeYen+=row.stake_yen
  if(row.snapshot_timing==='prestart'&&row.recommended&&row.persistence_status!=='unavailable'){counts.prestart++;if(settlement.status==='hit')counts.hit++;counts.prestartReturnYen+=settlement.returnYen;counts.prestartStakeYen+=row.stake_yen}
  else{counts.reference++;if(settlement.status==='hit')counts.referenceHit++}
 }return counts
}
export function ResultRowDetails({row,result}){return <><SelectionComment rec={row}/><p className="meta">保存 {row.snapshot_saved_at} JST · 共通版 {row.snapshot_version}</p><p className="meta">公式確定発表時刻 {result.official_finalized_at||'未取得'}。結果出典の取得 {result.result_source_retrieved_at||result.result_retrieved_at||'未取得'}</p>{(result.source_urls||[]).map((url,i)=><p key={url}><a href={url} target="_blank" rel="noreferrer">結果出典 {i+1}</a></p>)}</>}
export default function ConfidenceResults({date,detailsOpen=false}){
 const current=useSnapshot(),rows=snapshotRows(date,current.snapshot).map(row=>({...row,result:resultForRace(row)})).sort((a,b)=>a.race_no-b.race_no),counts=summarizeRows(rows)
 return <div className="confidence-results results-page">
  <div className="view-heading"><h2>結果 <span>{date}</span></h2><p>全レースをR番号順に、共通の最新版予想と照合します。</p></div>
  <p className="view-status">全 {counts.races}R · 確定照合 {counts.settled}R · 未確定・保留 {counts.pending}R</p>
  <p className="muted">各RのBOX6券を購入した仮定の参考判定です（1券100円・計600円）。見送りは購入推奨ではありません。事後再計算は当時の成績に含めず、旧保存版の事前実績とは分けます。</p>
  {!rows.length?<p className="end">{SNAPSHOT_ERROR||'この日の保存予想はありません。ライブ再計算は行いません。'}</p>:<><p className="results-scroll-hint">狭い画面では一覧を左右にスクロールできます。</p><div className="results-table-scroll" role="region" aria-label={`${date} 全レース結果一覧`} tabIndex={0}><table className="results-table"><caption>{date} 全レースの予想BOX6券・実結果・参考判定</caption><thead><tr><th scope="col">レース名</th><th scope="col">自分の三連単3頭BOX予想（6券）</th><th scope="col">実結果 1−2−3</th><th scope="col">的中か（参考）</th></tr></thead><tbody>
   {rows.map(row=>{const result=row.result,settlement=referenceSettlement(row),top=row.selection_meta?.top3||[],pending=result.status!=='final',label=pending?(['cancelled','not_held'].includes(result.status)?'競走取止・非開催':'未確定'):settlement.returnYen===null?'照合保留':settlement.status==='hit'?'的中':'不的中'
    return <tr key={row.race_id} data-confidence={row.confidence} data-snapshot-version={row.snapshot_version} data-top3={top.map(h=>h.umaban).join('-')} data-race-id={row.race_id}>
     <th scope="row"><strong className="results-race-number">{row.race_no}R</strong><span className="results-race-name">{row.race_name||'レース名未取得'}</span><small>自信度 {Number.isFinite(row.confidence)?row.confidence.toFixed(3):'未取得'}</small>{!row.recommended&&<small>見送り・参考</small>}{row.snapshot_timing!=='prestart'&&<small>事後再計算・参考</small>}<Disclosure label="寸評・保存情報" initialOpen={detailsOpen}><ResultRowDetails row={row} result={result}/></Disclosure></th>
     <td>{row.prediction_status==='available'?<><p className="results-selected">{top.map(h=>`${h.umaban}番 ${h.name}`).join(' ／ ')}</p><ol className="results-box-tickets" aria-label={`${row.race_no}R 三連単BOX6券`}>{row.tickets.map(ticket=><li key={ticket.join('-')}>{ticket.join('−')}</li>)}</ol></>:<p>予想未取得</p>}</td>
     <td>{pending?<p>未確定</p>:<><OfficialFinishes finishes={result.finishes}/><div className="results-payouts">{[['trifecta','三連単'],['trio','三連複']].map(([kind,name])=><p key={kind}>{name} {result.payouts?.[kind]?.length?result.payouts[kind].map(p=>`¥${p.yen.toLocaleString('ja-JP')}`).join(' ／ '):'払戻未取得'}</p>)}</div></>}</td>
     <td><strong className={`results-hit ${settlement.status==='hit'?'is-hit':''}`}>{label}</strong>{!pending&&settlement.returnYen===null&&<small>{settlement.reason}</small>}{row.snapshot_timing!=='prestart'&&<small>事後再計算の参考照合</small>}{!row.recommended&&<small>見送り分の仮定照合</small>}</td>
    </tr>})}
  </tbody></table></div></>}
 </div>
}
