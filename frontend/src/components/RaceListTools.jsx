import {useState} from 'react'
import {accuracyReport,resetModel} from '../feedback.js'
import {autoFetchAll} from '../scraper.js'
export default function RaceListTools({races,onResults}){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),acc=accuracyReport()
 const run=async()=>{if(busy)return;setBusy(true);try{const value=await autoFetchAll(races);if(value.skipped)setMsg(`取得間隔の制限中（あと${value.wait}秒）`);else{setMsg(`結果取得 ${value.results.filter(r=>r.ok).length}R。共通保存版の主予想は変更しません。`);onResults?.(value.results)}}catch(error){setMsg(String(error))}finally{setBusy(false)}}
 return <div><p>端末内の学習件数 {acc.n}。学習は主表示の保存版を更新しません。</p><button className="link" disabled={busy} onClick={run}>結果を自動取得</button><button className="link" onClick={()=>{resetModel();setMsg('端末内の学習をリセットしました。共通保存版は不変です。')}}>端末内の学習をリセット</button>{msg&&<p>{msg}</p>}</div>
}
