"""Production export for the age>=4 card-score BOX selector (t269u).

Re-uses the pre-registered experiment recipe (pipeline.py copied verbatim from
/workspace/banma_card_horse_score_experiment, M1 17 features, PL top-3, L2 lambda=1,
standardization with training-window stats).  Outputs:
  * model section  -> merged into src/data/learned_model.json as `card_score_age4`
  * card history   -> src/data/card_history_age4.json (prior official results only)
  * parity fixture -> tests/fixtures/card-score-age4-parity.json
No same-day / future result is used: training and history end at HISTORY_THROUGH.
"""
import json, sys, hashlib, math, collections, datetime as dt, os, itertools
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pipeline as P

EXP = '/workspace/banma_card_horse_score_experiment'
RACES = f'{EXP}/races_unified.json'
CLEAN = '/workspace/banma_official_pdf_audit_2023_onward/clean_results_2023_onward.json'
HISTORY_THROUGH = '2026-11-08'          # last confirmed official result date included
EFFECTIVE_FROM = '2026-11-09'           # first race date the production selector may be used
FRONT = os.path.abspath(os.path.join(HERE, '..', '..'))
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
d2 = P.d2

def history_entries(races, cutoff_exclusive):
    """Exactly the history update of pipeline.build_features, for dates < cutoff."""
    hist = collections.defaultdict(list); scr = collections.defaultdict(list); birth = {}
    bydate = collections.defaultdict(list)
    for r in races: bydate[r['date']].append(r)
    for date in sorted(bydate):
        if date >= cutoff_exclusive: break
        for r in bydate[date]:
            st = [h for h in r['horses'] if h['starter'] and h.get('w') is not None and h.get('age') is not None]
            for h in r['horses']: birth.setdefault(h['key'], h['birth'])
            if len(st) < 3: continue
            n = len(st)
            for h in st:
                dnf = h['status'] in ('did_not_finish', 'disqualified') or h['finish'] is None
                nf = 1.0 if dnf else (h['finish'] - 1) / (n - 1)
                fin = None if dnf else h['finish']
                hist[h['key']].append(dict(date=date, nf=nf, win=int(fin == 1), top3=int(fin is not None and fin <= 3), w=h['w'], ctype=r['ctype'], cval=r['cval'], dnf=dnf))
        for r in bydate[date]:
            for h in r['horses']:
                if not h['starter'] and h['status'] in ('withdrawn', 'excluded'): scr[h['key']].append(date)
    return hist, scr, birth

def summary(races, cutoff_exclusive, keys=None, scratch_keep_from=None):
    hist, scr, birth = history_entries(races, cutoff_exclusive)
    out = {}
    for key in set(hist) | set(scr):
        if keys is not None and key not in keys: continue
        name, b = key.split('|')
        if name in out: raise SystemExit(f'duplicate horse name in history: {name}')
        H = hist.get(key, [])
        t3 = [x['w'] for x in H if x['top3']]
        out[name] = dict(b=b, n=len(H), bt=max(t3) if t3 else None,
                         h=[[x['date'], x['nf'], x['win'], x['top3'], x['w'], x['ctype'], x['cval'], int(x['dnf'])] for x in H[-5:]],
                         s=[s for s in scr.get(key, []) if scratch_keep_from is None or s >= scratch_keep_from])
    return out

