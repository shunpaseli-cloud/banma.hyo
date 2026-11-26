"""Graded-path-only history refresh (t314u).

Appends official confirmed results after the bundled cutoff (2026-11-08) through
HISTORY_THROUGH to copies of the bundled histories, for use ONLY by gradedCombineBox
(BG1-BG3 x all-age>=4 races).  The bundled card_history_age4.json /
graded_form_history_age4.json (and their SHA in learned_model.json) are untouched, so
non-graded card_score_age4 behaviour does not change.
Fold rules are the same as fit_and_export.history_entries/summary (card) and the
graded history fields (graded): starters only, races with >=3 starters, nf=(finish-1)/(n-1),
DNF/DQ -> card nf=1.0,dnf=1 / graded finish=null,nf=null,status 1|2.
Inputs: src/data/verified_results.json (official final, NAR/PDF cross-checked),
src/data/racecards/racecard_<date>.json (sled weight, age), race names for class ladder.
"""
import json, re, sys, hashlib, unicodedata, os
HERE = os.path.dirname(os.path.abspath(__file__)); FRONT = os.path.abspath(os.path.join(HERE, '..', '..')); D = os.path.join(FRONT, 'src', 'data')
HISTORY_THROUGH = '2026-11-16'
DATES = ['2026-11-14', '2026-11-15', '2026-11-16']
NAMES = sys.argv[1] if len(sys.argv) > 1 else None   # JSON list of {race_id,name} (umanity-format race names)
nk = lambda s: unicodedata.normalize('NFKC', s or '')
LAD = dict(A1=1, A2=2, B1=3, B2=4, B3=5, B4=6, C1=7, C2=8)
def parse_class(name):  # port of src/cardScoreAge4.js parseClass
    n = re.sub(r'[\u2212\u2010-\u2015\uFF0D]', '-', re.sub(r'[\s\u3000]', '', nk(name)))
    ms = list(re.finditer(r'([23])歳([A-D])(?:-(\d+))?', n))
    if ms: m = ms[-1]; return 'Y', 'ABCD'.index(m[2]) + 1 + (int(m[3]) / 20 if m[3] else 0)
    ms = list(re.finditer(r'([ABC][12]|B[34])(?:-(\d+))?', n))
    if ms: m = ms[-1]; return 'G', LAD[m[1]] + (int(m[2]) / 20 if m[2] else 0)
    if 'オープン' in n: return 'G', 0
    if '選抜' in n: return ('Y', 0.5) if '2歳選抜' in n else ('G', 0)
    if n.endswith('2歳新馬'): return 'Y', 5
    return None, None
G = json.load(open(os.path.join(D, 'graded_form_history_age4.json'))); C = json.load(open(os.path.join(D, 'card_history_age4.json')))
GR = json.load(open(os.path.join(D, 'grade_races.json'))); V = json.load(open(os.path.join(D, 'verified_results.json')))['races']
assert G['history_through'] == C['history_through'] == '2026-11-08'
names = {x['race_id']: x['name'] for x in json.load(open(NAMES))}
def graded(name, date):
    n = nk(name)
    if re.search(r'BG[123]', n, re.I): return 1
    return int(any(k and nk(k) in n for k in GR.get('name_keywords', [])))
log = dict(races=0, starts=0, card_updated=0, graded_updated=0, skipped_no_history=[], skipped_birth_mismatch=[], dq=[], scratches=[])
for date in DATES:
    card = json.load(open(os.path.join(D, 'racecards', f'racecard_{date}.json')))
    for r in card['races']:
        rid = r['race_id']; res = V[rid]; assert res['status'] == 'final', rid
        ent = {e['umaban']: e for e in r['entries']}
        fin = {f['umaban']: f for f in res['finishes']}
        st = [e for e in r['entries'] if not e.get('status')]
        for e in r['entries']:
            if e.get('status'): log['scratches'].append([rid, e['umaban'], e['name']])
        assert set(fin) == {e['umaban'] for e in st}, rid
        n = len(st)
        if n < 3: continue
        ctype, cval = parse_class(names[rid]); isg = graded(names[rid], date); log['races'] += 1
        for e in st:
            f = fin[e['umaban']]; assert nk(f['name']) == nk(e['name']), (rid, f, e['name'])
            dnf = f['status'] != 'finished' or f.get('finish') is None
            code = 0 if not dnf else (2 if f['status'] == 'disqualified' else 1)
            pos = None if dnf else int(f['finish'])
            if dnf: log['dq'].append([rid, e['umaban'], e['name'], f['status']])
            key = nk(e['name']); log['starts'] += 1
            ch = C['horses'].get(key)
            if ch is None: log['skipped_no_history'].append([rid, e['name'], e['age']]); continue
            if int(ch['b'][:4]) != int(date[:4]) - int(e['age']): log['skipped_birth_mismatch'].append([rid, e['name'], e['age'], ch['b']]); continue
            w = float(e['sled_weight'])
            ch['n'] += 1
            if pos is not None and pos <= 3: ch['bt'] = max(ch['bt'] or 0, w) if ch['bt'] is not None else w
            ch['h'] = (ch['h'] + [[date, 1.0 if dnf else (pos - 1) / (n - 1), int(pos == 1), int(pos is not None and pos <= 3), w, ctype, cval, int(dnf)]])[-5:]
            log['card_updated'] += 1
            gh = G['horses'].get(key)
            if gh is None:
                gh = G['horses'][key] = dict(b=ch['b'], n=0, wins=0, graded_n=0, h=[])
            elif gh.get('b') and int(gh['b'][:4]) != int(date[:4]) - int(e['age']): log['skipped_birth_mismatch'].append([rid, e['name'], 'graded']); continue
            gh['n'] += 1; gh['wins'] += int(pos == 1); gh['graded_n'] += isg
            gh['h'] = (gh['h'] + [[date, pos, None if dnf else round((pos - 1) / (n - 1), 6), int(pos == 1), int(pos is not None and pos <= 3), n, isg, code]])[-40:]
            log['graded_updated'] += 1
for X, schema in ((C, 'card-history-age4-v1'), (G, 'graded-form-history-age4-v1')):
    X['history_through'] = HISTORY_THROUGH; X['built_for_race_dates_from'] = '2026-11-17'
    X['refresh'] = dict(purpose='graded path only (gradedCombineBox); bundled history file unchanged', base_history_through='2026-11-08',
                        appended_dates=DATES, source='src/data/verified_results.json (official final, NAR+PDF/sportsnavi cross-checked) + src/data/racecards (sled weight/age)',
                        script='frontend/analysis/graded5-age4/refresh_graded_history.py', counts={k: (len(v) if isinstance(v, list) else v) for k, v in log.items()})
out_c = os.path.join(D, 'card_history_age4_graded_r20261116.json'); out_g = os.path.join(D, 'graded_form_history_age4_r20261116.json')
json.dump(C, open(out_c, 'w'), ensure_ascii=False, separators=(',', ':')); json.dump(G, open(out_g, 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps({**{k: (len(v) if isinstance(v, list) else v) for k, v in log.items()}, 'skipped_no_history': log['skipped_no_history'][:30], 'birth': log['skipped_birth_mismatch'], 'dq': log['dq'],
                  'sha_card': hashlib.sha256(open(out_c, 'rb').read()).hexdigest(), 'sha_graded': hashlib.sha256(open(out_g, 'rb').read()).hexdigest()}, ensure_ascii=False))
