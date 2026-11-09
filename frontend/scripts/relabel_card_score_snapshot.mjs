// Model-label update for card-score-age4 (t269u): NEVER regenerate saved horse predictions.
// The new BOX selector only applies to race dates >= effective_from, so every saved row must be
// reproduced exactly by buildSelection; rows are kept byte-for-byte except snapshot_version.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'vite'
import {resultProjection} from './generate_prediction_snapshot.mjs'
const ROOT=path.resolve(import.meta.dirname,'..'),sha=v=>createHash('sha256').update(v).digest('hex'),bytes=v=>Buffer.from(JSON.stringify(v,null,1)+'\n'),read=n=>fs.readFile(path.join(ROOT,'src/data',n)),stamp=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}).replace(' ','T')+'+09:00'
const lock=path.join(ROOT,'.prediction_snapshot.lock'),handle=await fs.open(lock,'wx')
try{
 const old=JSON.parse(await read('prediction_snapshot.json')),generated=stamp(),archiveName='previous-'+old.meta.version,archive=path.join(ROOT,'public/prediction-history',archiveName)
 await fs.mkdir(archive,{recursive:true})
 for(const n of ['prediction-snapshot.json','prediction-version.json','recommendations.json','confidence-results.json','verified-results.json','feedback-inputs.json','results.json']){const data=await fs.readFile(path.join(ROOT,'public',n));let existing;try{existing=await fs.readFile(path.join(archive,n))}catch(e){if(e.code!=='ENOENT')throw e}if(existing&&!existing.equals(data))throw new Error('Old version immutable archive differs '+n);if(!existing)await fs.writeFile(path.join(archive,n),data)}
 const races=JSON.parse(await read('races_from_pdf.json')),byId=new Map(races.map(r=>[r.race_id,r])),server=await createServer({root:ROOT,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true}})
 let card
 try{
  const {buildSelection}=await server.ssrLoadModule('/src/boxSelection.js');card=(await server.ssrLoadModule('/src/cardScoreAge4.js')).CARD
  for(const row of old.races){
   if(row.prediction_status!=='available')continue
   const rec=buildSelection({...byId.get(row.race_id),track_moisture:row.selection_meta.track_moisture},row.predictions,{laterCards:races})
   for(const k of ['recommended','confidence','selection_comment'])if(JSON.stringify(rec[k])!==JSON.stringify(row[k]))throw new Error(`saved ${k} would change: ${row.race_id}`)
   if(JSON.stringify(rec.selection_meta)!==JSON.stringify(row.selection_meta))throw new Error('saved selection_meta would change: '+row.race_id)
  }
 }finally{await server.close()}
 const models={};for(const n of ['learned_model.json','learned_model_rain.json','learned_weights.json','card_history_age4.json'])models[n]=sha(await read(n))
 const engineFiles=['feedback.js','learnScore.js','learnCore.js','moisture.js','memrobo.js','trio.js','selectionReason.js','calculateSnapshot.js','snapshotPolicy.js','confidenceTable.js','boxSelection.js','cardScoreAge4.js'],engine=sha(Buffer.concat(await Promise.all(engineFiles.map(n=>fs.readFile(path.join(ROOT,'src',n))))))
 const version='card4-'+generated.replace(/[-:]/g,'').replace('+0900','JST')+'-'+sha(bytes({models,engine,rows:old.races.map(({snapshot_version,...r})=>r)})).slice(0,12)
 const meta={...old.meta,version,generated_at_asia_tokyo:generated,models,engine,model_label_updated_at:generated,previous_model_label_archive:'prediction-history/'+archiveName+'/',
  card_score_age4:{version:card.version,effective_from_race_date:card.applies_to.effective_from_race_date,history_through:card.history_file.history_through,scope:'4歳以上だけのレースの3頭BOX候補のみ。3歳以下・混合・発効日前は29特徴BOXのまま。点数・見送り・自信度は不変。',saved_rows:'既存保存行は再生成せず不変（snapshot_versionのみ更新）。'}}
 const rows=old.races.map(r=>({...r,snapshot_version:version})),snapshot={schema_version:2,meta,races:rows},results=JSON.parse(await read('verified_results.json')),projection=resultProjection(snapshot,results),recommendations={meta,races:rows.map(({predictions,...r})=>r)}
 const pointer={version,generated_at_asia_tokyo:generated,models,engine,weather_status:meta.weather.status,weather_retrieved_at:meta.weather.retrieved_at,legacy:meta.legacy,confidence_method:meta.confidence_method,confidence_table:meta.confidence_table,card_score_age4:meta.card_score_age4,snapshot_sha256:sha(bytes(snapshot))}
 const outputs={'prediction-snapshot.json':bytes(snapshot),'prediction-version.json':bytes(pointer),'recommendations.json':bytes(recommendations),'confidence-results.json':bytes(projection)}
 for(const [name,data] of Object.entries(outputs)){const history=path.join(ROOT,'public/prediction-history',version,name);await fs.mkdir(path.dirname(history),{recursive:true});await fs.writeFile(history,data,{flag:'wx'});for(const dest of [path.join(ROOT,'public',name),path.join(ROOT,'src/data',name.replace('prediction-snapshot','prediction_snapshot').replace('prediction-version','prediction_version'))]){const tmp=dest+'.tmp';await fs.writeFile(tmp,data);await fs.rename(tmp,dest)}}
 console.log(JSON.stringify({version,rows:rows.length,archive:archiveName,models,engine}))
}finally{await handle.close();await fs.unlink(lock)}