def main():
    races = json.load(open(RACES))
    assert max(r['date'] for r in races) == HISTORY_THROUGH, 'unified data must end at the last confirmed date'
    fr = P.build_features(races)
    feats = P.F1
    train = [r for r in fr if r['rtype'] == 'pure_O' and r['date'] < EFFECTIVE_FROM]
    mu, sd = P.standardize_stats(train, feats, 'O')
    def tx(r):
        rr = dict(r); rr['rows'] = [dict(x, f={k: (x['f'][k] - mu[i]) / sd[i] for i, k in enumerate(feats)}) for x in r['rows'] if x['band'] == 'O']; return rr
    X, M, O = P.pack([tx(r) for r in train], feats)
    beta = P.fit(X, M, O)
    # Reproducibility check: re-fit the experiment's 2026-11 monthly model and compare with the stored one.
    WF = json.load(open(f'{EXP}/walkforward_preds.json'))['M1']
    tr11 = [r for r in fr if r['rtype'] == 'pure_O' and r['date'] < '2026-11-01']
    mu11, sd11 = P.standardize_stats(tr11, feats, 'O')
    def tx11(r):
        rr = dict(r); rr['rows'] = [dict(x, f={k: (x['f'][k] - mu11[i]) / sd11[i] for i, k in enumerate(feats)}) for x in r['rows'] if x['band'] == 'O']; return rr
    X11, M11, O11 = P.pack([tx11(r) for r in tr11], feats)
    b11 = P.fit(X11, M11, O11)
    stored = WF['models']['2026-11']['O']
    repro = max(abs(b11[i] - stored['beta'][k]) for i, k in enumerate(feats))
    assert repro < 1e-9, repro
    dates = sorted({r['date'] for r in train})
    model = dict(
        version='card-score-age4-v1', status='production',
        purpose='3頭BOX候補選定のみ（4歳以上だけのレース）。点数・購入/見送り・自信度には使わない。',
        applies_to=dict(race_type='pure_O: 取消・除外を除く全出走予定馬の出走表年齢が4歳以上', effective_from_race_date=EFFECTIVE_FROM,
                        not_applied=['3歳以下を含むレース（3歳以下のみ・混合）: 29特徴の現行BOXのまま', f'{EFFECTIVE_FROM} より前のレース（保存済み予想を再生成しない）', '年齢・ソリ重量欠測馬がいるレース', '候補3頭未満']),
        model_type='linear utility u=z.beta, Plackett-Luce top-3 likelihood, L2 lambda=1.0, L-BFGS-B (scipy, maxiter 500)',
        features=feats,
        feature_definitions=json.load(open(os.path.join(HERE, 'manifest.json')))['features_card_only'],
        feature_notes={
            'best_top3_missing': '1 if no prior top3 finish (w_minus_best_top3 then 0)',
            'age_months': 'race date - birth date in days / 30.44; birth date from bundled official history (name match + birth year = race year - card age); no-history fallback: April 15 of (race year - age)',
            'class': 'ladder from race name: A1=1..C2=8 (+sub/20), 2/3歳 A..D, オープン/選抜=0; class_change only if same ladder type',
            'scratch_hist': 'withdrawn/excluded entries in prior 180 days (official history)',
            'history': 'strictly earlier race dates only; same-day earlier races are not used'},
        normalization=dict(method='z=(x-mu)/sd with training-window mean/std (population std, sd<1e-9 -> 1)', mu=list(map(float, mu)), sd=list(map(float, sd))),
        beta=dict(zip(feats, map(float, beta))),
        box_rule=dict(name='BOX_PL', p='softmax(u) over candidate horses (scratched removed)',
                      definition='3-horse set maximizing sum over its 6 orders of p_i*p_j/(1-p_i)*p_k/(1-p_i-p_j)',
                      tickets='6点（三連単3頭ボックス、従来と同じ）', memrobo='メムロボブサップ出走時はメムロを含む集合のうち最大の集合（軸固定特例を維持）',
                      tie_break='first maximal set in lexicographic candidate order (umaban order)'),
        not_used_for=['点数（常に6点）', '購入/見送りゲート（29特徴の軸past_formゲートのまま）', '自信度（29特徴の軸による条件別テーブルのまま）'],
        training=dict(window_from=dates[0], window_to=dates[-1], race_type='pure_O', n_races=int(len(X)), history_from='2022-01 (warmup)',
                      fitted_at_JST=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).isoformat(timespec='seconds'),
                      rule='all pure_O races dated < effective_from; same recipe as experiment monthly walk-forward'),
        validation=dict(source=f'{EXP}/summary_by_band.csv', pure_O_races=2923, box_hit=0.06808, box_hit_ci95=[0.05898, 0.07692],
                        vs_C_walkforward_diff_pt=2.33, vs_C_ci95_pt=[1.21, 3.44], bootstrap='day-block B=1000 seed 20261109',
                        note='walk-forward monthly, 2023-01..2026-11-08; past results do not guarantee future hit rates'),
        reproducibility=dict(monthly_2026_11_refit_max_abs_beta_diff=float(repro)),
        provenance=dict(experiment_dir=EXP, pipeline_py_sha256=sha(os.path.join(HERE, 'pipeline.py')), races_unified_sha256=sha(RACES),
                        clean_results_sha256=sha(CLEAN), manifest_sha256=sha(os.path.join(HERE, 'manifest.json')),
                        script='frontend/analysis/card-score-age4/fit_and_export.py'))
    hist = summary(races, EFFECTIVE_FROM, scratch_keep_from=(d2(HISTORY_THROUGH) - dt.timedelta(days=400)).isoformat())
    history = dict(schema='card-history-age4-v1', history_through=HISTORY_THROUGH, built_for_race_dates_from=EFFECTIVE_FROM,
                   source='official confirmed results (2022 canonical warmup + 2023-onward clean official JSON), prior dates only',
                   fields=dict(b='birth date YYYYMMDD', n='#prior starts', bt='max sled weight with a prior top3 (null none)',
                               h='last5 [date,nf,win,top3,w,ctype,cval,dnf]', s='withdrawn/excluded dates (kept >= history_through-400d)'),
                   horses=dict(sorted(hist.items())))
    model['history_file'] = dict(path='src/data/card_history_age4.json', history_through=HISTORY_THROUGH)
    # ---- parity fixture: sampled historical pure_O races with the experiment monthly coefficients
    rows = {x['rid']: x for x in json.load(open(f'{EXP}/prediction_rows.json')) if x['model'] == 'M1'}
    frid = {r['rid']: r for r in fr}
    rid2race = {r['rid']: r for r in races}
    cand = sorted(rid for rid, x in rows.items() if x['rtype'] == 'pure_O')
    rng = np.random.default_rng(20261109)
    sample = sorted(rng.choice(cand, 150, replace=False).tolist())
    fx = []
    for rid in sample:
        r = rid2race[rid]; f = frid[rid]; mo = r['date'][:7]; m = WF['models'][mo]['O']
        keys = {h['key'] for h in r['horses']}
        card = [dict(umaban=h['no'], name=h['key'].split('|')[0], age=h['age'], sex=h['sex'], sled_weight=h['w'],
                     status=None if h['starter'] else ('取消' if h['status'] == 'withdrawn' else '除外')) for h in r['horses']]
        fx.append(dict(race_id=rid, race_date=r['date'], ctype=r['ctype'], cval=r['cval'], entries=card,
                       history=summary(races, r['date'], keys=keys),
                       model=dict(mu=m['mu'], sd=m['sd'], beta=m['beta']),
                       expected=dict(features={str(x['no']): x['f'] for x in f['rows']}, u=WF['preds'][rid], box_pl=rows[rid]['box_pl'])))
    # class parse cases from the bundled production cards (Nov 6-8) vs experiment ctype/cval
    prod = json.load(open(os.path.join(FRONT, 'src/data/races_from_pdf.json')))
    cls = [dict(name=p['name'], ctype=rid2race[p['race_id']]['ctype'], cval=rid2race[p['race_id']]['cval']) for p in prod if p['race_id'] in rid2race]
    json.dump(dict(note='generated by fit_and_export.py; expected values from the experiment (features.json/walkforward_preds.json/prediction_rows.json M1)',
                   races=fx, class_cases=cls), open(os.path.join(FRONT, 'tests/fixtures/card-score-age4-parity.json'), 'w'), ensure_ascii=False)
    json.dump(history, open(os.path.join(FRONT, 'src/data/card_history_age4.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    model['history_file']['sha256'] = sha(os.path.join(FRONT, 'src/data/card_history_age4.json'))
    json.dump(model, open(os.path.join(HERE, 'card_score_age4_model.json'), 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(dict(n_train=len(X), window=[dates[0], dates[-1]], repro=repro, horses=len(hist), beta=model['beta']), ensure_ascii=False))

if __name__ == '__main__':
    main()
