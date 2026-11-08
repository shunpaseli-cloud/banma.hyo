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
export function ResultRowDetails({row,result}){return <>
 <h3>{row.race_no}R {row.race_name||'レース名未取得'}</h3>
 <p>3頭BOX（順不同）: {row.selection_meta?.top3.map(h=>`${h.umaban}番 ${h.name}`).join(' ／ ')}</p>
 <p>自信度 {Number.isFinite(row.confidence)?row.confidence.toFixed(3):'未取得'} · {!row.recommended?'見送り・購入非推奨':'推奨'}{row.snapshot_timing!=='prestart'?' · 事後再計算・参考':''}</p>
 <h4>三連単BOX6券（各100円）</h4><ol className="results-box-tickets">{row.tickets.map(ticket=><li key={ticket.join('-')}>{ticket.join('−')}</li>)}</ol>
 <SelectionComment rec={row}/><OfficialFinishes finishes={result.finishes}/>
 <div className="results-payouts">{[['trifecta','三連単'],['trio','三連複']].map(([kind,name])=><p key={kind}>{name} {result.payouts?.[kind]?.length?result.payouts[kind].map(p=>`${p.combo.join('−')} ¥${p.yen.toLocaleString('ja-JP')}`).join(' ／ '):'未確定・払戻未取得'}</p>)}</div>
 <p className="meta">保存 {row.snapshot_saved_at} JST · 共通版 {row.snapshot_version}</p><p className="meta">公式確定発表時刻 {result.official_finalized_at||'未取得'}。結果出典の取得 {result.result_source_retrieved_at||result.result_retrieved_at||'未取得'}</p>{(result.source_urls||[]).map((url,i)=><p key={url}><a href={url} target="_blank" rel="noreferrer">結果出典 {i+1}</a></p>)}</>}
function NumberTriplet({numbers,label}){return <span className="results-number-triplet" aria-label={label}>{numbers.map((n,i)=><b key={i}>{n}</b>)}</span>}
export default function ConfidenceResults({date,detailsOpen=false}){
 const current=useSnapshot(),rows=snapshotRows(date,current.snapshot).map(row=>({...row,result:resultForRace(row)})).sort((a,b)=>a.race_no-b.race_no),counts=summarizeRows(rows)
 return <div className="confidence-results results-page">
  <div className="view-heading"><h2>結果 <span>{date}</span></h2><p>全レースをR番号順に、共通の最新版予想と照合します。</p></div>
  <p className="view-status">全 {counts.races}R · 確定照合 {counts.settled}R · 未確定・保留 {counts.pending}R</p>
  <p className="muted">各RのBOX6券を購入した仮定の参考判定です（1券100円・計600円）。見送りは購入推奨ではありません。事後再計算は当時の成績に含めず、旧保存版の事前実績とは分けます。</p>
  {!rows.length?<p className="end">{SNAPSHOT_ERROR||'この日の保存予想はありません。ライブ再計算は行いません。'}</p>:<div className="results-table-wrap"><table className="results-table"><caption>{date} 全レース · BOXは順不同／結果は1→2→3着</caption><colgroup><col className="results-col-r"/><col/><col/><col className="results-col-verdict"/></colgroup><thead><tr><th scope="col">R</th><th scope="col">3頭BOX</th><th scope="col">結果<small>1→2→3着</small></th><th scope="col">判定<small>参考</small></th></tr></thead>
   {rows.map(row=>{const result=row.result,settlement=referenceSettlement(row),top=row.selection_meta?.top3||[],pending=result.status!=='final',finishes=[...(result.finishes||[])].filter(f=>f.finish>=1&&f.finish<=3).sort((a,b)=>a.finish-b.finish),actual=finishes.map(f=>f.umaban),label=pending?(['cancelled','not_held'].includes(result.status)?'取止':'未確定'):settlement.returnYen===null?'照合保留':settlement.status==='hit'?'的中':'不的中'
    return <tbody key={row.race_id}><tr data-confidence={row.confidence} data-snapshot-version={row.snapshot_version} data-top3={top.map(h=>h.umaban).join('-')} data-race-id={row.race_id}>
     <th scope="row" className="results-race-number">{row.race_no}R</th>
     <td data-box-numbers={top.map(h=>h.umaban).join('-')}>{row.prediction_status==='available'?<NumberTriplet numbers={top.map(h=>h.umaban)} label="3頭BOX・順不同"/>:<span>未取得</span>}</td>
     <td data-finish-numbers={pending?'':actual.join('-')}>{pending?<span>未確定</span>:actual.length?<NumberTriplet numbers={actual} label={finishes.map(f=>`${f.finish}着 ${f.umaban}番`).join('、')}/>:<span>未取得</span>}</td>
     <td><strong className={`results-hit ${settlement.status==='hit'?'is-hit':''}`}>{label}</strong></td>
    </tr><tr className="results-detail-row"><td colSpan={4}><Disclosure label={<><span className="results-race-name">{row.race_name||'レース名未取得'}</span><span className="results-detail-label"> 詳細</span>{!row.recommended&&<small> · 見送り</small>}{row.snapshot_timing!=='prestart'&&<small> · 事後参考</small>}</>} initialOpen={detailsOpen}><ResultRowDetails row={row} result={result}/>{!pending&&settlement.returnYen===null&&<p>{settlement.reason}</p>}</Disclosure></td></tr></tbody>})}
  </table></div>}
 </div>
}
