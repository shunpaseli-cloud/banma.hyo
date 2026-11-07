import {useEffect} from 'react'
import Disclosure from './Disclosure.jsx'
import {useSnapshot,refreshSnapshot,adoptLocalSnapshot} from '../predictionSnapshot.js'
export function reloadTarget(href,publishedVersion){const target=new URL(href);if(target.searchParams.get('_snapshot')===publishedVersion)return null;target.searchParams.set('_snapshot',publishedVersion);return target.href}
export default function SnapshotInfo({date,view}){
 const current=useSnapshot(),meta=current.snapshot.meta
 useEffect(()=>{refreshSnapshot({force:true})},[date,view])
 useEffect(()=>{
  const revisit=()=>{if(document.visibilityState!=='hidden')refreshSnapshot({force:true})}
  const interval=setInterval(()=>{if(document.visibilityState!=='hidden')refreshSnapshot()},60000)
  const crossTab=event=>{if(event.key==='banma.snapshot.latestVersion'){adoptLocalSnapshot();refreshSnapshot({force:true})}}
  addEventListener('storage',crossTab);addEventListener('focus',revisit);addEventListener('pageshow',revisit);document.addEventListener('visibilitychange',revisit)
  return()=>{clearInterval(interval);removeEventListener('storage',crossTab);removeEventListener('focus',revisit);removeEventListener('pageshow',revisit);document.removeEventListener('visibilitychange',revisit)}
 },[])
 const old=meta.legacy?.prestart_summary,prefix=`${import.meta.env.BASE_URL}prediction-history/`
 return <aside className="snapshot-info" data-snapshot-version={meta.version}>
  <p className="meta">共通版 {meta.version}<br/>予想更新 {meta.generated_at_asia_tokyo} JST · 最新確認 {current.lastCheckedAt||'確認中'} {current.lastCheckedAt?'JST':''}</p>
  {['checking','refreshing'].includes(current.status)&&<p className="muted" role="status">全画面共通の最新入力を確認中です。</p>}
  {current.status==='stale'&&<p className="notice" role="alert">最新確認できず: {current.error}。表示中は最後に取得できた共通版です。「最新」とは扱いません。</p>}
  {current.persistence==='unavailable'&&<p className="notice">端末に履歴を保存できませんでした。発走前の精度検証用記録としては扱えません。</p>}
  <Disclosure label="共有予想の更新・旧版の事前成績">
   <p>起動・画面/日付変更・再訪と表示中1分ごとに最新入力を確認します。各画面では計算せず、共有ストアが入力変更時だけ全36Rを一括更新します。</p>
   <p>過去のレースを新しい気象で計算した版は事後再計算です。旧版の事前成績には合算しません。発走前の記録と水分予測の正本ログは上書きしません。</p>
   {old&&<p>旧保存版の事前照合: {old.races}R／的中{old.hits}R · 想定投資 ¥{old.stake_yen.toLocaleString()}／払戻 ¥{old.return_yen.toLocaleString()}。新版とは合算しません。</p>}
   <p>ブラウザでの自動更新版は端末の履歴へ別版保存します。公開サーバーへの自動書出しではありません。保存できない場合は明示します。旧保存値は当時のブラウザ表示履歴そのものを証明しません。</p>
   <p><a href={`${prefix}${meta.server_parent_version||meta.version}/prediction-snapshot.json`}>公開保存版の予想・気象・モデルhash</a> · <a href={`${import.meta.env.BASE_URL}${meta.legacy.path}manifest.json`}>旧版保全manifest</a></p>
  </Disclosure>
 </aside>
}
