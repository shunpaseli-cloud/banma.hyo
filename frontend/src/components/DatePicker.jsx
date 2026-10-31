import { DATES } from '../lib/paginate.js'
const shift = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const WD = '日月火水木金土'
export default function DatePicker({ date, onChange }) {
  const i = DATES.indexOf(date)
  const prev = DATES.filter(d => d < date).pop(), next = DATES.find(d => d > date)
  return (
    <div className="datepick">
      <button className="more" disabled={!prev} onClick={() => onChange(prev)}>◀ 前の開催</button>
      <button className="link" onClick={() => onChange(shift(date, -1))}>前日</button>
      <input type="date" value={date} onChange={e => e.target.value && onChange(e.target.value)} />
      <button className="link" onClick={() => onChange(shift(date, 1))}>翌日</button>
      <button className="more" disabled={!next} onClick={() => onChange(next)}>次の開催 ▶</button>
      <div className="count">データあり: {DATES.map(d => <button key={d} className={'chip' + (d === date ? ' on' : '')} onClick={() => onChange(d)}>{d.slice(5)}({WD[new Date(d + 'T00:00:00Z').getUTCDay()]})</button>)}{i < 0 && ' ／ 選択日は未収録'}</div>
    </div>)
}
