#!/usr/bin/env python3
"""Build compact outcome corpus from existing fixed-ranking analysis; no predictions/training."""
from pathlib import Path
import json,hashlib,datetime
ROOT=Path(__file__).resolve().parents[1];DATA=Path('/workspace/banma_confidence_backtest_2023_2026')
rows=json.loads((DATA/'prediction_rows.json').read_text());races={r['race_id']:r for r in json.loads((DATA/'canonical_races.json').read_text())};by={r['race_id']:r for r in rows};vectors={}
with (DATA/'horse_feature_audit.jsonl').open() as f:
 for line in f:
  r=json.loads(line);p=by.get(r['race_id'])
  if p and r['horse_no'] in p['box_umaban']:vectors.setdefault(r['race_id'],{})[r['horse_no']]=r
out=[]
for p in rows:
 r=races[p['race_id']];sel=p['box_umaban'];audit=vectors[p['race_id']];weights=[e['sled_weight'] for e in r['entries']];axis=next(e for e in r['entries'] if e['umaban']==sel[0]);w=axis['sled_weight'];rel=(sum(x<w for x in weights)+.5*sum(x==w for x in weights))/len(weights)
 pfs=[round(audit[n]['features'][12],4) if audit[n]['history_starts'] else .5 for n in sel]
 x=[p['axis_past_form'],len(r['entries']),p['moisture'],audit[sel[0]]['features'][28],rel,max(weights)-min(weights),sum(pfs)/3]
 assert all(isinstance(v,(int,float)) for v in x)
 assert len(set(sel))==3 and p['stake_yen']==600
 matches=[a for a in r['trifecta_payouts'] if set(a['combo'])==set(sel)];assert bool(matches)==p['hit'] and sum(a['yen'] for a in matches)==p['return_yen']
 out.append([p['race_id'],x,int(p['hit']),p['return_yen'],sel])
assert len(out)==6751 and max(r[0][:8] for r in out)=='20261107'
policy=json.loads((ROOT/'src/data/confidence_policy.json').read_text());dump=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode();sha=lambda v:hashlib.sha256(v).hexdigest()
version='nearest-history-20261107-'+sha(dump(out))[:12]
corpus={'schema_version':1,'version':version,'features':policy['features'],'latest_result_date':'2026-11-07','rows':out,'provenance':{'source':'NAR official results, frozen Lambda TOP3 BOX6 at100yen/ticket','prediction_origin':'retrospective fixed final normal/rain model; actual measured moisture; NOT saved prestart predictions','original_model_sha256':'877b650d3f340d403ad61667c415c8ee2f1967e76a928466ee31d4436edb55a5','training_overlap_races':1049,'same_day_policy':'No official finalization timestamps; exclude same day entirely','warmup_2022':'empty: no2022 fixed prediction/payout evaluations were generated','source_files':{n:sha((DATA/n).read_bytes()) for n in ['prediction_rows.json','canonical_races.json','horse_feature_audit.jsonl']}}}
raw=dump(corpus);manifest={'schema_version':1,'version':version,'sha256':sha(raw),'url':'confidence-history.json','latest_result_date':'2026-11-07','races':len(out),'built_at_jst':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat()}
(ROOT/'public/confidence-history.json').write_bytes(raw);(ROOT/'public/confidence-history-version.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'version':version,'races':len(out),'bytes':len(raw),'latest':'2026-11-07','features':policy['features']}))
