// Loaded only when the ONE shared prediction store refreshes; never by individual views.
import {NearestIndex,setConfidenceIndex} from './confidenceNearest.js'
let loaded=null
async function sha(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function loadConfidenceHistory(fetcher=fetch,now=Date.now){
 const response=await fetcher(`${import.meta.env.BASE_URL}confidence-history-version.json?check=${now()}`,{cache:'no-store'});if(!response.ok)throw new Error('近傍履歴manifestを取得できません')
 const manifest=await response.json()
 if(manifest.schema_version!==1||!manifest.version||!manifest.sha256||manifest.url!=='confidence-history.json')throw new Error('近傍履歴manifestが不正です')
 if(loaded?.version===manifest.version&&loaded.sha===manifest.sha256){setConfidenceIndex(loaded.index);return loaded}
 const response2=await fetcher(`${import.meta.env.BASE_URL}${manifest.url}?v=${encodeURIComponent(manifest.version)}&check=${now()}`,{cache:'no-store'});if(!response2.ok)throw new Error('近傍履歴を取得できません')
 const text=await response2.text();if(await sha(text)!==manifest.sha256)throw new Error('近傍履歴hash不一致。旧方式への代替は行いません')
 const corpus=JSON.parse(text);if(corpus.version!==manifest.version||corpus.rows.length!==manifest.races)throw new Error('近傍履歴の版が一致しません')
 const index=new NearestIndex(corpus);loaded={index,version:manifest.version,sha:manifest.sha256,latest_result_date:manifest.latest_result_date,races:manifest.races};setConfidenceIndex(index);return loaded
}
