import Disclosure from './Disclosure.jsx'
const finishStatus = { dnf: '競走中止', withdrawn: '競走取消', excluded: '競走除外', disqualified: '失格', unknown: '着順なし・要確認' }
function FinishList({ rows }) {
  return <ol className="official-finish-list">{rows.map(f=><li key={f.umaban} className={`official-finish${f.finish>=1&&f.finish<=3?' official-finish-podium':''}`}>
    <span className="official-finish-rank">{f.finish?`${f.finish}着`:finishStatus[f.status]||f.status||'着順なし'}</span>
    <div className="official-finish-horse"><span className="official-finish-number">{f.umaban}番</span><span className="official-finish-name">{f.name||''}</span></div>
  </li>)}</ol>
}
export default function OfficialFinishes({ finishes }) {
  if (!finishes?.length) return null
  const sorted=[...finishes].sort((a,b)=>(a.finish??999)-(b.finish??999))
  const top=sorted.filter(f=>f.finish>=1&&f.finish<=3),rest=sorted.filter(f=>!(f.finish>=1&&f.finish<=3))
  return <section className="official-finishes" aria-label="公式実着順">
    <h4>実着順（公式）</h4><FinishList rows={top} />
    {!!rest.length && <Disclosure label="全着順・競走中止等を見る"><FinishList rows={rest} /></Disclosure>}
  </section>
}
