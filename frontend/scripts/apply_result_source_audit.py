"""Verify reconciled results and frozen picks, then attach public source agreement evidence only."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]

if __name__=='__main__':
    canonical=json.loads(Path(sys.argv[1]).read_text());audit=json.loads(Path(sys.argv[2]).read_text())
    path=ROOT/'src/data/verified_results.json';data=json.loads(path.read_text())
    saved={r['race_id']:r for r in json.loads((ROOT/'src/data/recommendations.json').read_text())['races']}
    audits={r['race_id']:r for r in audit['races']}
    for row in canonical['races']:
        rid=row['race_id'];actual=data['races'][rid]
        expected_top=[r['馬番'] for r in row['top3']]
        own_top=[r['umaban'] for r in sorted([r for r in actual['finishes'] if r['finish']],key=lambda x:x['finish'])[:3]]
        assert own_top==expected_top,rid
        for kind,label in [('trio','三連複'),('trifecta','三連単')]:
            assert any(p['combo']==[int(n) for n in row[label]['組合せ'].split('-')] and p['yen']==row[label]['払戻円'] for p in actual['payouts'][kind]),rid
        pred=saved[rid];assert pred['confidence']==row['prediction']['confidence'],rid
        if pred['recommended']:
            assert [p['umaban'] for p in pred['selection_meta']['top3']]==row['prediction']['box_umaban'],rid
        links=[]
        for name,source in audits[rid]['user_order_attempts'].items():
            if source.get('status')!='取得成功':continue
            assert source['top3']==row['top3'],rid
            assert source['三連複']==row['三連複'] and source['三連単']==row['三連単'],rid
            links.append({'name':name,'url':source['url'],'fetched_at':source['fetched_at_jst']})
        actual.update(crosscheck_sources=links,crosschecked_at=audit['generated_at_jst'],source_disagreements=row['source_disagreements'])
    text=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text);(ROOT/'public/verified-results.json').write_text(text)
    print('PASS reconciled official + third-party results for',len(canonical['races']),'races; frozen picks/confidence unchanged')
