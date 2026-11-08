#!/usr/bin/env python3
"""Merge verified result/source fields ONLY; never read incoming prediction objects."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];source=Path('/tmp/banma_results_app_import_2026-11-06_08.json');incoming=json.loads(source.read_text());p=root/'src/data/verified_results.json';out=json.loads(p.read_text());final=pending=0
assert len(incoming['races'])==36 and len({r['race_id'] for r in incoming['races']})==36
for row in incoming['races']:
 key=row['race_id'];r=out['races'].get(key,{'race_date':row['date'],'race_no':row['race_no'],'status':'missing','finishes':[],'payouts':{'trio':[],'trifecta':[]},'refunds':[],'source_urls':[],'official_finalized_at':None})
 if row['status']=='確定':
  final+=1;assert r['status']=='final';assert row['official_crosscheck']['match'] is True
  assert [(x['finish'],x['umaban'],x['name']) for x in r['finishes'] if x['finish'] in [1,2,3]]==[(x['着順'],x['馬番'],x['馬名']) for x in row['top3']]
  for src,dst in [('三連複','trio'),('三連単','trifecta')]:
   value=row[src];expected=[{'combo':list(map(int,value['組合せ'].split('-'))),'yen':value['払戻円']}];assert r['payouts'][dst]==expected,(key,src)
 else:
  pending+=1;assert row['status']=='未確定' and row['top3'] is None and row['三連単'] is None
  assert r['status']!='final';r['status']='provisional';r['note']='結果未確定。的中/外れ・払戻0円として集計しません。'
 r.update({'umanity_race_id':row['umanity_race_id'],'result_source':row['result_source'],'result_source_url':row['result_source_url'],'result_source_retrieved_at':row['result_fetched_at_jst'],'official_crosscheck':row['official_crosscheck'],'official_measured_moisture_pct':row.get('馬場水分%'),'official_moisture_source':row.get('馬場水分_source'),'start_time_jst':row['発走時刻']})
 r['source_urls']=list(dict.fromkeys(r.get('source_urls',[])+[row['result_source_url']]+([row['official_crosscheck']['url']] if row['official_crosscheck'] else [])))
 out['races'][key]=r
assert (final,pending)==(24,12)
out['meta']['additional_result_source']='umanity result-only import;24final crosschecked NAR,12pending; incoming predictions ignored'
raw=json.dumps(out,ensure_ascii=False,indent=2)+'\n';p.write_text(raw);(root/'public/verified-results.json').write_text(raw)
print(json.dumps({'races':36,'final':final,'pending':pending,'disagreements':0,'incoming_predictions':'ignored','full_official_finishes_payouts_refunds':'preserved'}))
