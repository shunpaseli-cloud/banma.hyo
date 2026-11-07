import { useState } from 'react'
import { listRaces } from '../lib/paginate.js'
import { accuracyReport, resetModel } from '../feedback.js'
import { autoFetchAll } from '../scraper.js'
import RaceCard from './RaceCard.jsx'
import Disclosure from './Disclosure.jsx'
const PAGE = 2
export default function RaceList({ date }) {
  const [races, setRaces] = useState(() => listRaces({ limit: PAGE, offset: 0, date }))
  const [ver, setVer] = useState(0)
  const more = () => { const p = listRaces({ limit: PAGE, offset: races.items.length, date })
    setRaces(r => ({ ...p, items: [...r.items, ...p.items] })) }
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [status, setStatus] = useState({})
  const autoFetch = async () => {
    if (busy) return
    setBusy(true); setMsg('結果を取得中…')
    try {
      const r = await autoFetchAll(races.items)
      if (r.skipped) setMsg(`前回の取得から60秒以内です（あと${r.wait}秒）`)
      else { const ok = r.results.filter(x => x.ok)
        setStatus(Object.fromEntries(r.results.map(x => [x.race_id, x])))
        setMsg(`取得成功 ${ok.length} / ${r.results.length} レース・学習 ${ok.reduce((s, x) => s + x.updated, 0)} 件`)
        setVer(v => v + 1) }
    } catch (e) { console.error('[autoFetch]', e); setMsg('取得に失敗しました') }
    finally { setBusy(false) }
  }
  const acc = accuracyReport()
  return (
    <section>
      <div className="count">{races.items.length} / {races.total} レース表示中</div>
      <Disclosure label="結果取得・学習ツール"><div className="stats">学習件数 {acc.n}・単勝的中率 {acc.win_rate ?? '—'}・複勝的中率 {acc.place_rate ?? '—'}

        <button className="more" disabled={busy} onClick={autoFetch}>結果を自動取得</button>
        {msg && <div className="count">{msg}</div>}
        <button className="link" onClick={() => { resetModel(); setVer(v => v + 1) }}>学習をリセット</button></div></Disclosure>
      {races.items.map(r => <RaceCard key={r.race_id + ver} race={r} fetchStatus={status[r.race_id]} onLearn={() => setVer(v => v + 1)} />)}
      {races.has_more
        ? <button className="more" onClick={more}>もっと見る</button>
        : <p className="end">全レースを表示しました</p>}
    </section>
  )
}
