import RaceList from './components/RaceList.jsx'
export default function App() {
  return (
    <div className="app">
      <header className="masthead">
        <h1>ばん馬表</h1>
        <p>ばんえい競馬 出走表と予想スコア</p>
      </header>
      <main><RaceList /></main>
      <footer className="foot">予想スコアは結果のフィードバックで学習し更新されます</footer>
    </div>
  )
}
