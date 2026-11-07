import OfficialFinishes from './OfficialFinishes.jsx'
import Disclosure from './Disclosure.jsx'
import { resultForRace, savedBox, reconcileBox, learningInput, STATUS_LABELS } from '../raceResults.js'
const yen = value => `¥${value.toLocaleString('ja-JP')}`
export default function RaceResult({ race, resultOverride, predictionOverride }) {
  const result = resultOverride ?? resultForRace(race)
  const prediction = predictionOverride ?? savedBox(race.race_id)
  const settlement = reconcileBox(result, prediction)
  const afterStart = prediction?.savedAt && result.start_time_jst && new Date(prediction.savedAt) >= new Date(`${race.race_date}T${result.start_time_jst}:00+09:00`)
  const input = learningInput(race, result)
  const settled=settlement.returnYen!=null
  const status=settled ? `${afterStart ? '参考照合' : '確定'} · ${settlement.status==='hit'?'的中':'不的中'}` : result.status==='final'?'確定 · 照合保留':(['missing','provisional'].includes(result.status)?`結果待ち · ${STATUS_LABELS[result.status]}`:STATUS_LABELS[result.status]||'未取得')
  const exportInput = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${race.race_id}-feedback-input.json`; link.click()
    URL.revokeObjectURL(url)
  }
  return <section className="race-result">
    <div className="result-status-row"><h3>公式結果</h3><span className={`status-badge ${settled?'settled':'pending'}`}>{status}</span></div>
    {afterStart && <p className="notice">発走以後に保存された予想です。参考照合のみで、事前成績に含めません。</p>}
    {!settled && <p className="muted">照合保留: {settlement.reason}。未確定は外れ・0円として扱いません。</p>}
    <OfficialFinishes finishes={result.finishes} />
    <div className="official-payouts">{['trifecta','trio'].map(kind=><p key={kind}><span>{kind==='trifecta'?'三連単':'三連複'} <small>100円当たり</small></span><b>{result.payouts?.[kind]?.length?result.payouts[kind].map(p=>`${p.combo.join('−')} ${yen(p.yen)}`).join(' ／ '):'未確定・未取得'}</b></p>)}</div>
    {settled && <p className="settlement-total">{afterStart?'参考の想定':'保存予想の想定'} · 投資 {yen(prediction.stakeYen)} ／ 払戻 <b>{yen(settlement.returnYen)}</b> ／ 収支 {yen(settlement.profitYen)}</p>}
    <Disclosure label="照合の根拠・出典・学習用入力">
      <p>{STATUS_LABELS[result.status] || '未取得'} · {result.note || '公式データに基づく結果です。'}</p>
      {prediction && <p>保存BOX: {prediction.horses.join('−')} · 保存日時 {prediction.savedAt || '不明'}。実購入記録ではありません。</p>}
      {result.result_retrieved_at && <p>公式結果取得（JST）: {result.result_retrieved_at} ／ 公式確定発表時刻: {result.official_finalized_at || '公表時刻不明（取得時刻とは別）'}</p>}
      {!!result.refunds?.length && <p>返還等: {JSON.stringify(result.refunds)}</p>}
      {result.source_urls?.filter(u=>/^https?:\/\//.test(u)).map(u=><p key={u}><a href={u} target="_blank" rel="noreferrer">公式の結果出典</a></p>)}
      {!!result.crosscheck_sources?.length && <p>複数出典照合: {result.crosscheck_sources.map(source=><a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name} </a>)} · {result.crosschecked_at} JST</p>}
      {input && <button className="link" onClick={exportInput}>学習用結果JSONを保存（学習は未実行）</button>}
    </Disclosure>
  </section>
}
