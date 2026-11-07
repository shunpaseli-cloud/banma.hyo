import { resultForRace, savedBox, reconcileBox, learningInput, STATUS_LABELS } from '../raceResults.js'
const finishStatus = { dnf: '競走中止', withdrawn: '競走取消', excluded: '競走除外', unknown: '着順なし・要確認' }
const yen = value => `¥${value.toLocaleString('ja-JP')}`
export default function RaceResult({ race }) {
  const result = resultForRace(race)
  const prediction = savedBox(race.race_id)
  const settlement = reconcileBox(result, prediction)
  const afterStart = prediction?.savedAt && result.start_time_jst && new Date(prediction.savedAt) >= new Date(`${race.race_date}T${result.start_time_jst}:00+09:00`)
  const input = learningInput(race, result)
  const exportInput = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${race.race_id}-feedback-input.json`; link.click()
    URL.revokeObjectURL(url)
  }
  return <section className="race-result" style={{ padding: '8px 14px', borderTop: '1px solid #C9B8A0' }}>
    <h3>実結果・保存予想との照合</h3>
    <p className="meta">結果: {STATUS_LABELS[result.status] || '未取得'}（未取得・未確定は外れや0円ではありません）</p>
    {result.note && <p className="meta">{result.note}</p>}
    {!!result.finishes?.length && <p className="meta">実着順: {[...result.finishes].sort((a,b) => (a.finish ?? 999) - (b.finish ?? 999)).map(f => `${f.finish ? `${f.finish}着` : finishStatus[f.status] || f.status || '着順なし'} ${f.umaban}番${f.name || ''}`).join(' ／ ')}</p>}
    {['trio','trifecta'].map(kind => <p className="meta" key={kind}>{kind === 'trio' ? '三連複' : '三連単'}払戻（100円当たり）: {result.payouts?.[kind]?.length ? result.payouts[kind].map(p => `${p.combo.join('−')} ${yen(p.yen)}`).join(' ／ ') : '未取得・未確定'}</p>)}
    {prediction && <p className="meta">当時の保存BOX6点: {prediction.horses.join('−')}（保存日時 {prediction.savedAt || '不明'}）・{prediction.recommended ? '推奨' : '見送り'}。購入記録ではなく100円×6点の想定照合。</p>}
    {afterStart && <p className="meta">注意: この保存日時は発走以後です。事前予想の成績・実購入の成績としては扱えません（保存済み内容の参考照合）。</p>}
    <p className="meta"><b>{settlement.status === 'hit' ? '的中' : settlement.status === 'miss' ? '外れ' : `照合保留: ${settlement.reason}`}</b>{settlement.returnYen != null && ` ／ 想定投資 ${yen(prediction.stakeYen)}・払戻 ${yen(settlement.returnYen)}・収支 ${yen(settlement.profitYen)}`}</p>
    {!!result.refunds?.length && <p className="meta">返還等: {JSON.stringify(result.refunds)}</p>}
    {result.source_urls?.filter(u => /^https?:\/\//.test(u)).map(u => <p className="meta" key={u}><a href={u} target="_blank" rel="noreferrer">結果出典</a></p>)}
    {input && <button className="link" onClick={exportInput}>学習用結果JSONを保存（学習は未実行）</button>}
  </section>
}
