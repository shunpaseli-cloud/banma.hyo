// Confidence-only application of the exact original recommendation/table implementation.
import {buildSelection} from './boxSelection.js'
import METHOD from './data/confidence_table_meta.json'
export {METHOD}
export function replaceConfidence(row,race,{at=new Date().toISOString(),laterCards=[]}={}){
 if(row.prediction_status!=='available')return row
 // Keep the saved effective moisture and saved horse scores: never regenerate a past prediction.
 const recommendation=buildSelection({...race,track_moisture:row.selection_meta.track_moisture},row.predictions,{laterCards})
 if(recommendation.recommended!==row.recommended||JSON.stringify(recommendation.selection_meta.top3)!==JSON.stringify(row.selection_meta.top3)||recommendation.selection_meta.axis?.horse_id!==row.selection_meta.axis?.horse_id)throw new Error('Confidence-only migration attempted to change horse selection: '+row.race_id)
 const {confidence_status,...saved}=row
 return {...saved,...recommendation,confidence_saved_at:at,confidence_timing:row.scheduled_start_at?(Date.parse(at)<Date.parse(row.scheduled_start_at)?'prestart':'postrace'):'unknown'}
}
