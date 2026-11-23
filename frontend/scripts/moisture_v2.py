"""Track-moisture prediction v2 (two-stage). Separate from learned_model.json and from the frozen v1 formula.

stage 1 (morning, before 1R): linear model on
    previous meeting day's last-race official moisture (carry-over) + weather (Open-Meteo daily)
    + race-number drift, minus a point-in-time seasonal bias correction (Nov-Feb / Jul-Aug / other; out-of-sample residuals).  Config: src/data/moisture_model_v2.json.
stage 2 (after 1R official moisture is published, strictly before 2R start):
    value_k = stage1_k + (actual_1R - stage1_1R)   for k >= 2   (validated as M7).
Fallbacks: no 1R anchor before 2R start -> stage-1 value stays effective (carry-over based);
           no previous-meeting actual -> v1 frozen formula value (flagged).
Log: append-only `v2` block per race in moisture_prediction_log.json; v1 fields are never written here.
"""
import argparse, copy, csv, fcntl, hashlib, html, json, math, os, re, tempfile, urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'src/data/moisture_model_v2.json'
DEFAULT_LOG = Path('/workspace/banma-moisture-state/moisture_prediction_log.json')
RACELIST = 'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceList?k_raceDate={y}%2f{m}%2f{d}&k_babaCode=3'
OM = ('https://api.open-meteo.com/v1/forecast?latitude=42.92&longitude=143.20'
      '&daily=precipitation_sum,relative_humidity_2m_mean,et0_fao_evapotranspiration'
      '&past_days={past}&forecast_days=3&timezone=Asia%2FTokyo')
FEATURES = ['prev_last', 'P0', 'Pb', 'Pprev', 'E0', 'Eb', 'RH0', 'long_gap', 'race_k', 'race_k_x_P0']
WINTER, SUMMER = (11, 12, 1, 2), (7, 8)

