// CLI-only append adapter. Saved PRESTART predictions + subsequently FINAL official outcomes.
import {selectionVector} from './confidenceNearest.js'
import {reconcileBox} from './settlement.js'
export function appendFinalOutcomes(corpus,snapshot,results,races){
 const byRace=new Map(races.map(r=>[r.race_id,r])),existing=new Map(corpus.rows.map(r=>[r[0],r])),rows=[...corpus.rows],audit={added:[],already_present:[],skipped:[]}
 for(const row of snapshot.races){
  const result=results.races[row.race_id]
  const skip=reason=>audit.skipped.push({race_id:row.race_id,reason})
  if(!result||result.status!=='final'){skip('result_not_final');continue}
  if(row.prediction_status!=='available'||row.snapshot_timing!=='prestart'||row.persistence_status==='unavailable'||!row.scheduled_start_at||!(Date.parse(row.snapshot_saved_at)<Date.parse(row.scheduled_start_at))){skip('no_saved_prestart_prediction');continue}
  if(result.official_crosscheck?.match===false||!result.source_urls?.some(url=>/^https:\/\/[^/]*keiba\.go\.jp\//.test(url))){skip('official_source_not_verified');continue}
  if(row.tickets.length!==6||new Set(row.tickets.map(t=>t.join('-'))).size!==6||row.stake_yen!==600){skip('invalid_box');continue}
  const vector=selectionVector(byRace.get(row.race_id),row.selection_meta),settled=reconcileBox(result,{recommended:true,tickets:row.tickets,stakeYen:row.stake_yen})
  if(!vector||settled.returnYen===null||!['hit','miss'].includes(settled.status)){skip('missing_features_or_payout_refund_or_ambiguity');continue}
  const tuple=[row.race_id,vector,settled.status==='hit'?1:0,settled.returnYen,row.selection_meta.top3.map(h=>h.umaban)]
  if(existing.has(row.race_id)){if(JSON.stringify(existing.get(row.race_id))!==JSON.stringify(tuple))throw new Error('Outcome/prediction correction requires a separately reviewed history version: '+row.race_id);audit.already_present.push(row.race_id);continue}
  rows.push(tuple);existing.set(row.race_id,tuple);audit.added.push(row.race_id)
 }
 rows.sort((a,b)=>a[0].localeCompare(b[0]));return {rows,audit}
}
