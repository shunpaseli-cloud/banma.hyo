"""Materialize EXISTING frozen recommendations; no prediction/model imports or calls."""
import hashlib
import itertools
import json
from datetime import datetime,timezone,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def materialize(snapshot, schedules, results, source_hash):
    if snapshot.get('meta', {}).get('version'):
        rows=[]
        for row in snapshot['races']:
            if row.get('snapshot_version') != snapshot['meta']['version']:
                raise ValueError('Prediction version mismatch; refusing legacy regeneration')
            result=results.get('races', {}).get(row['race_id'], {'status':'missing','finishes':[]})
            payouts=result.get('payouts', {}).get('trifecta') or []
            known=result.get('status')=='final' and bool(payouts) and not result.get('refunds') and all(isinstance(p.get('yen'),int) and p['yen']>0 for p in payouts) and all(f.get('status','finished') in ['finished','dnf'] for f in result.get('finishes',[]))
            hit=any(p['combo'] in row['tickets'] for p in payouts) if known else None
            pre=row.get('snapshot_timing')=='prestart'
            rows.append({**row,'result':result,'hit':hit if pre and row.get('recommended') else None,'reference_box_hit':hit if not pre or not row.get('recommended') else None,'evaluation_status':'postrace_reference' if not pre else 'nonrecommended_reference' if not row.get('recommended') else 'pending' if hit is None else 'evaluated'})
        return {'schema_version':2,'meta':snapshot['meta'],'races':rows}
    by_id={r['race_id']:r for r in schedules}
    rows=[]
    for rec in snapshot['races']:
        if rec['recommended'] is not True:continue
        race=by_id[rec['race_id']];meta=rec['selection_meta'];horses=[r['umaban'] for r in meta['top3']]
        assert len(set(horses))==3 and meta['box_idx']==[0,1,2]
        start=f"{race['race_date']}T{race['post_time']}:00+09:00"
        saved=snapshot['meta']['generated_at_asia_tokyo']
        result=results['races'].get(rec['race_id'],{'status':'missing','finishes':[]})
        prestart=datetime.fromisoformat(saved)<datetime.fromisoformat(start)
        confirmed=result['status']=='final' and bool(result.get('payouts',{}).get('trifecta'))
        hit=any(sorted(p['combo'])==sorted(horses) for p in result.get('payouts',{}).get('trifecta') or []) if confirmed else None
        rows.append({**rec,'tickets':[list(t) for t in itertools.permutations(horses)],'ticket_yen':100,'stake_yen':600,
            'snapshot_saved_at':saved,'scheduled_start_at':start,
            'snapshot_timing':'prestart' if prestart else 'poststart',
            'evaluation_status':'reference_only' if not prestart else 'evaluated' if confirmed else 'pending',
            'hit':hit if prestart and confirmed else None,
            'reference_box_hit':hit if not prestart else None, 'result':result})
    rows.sort(key=lambda r:(-r['confidence'],r['race_date'],r['race_no']))
    return {'schema_version':1,'meta':{'materialized_at':datetime.now(timezone(timedelta(hours=9))).isoformat(),
        'snapshot_saved_at':snapshot['meta']['generated_at_asia_tokyo'],'source':'src/data/recommendations.json',
        'source_sha256':source_hash,'config':snapshot['meta']['config'],
        'note':'保存済み本番λモデル由来推奨のみ。予測・confidence・選定commentを再生成しない。6券各100円、実購入記録ではない。'},'races':rows}

if __name__=='__main__':
    path=ROOT/'src/data/prediction_snapshot.json'
    if not path.exists(): path=ROOT/'src/data/recommendations.json'
    raw=path.read_bytes()
    output=materialize(json.loads(raw),json.loads((ROOT/'src/data/races_from_pdf.json').read_text()),
        json.loads((ROOT/'src/data/verified_results.json').read_text()),hashlib.sha256(raw).hexdigest())
    text=json.dumps(output,ensure_ascii=False,indent=2)+'\n'
    for path in [ROOT/'src/data/confidence-results.json',ROOT/'public/confidence-results.json']:path.write_text(text)
    print('Materialized',len(output['races']),'saved races; version',output['meta'].get('version',output['meta'].get('source_sha256')))