def digest(v):
    return hashlib.sha256(json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
def now_jst(): return datetime.now(JST)
def parse(v):
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None: raise ValueError('timezone required')
    return dt.astimezone(JST)
def dshift(d, k): return (date.fromisoformat(d) + timedelta(days=k)).isoformat()
def round01(v):
    """same rounding/clamp as v1 (positive half-up to 0.1, clamp 0.5..8)"""
    return math.floor(max(.5, min(8, v)) * 10 + .5) / 10

# ---------------------------------------------------------------- features / model
def day_features(t, prev, prev_last, wx):
    """wx(day)->{'precipitation_sum','relative_humidity_2m_mean','et0_fao_evapotranspiration'} or None.
    t: target date, prev: previous meeting date (< t), prev_last: official moisture of prev's last race."""
    a = wx(t)
    if a is None or prev is None or prev_last is None: return None
    gap = (date.fromisoformat(t) - date.fromisoformat(prev)).days
    btw = [wx(dshift(prev, k)) for k in range(1, gap)]
    pv = wx(prev)
    if any(x is None for x in btw) or pv is None: return None
    f = dict(prev_last=float(prev_last), P0=a['precipitation_sum'], Pb=sum(x['precipitation_sum'] for x in btw),
             Pprev=pv['precipitation_sum'], E0=a['et0_fao_evapotranspiration'], Eb=sum(x['et0_fao_evapotranspiration'] for x in btw),
             RH0=a['relative_humidity_2m_mean'], long_gap=1.0 if gap > 7 else 0.0,
             gap_days=gap)
    if any(not isinstance(f[k], (int, float)) or not math.isfinite(f[k]) for k in f): return None
    return f

def race_vector(f, race_no, features=FEATURES):
    x = dict(f, race_k=float(race_no - 1), race_k_x_P0=float(race_no - 1) * f['P0'])
    return [1.0] + [x[k] for k in features]

def fit(rows, features=FEATURES, lam=1e-3):
    """ridge (intercept unpenalised), identical to the review's evaluate.fit. rows: [(vector, y)]"""
    import numpy as np
    X = np.array([r[0] for r in rows]); y = np.array([r[1] for r in rows]); n = X.shape[1]
    R = lam * np.eye(n); R[0, 0] = 0
    return [float(v) for v in np.linalg.solve(X.T @ X + R, X.T @ y)]

def predict_raw(coef, f, race_no, features=FEATURES):
    return sum(c * x for c, x in zip(coef, race_vector(f, race_no, features)))

def season_group(t):
    m = int(t[5:7]); return 'winter_11_2' if m in WINTER else 'summer_7_8' if m in SUMMER else 'other'

def season_correction(residuals, t, min_n=30, window_days=365):
    """point-in-time seasonal bias: mean OUT-OF-SAMPLE stage-1 residual (pred-actual) of the same season group,
    races dated in [t-365d, t). residuals: [(date, group, pred_minus_actual)]. <min_n races -> 0."""
    g = season_group(t); lo = dshift(t, -window_days)
    e = [r for d, gg, r in residuals if gg == g and lo <= d < t]
    return (sum(e) / len(e)) if len(e) >= min_n else 0.0

def season_correction_table(residuals, asof, min_n=30, window_days=365):
    lo = dshift(asof, -window_days); out = {}
    for g in ('winter_11_2', 'summer_7_8', 'other'):
        e = [r for d, gg, r in residuals if gg == g and lo <= d < asof]
        out[g] = {'value': (sum(e) / len(e)) if len(e) >= min_n else 0.0, 'n': len(e)}
    return out

def stage1_raw(cfg, f, race_no, t):
    """stage-1 = regression - seasonal bias correction (frozen in config, see season_correction)."""
    corr = cfg['season_correction']['values'].get(season_group(t), 0.0) if cfg['season_correction']['enabled'] else 0.0
    return predict_raw(cfg['coefficients'], f, race_no, cfg['features']) - corr

def stage2_values(stage1_raw, anchor_actual):
    """stage1_raw: {race_no: raw stage-1 value}. returns {race_no>=2: (raw, rounded)}; shift = anchor - stage1_raw[1]"""
    shift = anchor_actual - stage1_raw[1]
    return shift, {k: (v + shift, round01(v + shift)) for k, v in stage1_raw.items() if k >= 2}

def load_config(path=CONFIG_PATH):
    c = json.loads(Path(path).read_text())
    body = {k: v for k, v in c.items() if k != 'config_sha256'}
    if c.get('config_sha256') != digest(body): raise ValueError('moisture_model_v2.json hash mismatch')
    return c

def v1_formula(wx, t):
    a, b, c = wx(t), wx(dshift(t, -1)), wx(dshift(t, -2))
    if None in (a, b, c): return None
    v = 2.330 + .036*a['precipitation_sum'] + .038*b['precipitation_sum'] + .002*a['relative_humidity_2m_mean'] - .132*sum(x['et0_fao_evapotranspiration'] for x in (a, b, c))
    return round01(v)

# ---------------------------------------------------------------- data access
def training_table(races_csv, weather_json):
    rows = [r for r in csv.DictReader(open(races_csv)) if r['moisture'] not in ('', None) and r['status'] != 'canceled']
    byday = {}
    for r in rows: byday.setdefault(r['date'], []).append((int(r['race_no']), float(r['moisture'])))
    for d in byday: byday[d].sort()
    W = json.loads(Path(weather_json).read_text())
    return byday, W

def build_training_rows(byday, wx, until_exclusive, features=FEATURES):
    days = sorted(byday); out = []
    for i, t in enumerate(days):
        if t >= until_exclusive or i == 0: continue
        prev = days[i - 1]; f = day_features(t, prev, byday[prev][-1][1], wx)
        if f is None: continue
        for no, y in byday[t]: out.append((race_vector(f, no, features), y))
    return out

def log_actuals(log):
    by = {}
    for r in log['races'].values():
        if r.get('actual_moisture') is not None: by.setdefault(r['date'], []).append((r['race_no'], r['actual_moisture'], r.get('actual_source_url')))
    for d in by: by[d].sort()
    return by

def previous_meeting(t, log, byday_hist):
    """latest meeting date < t with an official last-race moisture. log (NAR official) first, then bundled history."""
    cand = {}
    for d, v in log_actuals(log).items():
        if d < t: cand[d] = dict(date=d, race_no=v[-1][0], actual=v[-1][1], source='moisture_prediction_log.json actual (NAR RaceMarkTable)', source_url=v[-1][2])
    for d, v in byday_hist.items():
        if d < t and d not in cand: cand[d] = dict(date=d, race_no=v[-1][0], actual=v[-1][1], source='analysis/moisture_v2/training_races.csv', source_url=None)
    return cand[max(cand)] if cand else None

def fetch_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'banma-hyo-moisture-v2'}), timeout=25) as r:
        raw = r.read(); headers = dict(r.headers)
    return raw, headers

