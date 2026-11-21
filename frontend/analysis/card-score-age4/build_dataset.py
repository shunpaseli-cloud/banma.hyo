"""Unify 2022 warmup (canonical) + 2023+ clean official data into compact race list."""
import json, unicodedata, re
CLEAN='/workspace/banma_official_pdf_audit_2023_onward/clean_results_2023_onward.json'
CANON='/workspace/banma_lambda_confidence_experiment/inputs/canonical_races.json'
N=lambda s: unicodedata.normalize('NFKC', s or '')
LAD={'A1':1,'A2':2,'B1':3,'B2':4,'B3':5,'B4':6,'C1':7,'C2':8}
def parse_class(name):
    n=N(name).replace(' ','').replace('\u3000','')
    ms=list(re.finditer(r'([23])歳([A-D])(?:-(\d+))?', n)); m=ms[-1] if ms else None
    if m: return ('Y', 'ABCD'.index(m.group(2))+1 + (int(m.group(3))/20 if m.group(3) else 0.0), m.group(0))
    ms=list(re.finditer(r'([ABC][12]|B[34])(?:-(\d+))?', n)); m=ms[-1] if ms else None
    if m: return ('G', LAD[m.group(1)] + (int(m.group(2))/20 if m.group(2) else 0.0), m.group(0))
    if 'オープン' in n: return ('G', 0.0, 'オープン')
    if '選抜' in n: return (('Y',0.5,'2歳選抜') if '2歳選抜' in n else ('G',0.0,'選抜'))
    if n.endswith('2歳新馬'): return ('Y', 5.0, '2歳新馬')
    return (None, None, None)
races=[]
for r in json.load(open(CANON)):
    if r['year']!=2022: continue
    hs=[]
    for e in r['entries']:
        st={'finished':'finished','競走中止':'did_not_finish','失格':'disqualified'}[e['status']]
        hs.append(dict(no=e['umaban'],key=N(e['name'])+'|'+str(e['birth_date']),age=int(e['age']),sex=e['sex'],birth=str(e['birth_date']),w=e['sled_weight'],jockey=e['jockey'],finish=e['finish'],status=st,starter=True,popularity=None))
    ct,cv,craw=parse_class(r['name'])
    races.append(dict(rid=r['race_id'],date=r['date'],name=r['name'],ctype=ct,cval=cv,craw=craw,horses=hs,
        trifecta=[x['combo'] for x in r['trifecta_payouts']],tri_yen=[x['yen'] for x in r['trifecta_payouts']],pdf_verified=None,src='canonical2022'))
clean=json.load(open(CLEAN))['races']
for r in clean:
    if r['status']!='final': continue
    m=r['metadata']
    rid=[s for s in r['source_race_ids'] if re.fullmatch(r'\d{8}-R\d\d',s)]
    rid=rid[0] if rid else r['date'].replace('-','')+'-R%02d'%r['race_no']
    hs=[]
    for h in r['horses']:
        if h['status']=='race_canceled': continue
        hs.append(dict(no=h['horse_no'],key=N(h['name'])+'|'+str(h.get('birth_date')),age=h.get('age'),sex=h.get('sex'),birth=str(h.get('birth_date')),
            w=h.get('sled_weight_kg'),jockey=h.get('jockey'),finish=h.get('finish'),status=h['status'],starter=bool(h.get('actual_starter')),popularity=h.get('popularity')))
    ct,cv,craw=parse_class(m.get('race_name_official') or '')
    if ct is None: ct,cv,craw=parse_class(m.get('race_class_raw') or '')
    tri=r['payouts'].get('trifecta') or []
    races.append(dict(rid=rid,cid=r['canonical_id'],date=r['date'],name=m.get('race_name_official'),ctype=ct,cval=cv,craw=craw,age_cond=m.get('age_condition_raw'),horses=hs,
        trifecta=[x['combination'] for x in tri],tri_yen=[x['yen_per_100'] for x in tri],pdf_verified=(r['audit']['overall']=='PDF_four_fields_verified'),src='clean'))
races.sort(key=lambda x:(x['date'],x['rid']))
json.dump(races,open('races_unified.json','w'),ensure_ascii=False)
import collections
print(len(races), collections.Counter(r['src'] for r in races), collections.Counter(r['ctype'] for r in races))
print('no trifecta',sum(1 for r in races if not r['trifecta']), 'dup rid', len(races)-len(set(r['rid'] for r in races)))
print([ (r['name'],r['craw']) for r in races if r['ctype'] is None][:30])
