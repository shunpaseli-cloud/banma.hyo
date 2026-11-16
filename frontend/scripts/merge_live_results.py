"""Merge NAR result-only input into display-only verified data; never prediction history/model."""
import json
import hashlib
from bs4 import BeautifulSoup
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]

def merge(base, raw):
    for row in base['races'].values():
        row.setdefault('result_retrieved_at',base['meta'].get('retrieved_at_asia_tokyo'))
        row.setdefault('retrieval_time_scope','initial batch')
        row.setdefault('official_finalized_at',None)
    for r in raw['races']:
        date=r['date'];no=r['race_no'];rid=f"{date.replace('-','')}-R{no:02d}"
        assert r['source_url'].startswith('https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?')
        old=base['races'].get(rid,{})
        if r['status']!='確定':
            if old.get('status')=='final':continue
            base['races'][rid]={**old,'race_date':date,'race_no':no,'status':'provisional',
                'note':'公式結果未確定・未公表','finishes':[],'payouts':{'trio':None,'trifecta':None},
                'source_urls':[r['source_url']],'result_retrieved_at':r.get('取得時刻JST'),
                'official_finalized_at':None,'retrieval_time_scope':'race'}
            continue
        assert r.get('validation') and all(r['validation'].values()),rid
        top=sorted(r['top3'],key=lambda x:x['着順']);assert [x['着順'] for x in top]==[1,2,3],rid
        payouts={kind:[{'combo':[int(n) for n in p['組合せ'].split('-')],'yen':p['払戻円']} for p in r[label]]
            for kind,label in [('trio','三連複'),('trifecta','三連単')]}
        nums=[x['馬番'] for x in top]
        assert any(p['combo']==nums for p in payouts['trifecta']),rid
        assert any(sorted(p['combo'])==sorted(nums) for p in payouts['trio']),rid
        assert all(isinstance(p['yen'],int) and p['yen']>0 for ps in payouts.values() for p in ps),rid
        finishes=[{'finish':f['着順'],'umaban':f['馬番'],'name':f['馬名'],'status':'finished'} for f in top]
        raw_hash=None
        # Same official HTML captured by the existing fetcher; retain complete finishes without odds/popularity.
        if raw.get('meta',{}).get('raw_dir') and r.get('取得時刻JST'):
            filename=f"R{no:02d}_{r['取得時刻JST'][:19].replace(':','')}.html"
            html_path=Path(raw['meta']['raw_dir'])/filename
            if html_path.exists():
                content=html_path.read_bytes();table=BeautifulSoup(content,'html.parser').find('table')
                cells=[[c.get_text(' ',strip=True) for c in tr.find_all('td')] for tr in table.find_all('tr')[1:]]
                cells=[c for c in cells if c]
                assert len(cells)==r['頭数'],rid
                finishes=[{'finish':int(c[0]) if c[0].isdigit() else None,'umaban':int(c[2]),'name':c[3],
                    'status':'finished' if c[0].isdigit() else {'中止':'dnf','取消':'withdrawn','除外':'excluded','失格':'disqualified'}.get(c[0] or c[11],'unknown')}
                    for c in cells]
                assert [f['umaban'] for f in sorted([f for f in finishes if f['finish']],key=lambda f:f['finish'])[:3]]==nums,rid
                raw_hash=hashlib.sha256(content).hexdigest()
        base['races'][rid]={'race_date':date,'race_no':no,'status':'final','race_name':r.get('競走名'),
            'start_time_jst':r['発走時刻'],'source_urls':[r['source_url']],
            'finishes':finishes,'source_html_sha256':raw_hash,
            'payouts':payouts,'refunds':r.get('返還',[]),'result_retrieved_at':r['取得時刻JST'],
            'official_finalized_at':None,'retrieval_time_scope':'race',
            'note':'公式確定結果。数値着順なしは中止・取消等と区別。公式の確定発表時刻は不明、取得時刻と区別。'}
    date=raw['meta']['date']
    complete=sum(r['status']=='final' for r in base['races'].values() if r.get('race_date')==date)
    base['dates'][date]={'status':'final' if complete==12 else 'provisional','confirmed_races':complete}
    return base

if __name__=='__main__':
    path=ROOT/'src/data/verified_results.json'
    output=merge(json.loads(path.read_text()),json.loads(Path(sys.argv[1]).read_text()))
    text=json.dumps(output,ensure_ascii=False,indent=2)+'\n'
    path.write_text(text);(ROOT/'public/verified-results.json').write_text(text)
    print('Merged display-only official results:',output['dates'])