def fetch_forecast(past_days):
    url = OM.format(past=past_days); raw, headers = fetch_json(url)
    return {'source_url': url, 'fetched_at': now_jst().isoformat(), 'http_headers': headers, 'response_sha256': hashlib.sha256(raw).hexdigest(),
            'response': json.loads(raw), 'forecast_model': 'Open-Meteo best_match seamless', 'run_issued_at': None}

def wx_from_evidence(ev):
    d = ev['response']['daily']
    if ev['response'].get('utc_offset_seconds') != 32400: raise ValueError('forecast must be Asia/Tokyo')
    tab = {t: {k: d[k][i] for k in ('precipitation_sum', 'relative_humidity_2m_mean', 'et0_fao_evapotranspiration')} for i, t in enumerate(d['time'])}
    def wx(day):
        v = tab.get(day)
        if v is None or any(not isinstance(x, (int, float)) for x in v.values()): return None
        return v
    return wx

def parse_racelist(text):
    s = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<script.*?</script>', '', text, flags=re.S))))
    rows = {}
    for m in re.finditer(r'(\d{1,2})R (\d\d:\d\d) (?:有 )?(.+?) 直200m (?:(\S+) ([\d.]+) )?(\d+) オッズ', s):
        rows[int(m[1])] = dict(post_time=m[2], weather=m[4], moisture=float(m[5]) if m[5] else None)
    return rows

def fetch_racelist(day):
    url = RACELIST.format(y=day[:4], m=day[5:7], d=day[8:])
    raw, headers = fetch_json(url)
    return {'source_url': url, 'retrieved_at': now_jst().isoformat(), 'http_date': headers.get('Date'),
            'response_sha256': hashlib.sha256(raw).hexdigest(), 'races': parse_racelist(raw.decode('utf-8', 'ignore'))}

# ---------------------------------------------------------------- log I/O (same locking/atomic policy as v1 moisture_log.py)
def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(fd, 'w') as s:
            json.dump(data, s, ensure_ascii=False, indent=2, allow_nan=False); s.write('\n'); s.flush(); os.fsync(s.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)

V1_SKELETON = lambda race: {**race, 'predicted_moisture': None, 'prediction_saved_at': None, 'prediction_status': 'missing', 'attempts': [],
                            'actual_moisture': None, 'actual_observed_at': None, 'actual_history': []}

def schedule_rows(payload, day):
    rows = payload if isinstance(payload, list) else payload['races']; out = []
    for r in rows:
        d = r.get('race_date') or r.get('date')
        if d != day: continue
        no = r['race_no']; t = r.get('post_time') or r.get('発走時刻')
        if not isinstance(no, int) or not re.fullmatch(r'\d{2}:\d{2}', t or ''): raise ValueError('official race number/start time required')
        out.append({'race_id': f"{d.replace('-', '')}-R{no:02d}", 'date': d, 'race_no': no,
                    'scheduled_start_at': parse(f'{d}T{t}:00+09:00').isoformat(), 'schedule_source_url': r.get('source_url')})
    if len({r['race_id'] for r in out}) != len(out): raise ValueError('duplicate race keys')
    return sorted(out, key=lambda r: r['race_no'])

