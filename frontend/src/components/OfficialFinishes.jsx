const finishStatus = { dnf: '競走中止', withdrawn: '競走取消', excluded: '競走除外', unknown: '着順なし・要確認' }

// Presentation only: keep the official finish order/data separate from prediction ranks.
export default function OfficialFinishes({ finishes }) {
  if (!finishes?.length) return null
  return <section className="official-finishes" aria-label="公式実着順">
    <h4>実着順（公式）</h4>
    <ol className="official-finish-list">
      {[...finishes].sort((a,b) => (a.finish ?? 999) - (b.finish ?? 999)).map(f => (
        <li key={f.umaban} className={`official-finish${f.finish >= 1 && f.finish <= 3 ? ' official-finish-podium' : ''}`}>
          <span className="official-finish-rank">{f.finish ? `${f.finish}着` : finishStatus[f.status] || f.status || '着順なし'}</span>
          <div className="official-finish-horse">
            <span className="official-finish-number">{f.umaban}番</span>
            <span className="official-finish-name">{f.name || ''}</span>
          </div>
        </li>
      ))}
    </ol>
  </section>
}
