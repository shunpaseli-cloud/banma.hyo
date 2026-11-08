import { lazy, Suspense, useEffect, useState } from 'react'
import SnapshotInfo from './components/SnapshotInfo.jsx'
import DataBanner from './components/DataBanner.jsx'
import DatePicker from './components/DatePicker.jsx'
import { DEFAULT_DATE, dayInfo } from './lib/paginate.js'
import { DATA } from './dataSource.js'
const RaceList=lazy(()=>import('./components/RaceList.jsx'))
const ConfidenceRank=lazy(()=>import('./components/ConfidenceRank.jsx'))
const ConfidenceResults=lazy(()=>import('./components/ConfidenceResults.jsx'))

export const VIEWS = new Set(['races', 'confidence', 'results'])

export function canonicalResultsUrl(href){
 const url=new URL(href);if(url.searchParams.get('view')!=='confidence-results')return null
 url.searchParams.set('view','results');return url.href
}

export function viewSearch(date,view) {
  const query=new URLSearchParams({date})
  if(view&&view!=='races')query.set('view',view)
  return `?${query.toString()}`
}

export default function App() {
  const [date, setDate] = useState(() => new URLSearchParams(location.search).get('date') || DEFAULT_DATE)
  const [view, setView] = useState(() => {
    const v = new URLSearchParams(location.search).get('view') || 'races'
    return v==='confidence-results'?'results':VIEWS.has(v) ? v : 'races'
  })
  useEffect(()=>{const next=canonicalResultsUrl(location.href);if(next)history.replaceState(null,'',next)},[])
  const url = (d, v) => {
    history.replaceState(null, '', viewSearch(d,v))
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
        <p>ばんえい競馬 出走表・推奨・公式結果</p>
        <DatePicker date={date} onChange={pick} />
        <nav className="nav">
          <button className={view === 'races' ? 'on' : ''} onClick={() => go('races')}>出走表・予想</button>
          <button className={view === 'confidence' ? 'on' : ''} onClick={() => go('confidence')}>自信度順</button>
          <button className={view === 'results' ? 'on' : ''} onClick={() => go('results')}>結果</button>
        </nav>
        <p className="auto-note">推奨馬・買い目・公式結果を、日付ごとに確認できます。</p>
      </header>
      <SnapshotInfo date={date} view={view}/>
      <main>

        <Suspense fallback={<p className="loading" role="status">表示を読み込んでいます…</p>}>
        {view === 'results' ? (
          <ConfidenceResults date={date} />
        ) : view === 'confidence' ? (
          <ConfidenceRank date={date} />
        ) : day.races.length === 0 ? (
          <p className="end">{date} の出走表データはありません（開催なし、または未取得）。上の「データのある開催日を選ぶ」から日付を選んでください。</p>
        ) : (
          <>
            {banner && <DataBanner data={banner} />}
            <RaceList key={date} date={date} />
          </>
        )}
        </Suspense>
      </main>
      <footer className="foot">予想は参考情報です。未確定の結果は、確定後に照合します。</footer>
    </div>
  )
}