def ensure_v2_header(log, cfg):
    reg = log.setdefault('v2_models', {})
    reg.setdefault(cfg['version'], {'config_sha256': cfg['config_sha256'], 'registered_at': now_jst().isoformat(),
                                    'config_path': 'frontend/src/data/moisture_model_v2.json', 'description': cfg['description']})
    log.setdefault('v2_schema', {'version': 1, 'note': 'Per-race key `v2` is append-only and independent of v1 fields (predicted_moisture etc.). '
                    'stage1 is saved once before 1R; stage2 once after the 1R official anchor and strictly before each race start. '
                    'effective = value the prediction logic should use (stage2 if saved before start, else stage1, else v1 fallback).'})

def apply_stage1(log, races, cfg, ev, now, hist_byday, failure=None):
    ensure_v2_header(log, cfg); res = []
    t = races[0]['date']
    prev = previous_meeting(t, log, hist_byday)
    f = None; wx = None
    if ev is not None:
        fetched = parse(ev['fetched_at'])
        if fetched > now or now - fetched > timedelta(minutes=90): failure = failure or 'forecast stale (>90min) or in future'
        else:
            wx = wx_from_evidence(ev)
            if prev: f = day_features(t, prev['date'], prev['actual'], wx)
    key = digest(ev) if ev is not None else None
    if ev is not None: log.setdefault('forecasts', {}).setdefault(key, ev)
    for race in races:
        row = log['races'].setdefault(race['race_id'], V1_SKELETON(race))
        if row['scheduled_start_at'] != race['scheduled_start_at']: raise ValueError(f"schedule changed for {race['race_id']}; manual audit")
        v2 = row.setdefault('v2', {'model_version': cfg['version'], 'stage1': None, 'stage2': None, 'attempts': []})
        if v2.get('stage1') is not None or v2.get('stage1_status') == 'missed_prestart': res.append((race['race_id'], 'kept')); continue
        if now >= parse(race['scheduled_start_at']): v2['stage1_status'] = 'missed_prestart'; res.append((race['race_id'], 'missed_prestart')); continue
        if f is not None:
            raw = stage1_raw(cfg, f, race['race_no'], t)
            v2['stage1'] = {'value': round01(raw), 'raw': round(raw, 6), 'saved_at': now.isoformat(), 'forecast_key': key,
                            'forecast_retrieved_at': ev['fetched_at'], 'prev_meeting': prev, 'features': {k: f[k] for k in sorted(f)},
                            'model_version': cfg['version'], 'config_sha256': cfg['config_sha256'], 'fallback': None}
            v2['stage1_status'] = 'saved'
        elif wx is not None and v1_formula(wx, t) is not None:
            v = v1_formula(wx, t)
            v2['stage1'] = {'value': v, 'raw': None, 'saved_at': now.isoformat(), 'forecast_key': key, 'forecast_retrieved_at': ev['fetched_at'],
                            'prev_meeting': prev, 'features': None, 'model_version': cfg['version'], 'config_sha256': cfg['config_sha256'],
                            'fallback': 'v1_formula: previous-meeting official moisture or weather between meetings unavailable'}
            v2['stage1_status'] = 'saved_fallback_v1'
        else:
            v2['stage1_status'] = 'forecast_missing'
            ev_ = {'attempted_at': now.isoformat(), 'stage': 1, 'status': 'forecast_missing', 'reason': failure or 'inputs missing'}
            if not v2['attempts'] or v2['attempts'][-1] != ev_: v2['attempts'].append(ev_)
        set_effective(v2); res.append((race['race_id'], v2['stage1_status']))
    return res

def set_effective(v2):
    s2, s1 = v2.get('stage2'), v2.get('stage1')
    if s2 and s2.get('status') == 'saved': v2['effective'] = {'value': s2['value'], 'stage': 'stage2', 'fallback': False}
    elif s1: v2['effective'] = {'value': s1['value'], 'stage': 'stage1' if not s1.get('fallback') else 'stage1_v1_fallback',
                                'fallback': bool(s1.get('fallback')) or (s2 is not None and s2.get('status') != 'saved'),
                                'fallback_reason': (s2 or {}).get('status') if s2 else None}
    else: v2['effective'] = {'value': None, 'stage': None, 'fallback': True}

