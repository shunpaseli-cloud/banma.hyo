import { useState } from 'react'
import DataBanner from './components/DataBanner.jsx'
import DatePicker from './components/DatePicker.jsx'
import { DEFAULT_DATE, dayInfo } from './lib/paginate.js'
import { DATA } from './dataSource.js'
import RaceList from './components/RaceList.jsx'
export default function App() {
  const [date, setDate] = useState(() => new URLSearchParams(location.search).get('date') || DEFAULT_DATE)
  const pick = d => { setDate(d); history.replaceState(null, '', '?date=' + d) }
  const day = dayInfo(date)
  const banner = day.races.length === 0 ? null : day.verified
    ? { ...DATA, warning: false, meta: { ...DATA.meta, race_date: date } }
    : { ...DATA, warning: true, source: DATA.source === 'pdf' ? 'seed' : DATA.source }
  return (
    <div className="app">
      <header className="masthead">
        <h1>ばん馬表</h1>
        <p>ばんえい競馬 出走表と予想スコア</p>
        <p className="auto-note">表示中の開催日：<strong>{date}</strong>・3連複予想は自動生成</p>
      </header>
      <main>
        <DatePicker date={date} onChange={pick} />
        {banner && <DataBanner data={banner} />}
        {day.races.length === 0
          ? <p className="end">{date} の出走表データはありません（開催なし、または未取得）。上の「データあり」から日付を選んでください。</p>
          : <RaceList key={date} date={date} />}
      </main>
      <footer className="foot">予想スコアは結果のフィードバックで学習し更新されます</footer>
    </div>
  )
}
