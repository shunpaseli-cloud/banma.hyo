import POLICY from './data/confidence_policy.json'
export {POLICY}
export const raceDate=id=>`${id.slice(0,4)}-${id.slice(4,6)}-${id.slice(6,8)}`
const jstDate=at=>Number.isFinite(Date.parse(at))?new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10):null
const empty=(status,extra={})=>({confidence:0,method:POLICY.version,status,n:0,effective_n:0,hits:0,hit_rate:0,roi_multiple:0,payout_yen:0,calibrated_probability:false,...extra})
export function selectionVector(race,meta){
 const top=meta?.top3||[],axis=meta?.axis,entries=race?.entries||[],sleds=entries.map(e=>e.sled_weight)
 const entry=entries.find(e=>Number(e.umaban??e.gate)===Number(axis?.umaban))
 if(!axis||top.length!==3||!entries.length||!sleds.every(Number.isFinite)||!Number.isFinite(entry?.sled_weight))return null
 const pf=top.map(h=>h.past_form),m=meta.track_moisture
 if(!Number.isFinite(axis.past_form)||!pf.every(Number.isFinite)||!Number.isFinite(m))return null
 const rel=(sleds.filter(w=>w<entry.sled_weight).length+.5*sleds.filter(w=>w===entry.sled_weight).length)/sleds.length
 return [axis.past_form,entries.length,m,meta.is_grade?1:0,rel,Math.max(...sleds)-Math.min(...sleds),pf.reduce((s,p)=>s+p,0)/3]
}
export class NearestIndex{
 constructor(corpus){
  if(corpus.schema_version!==1||JSON.stringify(corpus.features)!==JSON.stringify(POLICY.features)||!Array.isArray(corpus.rows))throw new Error('Invalid nearest corpus schema/features')
  this.version=corpus.version;this.rows=[...corpus.rows].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);this.latest=corpus.latest_result_date;this.d=POLICY.features.length
  const seen=new Set();this.sum=new Float64Array((this.rows.length+1)*this.d);this.squares=new Float64Array(this.sum.length)
  for(let i=0;i<this.rows.length;i++){
   const [id,x,hit,payout]=this.rows[i]
   if(!/^\d{8}-R\d{2}$/.test(id)||seen.has(id)||!Array.isArray(x)||x.length!==this.d||!x.every(Number.isFinite)||![0,1].includes(hit)||!Number.isFinite(payout)||payout<0||(!hit&&payout!==0))throw new Error('Invalid nearest record '+id)
   seen.add(id);for(let j=0;j<this.d;j++){this.sum[(i+1)*this.d+j]=this.sum[i*this.d+j]+x[j];this.squares[(i+1)*this.d+j]=this.squares[i*this.d+j]+x[j]*x[j]}
  }
 }
 query(vector,targetDate,observedAt,targetId=null){
  const observedDate=jstDate(observedAt)
  if(!observedDate||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate))return empty('invalid_time')
  const cutoff=targetDate<observedDate?targetDate:observedDate
  const audit={corpus_version:this.version,corpus_latest_result_date:this.latest,cutoff_exclusive_date:cutoff}
  if(!Array.isArray(vector)||vector.length!==this.d||!vector.every(Number.isFinite))return empty('missing_features',audit)
  let lo=0,hi=this.rows.length
  while(lo<hi){const mid=(lo+hi)>>1;if(raceDate(this.rows[mid][0])<cutoff)lo=mid+1;else hi=mid}
  const eligible=lo;if(!eligible)return empty('insufficient_history',{...audit,eligible_count:0,query_features:vector,neighbors:[]})
  const mean=[],scale=[]
  for(let j=0;j<this.d;j++){mean[j]=this.sum[eligible*this.d+j]/eligible;const v=this.squares[eligible*this.d+j]/eligible-mean[j]*mean[j];scale[j]=v>1e-12?Math.sqrt(v):1}
  const neighbors=[]
  for(let i=0;i<eligible;i++){
   const row=this.rows[i];if(row[0]===targetId)continue
   let squared=0;for(let j=0;j<this.d;j++){const z=(vector[j]-row[1][j])/scale[j];squared+=z*z}
   const distance=Math.sqrt(squared),last=neighbors.at(-1)
   if(neighbors.length===POLICY.k&&(distance>last.distance||distance===last.distance&&row[0]>=last.race_id))continue
   const candidate={race_id:row[0],distance,hit:row[2],payout_yen:row[3]};let at=0
   while(at<neighbors.length&&(neighbors[at].distance<distance||neighbors[at].distance===distance&&neighbors[at].race_id<row[0]))at++
   neighbors.splice(at,0,candidate);if(neighbors.length>POLICY.k)neighbors.pop()
  }
  const n=neighbors.length;if(!n)return empty('insufficient_history',{...audit,eligible_count:eligible,neighbors:[]})
  const hits=neighbors.reduce((s,r)=>s+r.hit,0),payout=neighbors.reduce((s,r)=>s+r.payout_yen,0),H=hits/n,R=payout/(POLICY.stake_yen_per_race*n),shrink=Math.min(n/POLICY.minimum_reliable_n,1)
  const confidence=shrink*(POLICY.hit_weight*H+POLICY.roi_weight*R/(1+R))
  return {confidence,method:POLICY.version,status:n<POLICY.minimum_reliable_n?'insufficient_history':'ready',n,effective_n:n,eligible_count:eligible,hits,hit_rate:H,roi_multiple:R,payout_yen:payout,shrinkage:shrink,calibrated_probability:false,...audit,query_features:vector,normalization:{mean,scale},mean_distance:neighbors.reduce((s,r)=>s+r.distance,0)/n,max_distance:neighbors.at(-1).distance,neighbors}
 }
}
let active=null
export const setConfidenceIndex=index=>{active=index}
export const getConfidenceIndex=()=>active
export function confidenceForSelection(race,meta,{index=active,at=new Date().toISOString()}={}){
 if(!index)return empty('corpus_unavailable')
 return index.query(selectionVector(race,meta),race.race_date,at,race.race_id)
}
export function replaceConfidence(row,race,{index=active,at}={}){
 if(row.prediction_status!=='available')return row
 const stats=confidenceForSelection(race,row.selection_meta,{index,at}),c=stats.confidence
 const {confidence_bands,...meta}=row.selection_meta
 const timing=!row.scheduled_start_at?'unknown':Date.parse(at)<Date.parse(row.scheduled_start_at)?'prestart':'postrace'
 return {...row,confidence:c,confidence_saved_at:at,confidence_timing:timing,confidence_status:stats.status,selection_comment:(row.selection_comment||'').split('自信度 ')[0]+'自信度は近傍の的中と払戻に基づく合成指標で、的中確率ではありません。',selection_meta:{...meta,confidence:c,confidence_label:c>=.75?'高':c>=.55?'中':c>=.4?'やや低':'低',confidence_source:POLICY.version,confidence_stats:stats}}
}
