import {useState,lazy,Suspense} from 'react'
import {listRaces} from '../lib/paginate.js'
import RaceCard from './RaceCard.jsx'
import Disclosure from './Disclosure.jsx'
const RaceListTools=lazy(()=>import('./RaceListTools.jsx'))
const PAGE=2
export default function RaceList({date}){
 const [races,setRaces]=useState(()=>listRaces({limit:PAGE,offset:0,date})),[status,setStatus]=useState({})
 const more=()=>{const next=listRaces({limit:PAGE,offset:races.items.length,date});setRaces(current=>({...next,items:[...current.items,...next.items]}))}
 return <section><div className="count">{races.items.length} / {races.total} レース表示中</div>
  {races.items.map(r=><RaceCard key={r.race_id} race={r} fetchStatus={status[r.race_id]}/>)}
  {races.has_more?<button className="more" onClick={more}>もっと見る</button>:<p className="end">全レースを表示しました</p>}
  <Disclosure label="結果取得・学習ツール"><Suspense fallback={<p>ツールを読み込み中…</p>}><RaceListTools races={races.items} onResults={results=>setStatus(Object.fromEntries(results.map(r=>[r.race_id,r])))}/></Suspense></Disclosure>
 </section>
}
