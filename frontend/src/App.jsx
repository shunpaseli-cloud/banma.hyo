import DataBanner from './components/DataBanner.jsx'
import { UPCOMING } from './lib/paginate.js'
import RaceList from './components/RaceList.jsx'
export default function App() {
  return (
    <div className="app">
      <header className="masthead">
        <h1>ばん馬表</h1>
        <p>ばんえい競馬 出走表と予想スコア</p>
        <p className="auto-note">直近レースを自動表示：{UPCOMING.date ?? '—'}{UPCOMING.upcoming ? '' : '（最新開催）'}・3連複予想は自動生成</p>
      </header>
      <main><DataBanner /><RaceList /></main>
      <footer className="foot">予想スコアは結果のフィードバックで学習し更新されます</footer>
    </div>
  )
}