def apply_stage2(log, races, cfg, racelist, now):
    """racelist: fetch_racelist() evidence. Anchor = race 1 official moisture visible on NAR RaceList, retrieved before 2R start."""
    ensure_v2_header(log, cfg)
    rows = {r['race_no']: log['races'][r['race_id']] for r in races if r['race_id'] in log['races']}
    if 1 not in rows or 2 not in rows: return {'status': 'no_schedule'}
    s1 = {k: (r.get('v2') or {}).get('stage1') for k, r in rows.items()}
    if any(s1[k] is None or s1[k].get('raw') is None for k in s1): return {'status': 'no_stage1_model_value'}
    if any((r['v2'].get('stage2') or {}).get('status') in ('saved', 'anchor_missed_2R_start') for r in rows.values() if r['race_no'] >= 2):
        return {'status': 'already_done'}
    start2 = parse(rows[2]['scheduled_start_at']); start1 = parse(rows[1]['scheduled_start_at'])
    retrieved = parse(racelist['retrieved_at']) if racelist else None
    a = (racelist or {}).get('races', {}).get(1, {}).get('moisture')
    if now >= start2 or (retrieved and retrieved >= start2):
        if a is None or retrieved is None or retrieved >= start2:
            for k, r in rows.items():
                if k >= 2: r['v2']['stage2'] = {'status': 'anchor_missed_2R_start', 'checked_at': now.isoformat(), 'value': None}; set_effective(r['v2'])
            return {'status': 'anchor_missed_2R_start'}
    if a is None or retrieved is None: return {'status': 'anchor_not_published', 'checked_at': now.isoformat()}
    if retrieved < start1: return {'status': 'anchor_before_1R_start_ignored'}
    shift, vals = stage2_values({k: s1[k]['raw'] for k in s1}, a)
    anchor = {'race_id': rows[1]['race_id'], 'actual': a, 'source_url': racelist['source_url'], 'retrieved_at': racelist['retrieved_at'],
              'http_date': racelist.get('http_date'), 'response_sha256': racelist['response_sha256'], 'stage1_raw_R1': s1[1]['raw'],
              'visible_moisture_by_race': {str(k): v.get('moisture') for k, v in racelist['races'].items()}}
    out = {}
    for k, r in rows.items():
        if k < 2: continue
        if now >= parse(r['scheduled_start_at']): r['v2']['stage2'] = {'status': 'missed_prestart', 'checked_at': now.isoformat(), 'value': None}
        else:
            raw, v = vals[k]
            r['v2']['stage2'] = {'status': 'saved', 'value': v, 'raw': round(raw, 6), 'shift': round(shift, 6), 'saved_at': now.isoformat(), 'anchor': anchor,
                                 'model_version': cfg['version'], 'switch_changed_vs_stage1': (v >= cfg['rain_switch_threshold']) != (r['v2']['stage1']['value'] >= cfg['rain_switch_threshold'])}
        set_effective(r['v2']); out[r['race_id']] = r['v2']['effective']
    return {'status': 'saved', 'shift': round(shift, 3), 'anchor': a, 'effective': out}

def metrics_v2(log):
    pairs = []
    for r in log['races'].values():
        v2 = r.get('v2') or {}; e = v2.get('effective') or {}
        if e.get('value') is None or r.get('actual_moisture') is None: continue
        s = v2.get('stage2') if e['stage'] == 'stage2' else v2.get('stage1')
        if s and parse(s['saved_at']) < parse(r['scheduled_start_at']): pairs.append((e['value'], r['actual_moisture'], e['stage']))
    def m(ps): return {'n': len(ps), 'mae': sum(abs(p - a) for p, a, _ in ps) / len(ps) if ps else None,
                       'bias_prediction_minus_actual': sum(p - a for p, a, _ in ps) / len(ps) if ps else None,
                       'switch_miscls': sum((p >= 1.8) != (a >= 1.8) for p, a, _ in ps) / len(ps) if ps else None}
    return {'unit': 'percentage point', 'effective': m(pairs), 'stage1_only_rows': m([p for p in pairs if p[2] != 'stage2']), 'stage2_rows': m([p for p in pairs if p[2] == 'stage2'])}

