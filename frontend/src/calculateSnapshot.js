// The ONLY automatic prediction calculation path for every UI view and the CLI.
import {predict} from './feedback.js'
import {buildRaceRecommendation} from './selectionReason.js'
import {setForecastDaily,estimateMoisture,MOISTURE_COEF} from './moisture.js'
import {weatherComplete,timingOf} from './snapshotPolicy.js'
export function calculateRows(races,raw,generated){
 if(raw?.daily)setForecastDaily(raw.daily)
 const rows=races.map(original=>{
  const race=structuredClone(original),start=race.post_time?`${race.race_date}T${race.post_time}:00+09:00`:null
  const identity={race_id:race.race_id,race_date:race.race_date,race_no:race.race_no,race_name:race.name,scheduled_start_at:start,snapshot_saved_at:generated,snapshot_timing:timingOf(generated,start),ticket_yen:100,stake_yen:600}
  if(!weatherComplete(raw,race.race_date))return {...identity,prediction_status:'weather_missing',recommended:null,confidence:null,selection_meta:null,predictions:[],tickets:[],note:'必要な気象入力が欠測。既定水分による代替予測は行いません。'}
  const predictions=predict(race,false),rec=buildRaceRecommendation(race,predictions),[a,b,c]=rec.selection_meta.top3.map(h=>h.umaban)
  return {...identity,...rec,prediction_status:'available',predictions,tickets:[[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]],model:predictions[0]?.model,moisture:{model_selection_pct:predictions[0]?.model?.moist,feature_estimate_pct:estimateMoisture(race.race_date),measured_pct:race.track_moisture??null,source:race.track_moisture!=null?'race_input_measured':'captured_weather',unit:'percentage point',weather_timing:race.race_date<generated.slice(0,10)?'posthoc_weather':'forecast'},formula:MOISTURE_COEF}
 })
 // Canonical JSON representation (auxiliary NaN rates become null).
 return JSON.parse(JSON.stringify(rows))
}
