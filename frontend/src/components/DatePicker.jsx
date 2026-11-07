import { DATES } from '../lib/paginate.js'
import Disclosure from './Disclosure.jsx'
const shift=(d,n)=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
const WD='日月火水木金土'
export default function DatePicker({date,onChange}) {
  const prev=DATES.filter(d=>d<date).pop(),next=DATES.find(d=>d>date)
  return <div className="datepick">
    <div className="daterow"><button className="link" onClick={()=>onChange(shift(date,-1))}>前日</button><input aria-label="表示日" type="date" value={date} onChange={event=>event.target.value&&onChange(event.target.value)}/><button className="link" onClick={()=>onChange(shift(date,1))}>翌日</button></div>
    <Disclosure label="データのある開催日を選ぶ"><div className="date-shortcuts"><button className="link" disabled={!prev} onClick={()=>onChange(prev)}>前の開催</button><button className="link" disabled={!next} onClick={()=>onChange(next)}>次の開催</button></div><div className="date-chips">{DATES.map(d=><button key={d} className={'chip'+(d===date?' on':'')} onClick={()=>onChange(d)}>{d.slice(5)}({WD[new Date(d+'T00:00:00Z').getUTCDay()]})</button>)}</div></Disclosure>
    {!DATES.includes(date)&&<p className="muted">選択日は未収録です。</p>}
  </div>
}