def run_locked(args, fn):
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with open(str(args.log) + '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        log = json.loads(args.log.read_text())
        before = copy.deepcopy(log)
        result = fn(log)
        assert_append_only(before, log)
        log['metrics_v2'] = metrics_v2(log)
        if log != before:
            write_atomic(args.log, log)
            if args.export_public and args.export_public != args.log: write_atomic(args.export_public, log)
        return result

V1_KEYS = ('predicted_moisture', 'prediction_saved_at', 'prediction_status', 'attempts', 'actual_moisture', 'actual_history', 'scheduled_start_at', 'formula_version', 'inputs')
def assert_append_only(before, after):
    for rid, r in before['races'].items():
        a = after['races'][rid]
        for k in V1_KEYS:
            if k in r and a.get(k) != r[k]: raise RuntimeError(f'v1 field {k} of {rid} would change; aborted')
        for st in ('stage1', 'stage2'):
            if (r.get('v2') or {}).get(st) and a['v2'].get(st) != r['v2'][st]: raise RuntimeError(f'v2 {st} of {rid} would change; aborted')
    for k, v in before.get('forecasts', {}).items():
        if after['forecasts'].get(k) != v: raise RuntimeError('forecast evidence would change')
    for k in ('formula', 'formula_sha256', 'schema_version'):
        if before.get(k) != after.get(k): raise RuntimeError(f'top-level {k} would change')

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('stage', choices=['stage1', 'stage2', 'show'])
    p.add_argument('--date', default=now_jst().date().isoformat())
    p.add_argument('--schedule', type=Path, help='official schedule JSON (same format as moisture_log.py); default: NAR RaceList')
    p.add_argument('--log', type=Path, default=DEFAULT_LOG)
    p.add_argument('--export-public', type=Path, default=ROOT / 'public/moisture_prediction_log.json')
    p.add_argument('--config', type=Path, default=CONFIG_PATH)
    p.add_argument('--forecast-evidence', type=Path); p.add_argument('--racelist-evidence', type=Path)
    a = p.parse_args(); cfg = load_config(a.config)
    hist, _ = training_table(ROOT / cfg['training']['races_csv'], ROOT / cfg['training']['weather_json'])
    if a.schedule: races = schedule_rows(json.loads(a.schedule.read_text()), a.date)
    else:
        rl = json.loads(a.racelist_evidence.read_text()) if a.racelist_evidence else fetch_racelist(a.date)
        races = [{'race_id': f"{a.date.replace('-', '')}-R{k:02d}", 'date': a.date, 'race_no': k,
                  'scheduled_start_at': parse(f"{a.date}T{v['post_time']}:00+09:00").isoformat(), 'schedule_source_url': rl['source_url']} for k, v in sorted(rl['races'].items())]
    if not races: p.error('no official schedule for date; nothing fabricated')
    if a.stage == 'show':
        L = json.loads(a.log.read_text()); print(json.dumps({r['race_id']: (L['races'].get(r['race_id'], {}).get('v2') or {}).get('effective') for r in races}, ensure_ascii=False)); return
    if a.stage == 'stage1':
        def fn(log):
            prev = previous_meeting(a.date, log, hist); ev = None; failure = None
            gap = (date.fromisoformat(a.date) - date.fromisoformat(prev['date'])).days if prev else 2
            try: ev = json.loads(a.forecast_evidence.read_text()) if a.forecast_evidence else fetch_forecast(min(92, max(2, gap + 1)))
            except Exception as e: failure = f'{type(e).__name__}: {e}'
            return apply_stage1(log, races, cfg, ev, now_jst(), hist, failure)
    else:
        def fn(log):
            try: rl = json.loads(a.racelist_evidence.read_text()) if a.racelist_evidence else fetch_racelist(a.date)
            except Exception as e: rl = None
            return apply_stage2(log, races, cfg, rl, now_jst())
    r = run_locked(a, fn)
    print(json.dumps({'stage': a.stage, 'date': a.date, 'result': r}, ensure_ascii=False, default=str))

if __name__ == '__main__': main()
