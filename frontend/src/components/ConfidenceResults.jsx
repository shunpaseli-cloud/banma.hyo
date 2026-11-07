import saved from '../data/confidence-results.json'
import RaceResult from './RaceResult.jsx'
import { reconcileBox } from '../raceResults.js'

export function predictionOf(row) {
  return { horses: row.selection_meta.top3.map(h => h.umaban), tickets: row.tickets,
    recommended: true, savedAt: row.snapshot_saved_at, confidence: row.confidence, stakeYen: row.stake_yen }
}
export function summarizeRows(rows) {
  const summary = { recommended: rows.length, settled: 0, pending: 0, hit: 0, prestart: 0, reference: 0, returnYen: 0, stakeYen: 0 }
  for (const row of rows) {
    const settlement = reconcileBox(row.result, predictionOf(row))
    if (settlement.returnYen == null) { summary.pending++; continue }
    summary.settled++; if (settlement.status === 'hit') summary.hit++
    if (row.snapshot_timing === 'prestart') summary.prestart++; else summary.reference++
    summary.returnYen += settlement.returnYen; summary.stakeYen += row.stake_yen
  }
  return summary
}
const number = n => n == null ? '未保存' : Number(n).toFixed(4)
export default function ConfidenceResults({ date }) {
  const rows = saved.races.filter(r => r.race_date === date && r.recommended === true)
    .sort((a,b) => b.confidence - a.confidence || a.race_no - b.race_no)
  const counts = summarizeRows(rows)
  return <div className="confidence-results">
    <h2>confidence-results · {date}</h2>
    <p className="meta">λモデル由来の保存済み本番BOX推奨のみ・自信度降順。保存済みscore/commentを使用し、結果から予想を再生成しません。</p>
    <p className="count">推奨 {counts.recommended}R ／ 照合 {counts.settled}R（的中 {counts.hit}R）／ 未確定・照合保留 {counts.pending}R</p>
    <p className="meta">照合の内訳: 発走前保存 {counts.prestart}R ／ 発走後保存の参考 {counts.reference}R。実購入記録ではありません。後者を事前成績に含めません。</p>
    <p className="meta">元データ: {saved.meta.source} ／ 保存日時 {saved.meta.snapshot_saved_at} ／ <a href="./confidence-results.json">別管理JSON</a></p>
    {!rows.length && <p className="end">この日の保存済み推奨はありません。推奨外候補は掲載しません。</p>}
    {rows.map((row,i) => {
      const axis=row.selection_meta.axis
      const partners=row.selection_meta.top3.filter(h => Number(h.umaban) !== Number(axis?.umaban))
      const race={ race_id:row.race_id, race_date:row.race_date, race_no:row.race_no, entries:[] }
      return <article className="card" key={row.race_id} data-confidence={row.confidence}>
        <header className="card-head"><span className="rno">#{i+1}</span><div>
          <h2>{row.race_date} {row.race_no}R · 自信度 {row.confidence.toFixed(3)}（{Math.round(row.confidence*100)}%）</h2>
          <p className="meta">{row.race_name} ／ 発走 {row.scheduled_start_at}</p>
        </div></header>
        <div style={{padding:'8px 14px'}}>
          <p><b>三連単3頭BOX・6券</b> ／ 100円×6点＝600円</p>
          <ol className="trio-list">{row.tickets.map(ticket => <li key={ticket.join('-')}>{ticket.join('−')}（100円）</li>)}</ol>
          <p className="meta">保存軸: {axis?.umaban}番{axis?.name} ／ score {number(axis?.score)} ／ past_form {number(axis?.past_form)}</p>
          <p className="meta">保存相手: {partners.map(h => `${h.umaban}番${h.name}（score ${number(h.score)}・past_form ${number(h.past_form)}）`).join(' ／ ')}</p>
          <p className="meta">保存根拠: モデル上位3頭・BOX{row.selection_meta.box_idx.map(n=>n+1).join('')}・past_form閾値 {row.selection_meta.past_form_threshold}・k={row.selection_meta.streak_penalty_k}。未保存の寄与率や理由は補完しません。</p>
          {!!axis?.top_contribs?.length && <p className="meta">軸の保存済み寄与（割合ではありません）: {axis.top_contribs.map(c=>`${c.name}=${c.contrib}（入力${c.value}）`).join(' ／ ')}</p>}
          <div className="selection-comment" style={{whiteSpace:'pre-wrap'}}><b>選定理由comment（保存原文）</b><p>{row.selection_comment}</p></div>
        </div>
        <RaceResult race={race} resultOverride={row.result} predictionOverride={predictionOf(row)} />
      </article>
    })}
  </div>
}
