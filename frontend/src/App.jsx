import { useState } from 'react'
import DataBanner from './components/DataBanner.jsx'
import DatePicker from './components/DatePicker.jsx'
import { DEFAULT_DATE, dayInfo } from './lib/paginate.js'
import { DATA } from './dataSource.js'
import Summary from './components/Summary.jsx'
import RaceList from './components/RaceList.jsx'
import ConfidenceRank from './components/ConfidenceRank.jsx'

const VIEWS = new Set(['races', 'summary', 'confidence'])

export default function App() {
  const [date, setDate] = useState(() => new URLSearchParams(location.search).get('date') || DEFAULT_DATE)
  const [view, setView] = useState(() => {
    const v = new URLSearchParams(location.search).get('view') || 'races'
    return VIEWS.has(v) ? v : 'races'
  })
  const url = (d, v) => {
    const q = new URLSearchParams()
    q.set('date', d)
    if (v && v !== 'races') q.set('view', v)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const pick = d => { setDate(d); url(d, view) }
  const go = v => { setView(v); url(date, v) }
  const day = dayInfo(date)
  const banner = day.races.length === 0 ? null : day.verified
    ? { ...DATA, warning: false, meta: { ...DATA.meta, race_date: date } }
    : { ...DATA, warning: true, source: DATA.source === 'pdf' ? 'seed' : DATA.source }
  return (
    <div className="app">
      <header className="masthead">
        <h1>ばん馬表</h1>
        <p>ばんえい競馬 出走表と予想スコア</p>
        <DatePicker date={date} onChange={pick} />
        <nav className="nav">
          <button className={view === 'races' ? 'on' : ''} onClick={() => go('races')}>出走表・予想</button>
          <button className={view === 'summary' ? 'on' : ''} onClick={() => go('summary')}>日別まとめ</button>
          <button className={view === 'confidence' ? 'on' : ''} onClick={() => go('confidence')}>自信度順</button>
        </nav>
        <p className="auto-note">3連複予想は自動生成 · 自信度順は本番BOX推奨（0.8以上 / 0.7以上の2帯）</p>
      </header>
      <main>
        {view === 'confidence' ? (
          <ConfidenceRank date={date} />
        ) : day.races.length === 0 ? (
          <p className="end">{date} の出走表データはありません（開催なし、または未取得）。上の「データあり」から日付を選んでください。</p>
        ) : (
          <>
            {banner && <DataBanner data={banner} />}
            {view === 'summary' ? <Summary date={date} /> : <RaceList key={date} date={date} />}
          </>
        )}
      </main>
      <footer className="foot">予想スコアは結果のフィードバックで学習し更新されます</footer>
    </div>
  )
}
