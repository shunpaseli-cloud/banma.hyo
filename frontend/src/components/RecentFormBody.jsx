import { officialRecentForm, formatRun } from '../recentFormDisplay.js'

export default function RecentFormBody({ raceId, raceDate, entries = [], boxUmaban = [] }) {
  const box = new Set((boxUmaban || []).map(Number))
  return (
    <div className="kinso-panel" data-recent-form="official">
      <ul className="kinso-list">
        {entries.map(entry => {
          const runs = officialRecentForm(entry.name, raceId, 5).map(run => formatRun(run, raceDate || entry.race_date))
          const isBox = box.has(Number(entry.umaban))
          return (
            <li key={entry.umaban} className={'kinso-horse' + (isBox ? ' is-box' : '')}>
              <div className="kinso-horse-head">
                <b>{entry.umaban}番 {entry.name}</b>
                {isBox && <span className="kinso-mark">BOX</span>}
              </div>
              {runs.length ? (
                <ol className="kinso-runs">
                  {runs.map((run, i) => (
                    <li key={i} className={'kinso-run' + (run.isWin ? ' is-win' : '')}>
                      <span className="kinso-run-date">{run.date}</span>
                      <span className="kinso-run-class">{run.class}</span>
                      <span className="kinso-run-pos">{run.result}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="kinso-empty">未確定</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="kinso-note">公式成績に基づく。記録がない項目は未確定または —。予想の計算には使っていません。</p>
    </div>
  )
}
