"""Append-only pre-start forecast snapshots and separate official actual histories. No training."""
import argparse
import copy
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
import urllib.request

JST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[1]
URL = ('https://api.open-meteo.com/v1/forecast?latitude=42.92&longitude=143.20'
       '&daily=precipitation_sum,relative_humidity_2m_mean,et0_fao_evapotranspiration'
       '&past_days=2&forecast_days=3&timezone=Asia%2FTokyo')
FORMULA = {'version': 'moisture-js-ols-frozen-v1-strict-inputs', 'intercept': 2.330,
           'rain0': 0.036, 'rain1': 0.038, 'hum': 0.002, 'et0_3day': -0.132,
           'clamp': [0.5, 8], 'rounding': 'positive JS Math.round to 0.1',
           'missing_policy': 'any required input missing => no prediction'}

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def stamp():
    return datetime.now(JST)

def parse(value):
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        raise ValueError('Timestamp must have an explicit timezone')
    return dt.astimezone(JST)

def schedule_rows(payload, date):
    rows = payload if isinstance(payload, list) else payload['races']
    if not isinstance(rows, list):
        raise ValueError('Schedule must be race list')
    out = []
    for race in rows:
        day = race.get('race_date') or race.get('date')
        if day != date or day < '2026-11-07':
            continue
        no = race['race_no']; time = race.get('post_time') or race.get('発走時刻')
        if not isinstance(no, int) or not 1 <= no <= 12 or not re.fullmatch(r'\d{2}:\d{2}', time or ''):
            raise ValueError('Explicit official race number/start time required')
        out.append({'race_id': f"{day.replace('-', '')}-R{no:02d}", 'date': day, 'race_no': no,
                    'scheduled_start_at': parse(f'{day}T{time}:00+09:00').isoformat(),
                    'schedule_source_url': race.get('source_url')})
    if len({r['race_id'] for r in out}) != len(out):
        raise ValueError('Duplicate race keys')
    return sorted(out, key=lambda r: r['race_no'])

def fetch_forecast():
    with urllib.request.urlopen(URL, timeout=25) as response:
        raw = response.read(); headers = dict(response.headers)
    return {'source_url': URL, 'fetched_at': stamp().isoformat(), 'http_headers': headers,
            'response_sha256': hashlib.sha256(raw).hexdigest(), 'response': json.loads(raw),
            'forecast_model': 'Open-Meteo best_match seamless', 'run_issued_at': None,
            'run_metadata_status': 'Individual run issuance not exposed by operational seamless endpoint; unknown, not inferred'}

def forecast_inputs(evidence, day, now):
    if not evidence or evidence.get('source_url') != URL:
        raise ValueError('Only genuine operational forecast endpoint accepted; archive/reanalysis prohibited')
    fetched = parse(evidence['fetched_at'])
    if fetched > now or now - fetched > timedelta(minutes=90):
        raise ValueError('Forecast retrieval must precede save and be no older than 90 minutes')
    data = evidence['response']
    if data.get('timezone') not in ('Asia/Tokyo', 'Asia/Tokyo (GMT+9)') or data.get('utc_offset_seconds') != 32400:
        raise ValueError('Forecast must be Asia/Tokyo')
    daily = data['daily']; values = {}
    for offset in (0, 1, 2):
        d = (datetime.fromisoformat(day) - timedelta(days=offset)).date().isoformat()
        index = daily['time'].index(d)
        fields = ['precipitation_sum', 'relative_humidity_2m_mean', 'et0_fao_evapotranspiration']
        values[d] = {f: daily[f][index] for f in fields}
        if any(not isinstance(v, (int,float)) or not math.isfinite(v) for v in values[d].values()):
            raise ValueError('Forecast input missing/non-finite')
    a, b, c = list(values.values())
    v = 2.330 + .036*a['precipitation_sum'] + .038*b['precipitation_sum'] + .002*a['relative_humidity_2m_mean'] - .132*sum(x['et0_fao_evapotranspiration'] for x in (a,b,c))
    return math.floor(max(.5, min(8, v))*10+.5)/10, values

def initial():
    return {'schema_version': 1, 'timezone': 'Asia/Tokyo', 'unit': 'percentage point',
            'prediction_policy': 'first successful forecast saved strictly before scheduled start; immutable; no retrospective prediction',
            'daily_scope': 'Same date-level weather formula for all races; not a per-race weather model',
            'formula': FORMULA, 'formula_sha256': digest(FORMULA), 'forecasts': {}, 'races': {}}

def apply_predictions(log, races, evidence, now, failure=None):
    if now.tzinfo is None: raise ValueError('Timezone required')
    now = now.astimezone(JST)
    for race in races:
        rid = race['race_id']; start = parse(race['scheduled_start_at'])
        row = log['races'].setdefault(rid, {**race, 'predicted_moisture': None,
              'prediction_saved_at': None, 'prediction_status': 'missing', 'attempts': [],
              'actual_moisture': None, 'actual_observed_at': None, 'actual_history': []})
        if row['scheduled_start_at'] != race['scheduled_start_at']:
            raise ValueError(f'Schedule changed for {rid}; manual audit required, snapshot not overwritten')
        if row['prediction_saved_at'] is not None or row['prediction_status'] == 'missed_prestart':
            continue
        if now >= start:
            row['prediction_status'] = 'missed_prestart'
            continue
        try:
            if failure: raise ValueError(failure)
            value, inputs = forecast_inputs(evidence, race['date'], now)
            key = digest(evidence)
            log['forecasts'].setdefault(key, evidence)
            row.update(predicted_moisture=value, prediction_saved_at=now.isoformat(), prediction_status='saved',
                       forecast_key=key, forecast_retrieved_at=evidence['fetched_at'],
                       forecast_run_issued_at=evidence.get('run_issued_at'), inputs=inputs,
                       formula_version=FORMULA['version'], formula_sha256=digest(FORMULA), inputs_sha256=digest(inputs))
        except (ValueError,KeyError,TypeError) as error:
            row['prediction_status'] = 'forecast_missing'
            event = {'attempted_at': now.isoformat(), 'status': 'forecast_missing', 'reason': str(error)}
            if not row['attempts'] or row['attempts'][-1] != event: row['attempts'].append(event)
    return log

def append_actuals(log, payload, now):
    count = 0
    for race in payload.get('races', []):
        if race.get('status') not in ('確定', '確定結果公開', 'final'): continue
        day = race.get('date') or race.get('race_date'); no = race['race_no']
        rid = f"{day.replace('-', '')}-R{no:02d}"; row = log['races'].get(rid)
        if not row or now < parse(row['scheduled_start_at']): continue
        value = race.get('馬場水分%'); source = race.get('source_url','')
        if not isinstance(value, (int,float)) or not 0 <= value <= 100: continue
        if not source.startswith('https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?'): continue
        fetched = race.get('取得時刻JST') or payload.get('meta',{}).get('取得時刻JST')
        if not fetched or parse(fetched) > now or parse(fetched) < parse(row['scheduled_start_at']): continue
        if race.get('validation') and not all(race['validation'].values()): continue
        # NAR reports race-level moisture but no independent sensor observation timestamp.
        event = {'actual_moisture': value, 'actual_observed_at': None,
                 'observed_at_status': 'Not provided by official result; race start is NOT observation time',
                 'source_url': source, 'source_retrieved_at': parse(fetched).isoformat(), 'appended_at': now.isoformat(), 'source_record_sha256': digest(race)}
        old = row['actual_history'][-1] if row['actual_history'] else None
        if old and old['actual_moisture'] == value and old['source_url'] == source: continue
        event['revision'] = len(row['actual_history']) + 1
        row['actual_history'].append(event)
        row.update(actual_moisture=value, actual_observed_at=None, actual_source_url=source,
                   actual_source_retrieved_at=event['source_retrieved_at'])
        count += 1
    return count

def metrics(log):
    pairs = [(r['predicted_moisture'], r['actual_moisture']) for r in log['races'].values()
             if r['prediction_status']=='saved' and r['actual_moisture'] is not None
             and parse(r['prediction_saved_at']) < parse(r['scheduled_start_at'])]
    return {'n':len(pairs), 'unit':'percentage point',
            'mae': sum(abs(p-a) for p,a in pairs)/len(pairs) if pairs else None,
            'rmse': (sum((p-a)**2 for p,a in pairs)/len(pairs))**.5 if pairs else None,
            'bias_prediction_minus_actual': sum(p-a for p,a in pairs)/len(pairs) if pairs else None}

def write_atomic(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent,prefix=path.name+'.')
    try:
        with os.fdopen(fd,'w') as stream:
            json.dump(data,stream,ensure_ascii=False,indent=2,allow_nan=False);stream.write('\n');stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
        directory = os.open(path.parent,os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--date',default=stamp().date().isoformat())
    parser.add_argument('--schedule',type=Path,default=ROOT/'src/data/races_from_pdf.json')
    parser.add_argument('--log',type=Path,default=Path('/workspace/banma-moisture-state/moisture_prediction_log.json'))
    parser.add_argument('--export-public',type=Path,default=ROOT/'public/moisture_prediction_log.json')
    parser.add_argument('--forecast-evidence',type=Path)
    parser.add_argument('--actuals',type=Path)
    args=parser.parse_args()
    if args.date < '2026-11-07': parser.error('No retrospective predictions before 2026-11-07')
    races=schedule_rows(json.loads(args.schedule.read_text()),args.date)
    if not races: parser.error('No authoritative race schedule for requested date; no rows fabricated')
    args.log.parent.mkdir(parents=True,exist_ok=True)
    with open(str(args.log)+'.lock','a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        log=json.loads(args.log.read_text()) if args.log.exists() else initial()
        evidence=None;failure=None
        eligible=any(stamp()<parse(r['scheduled_start_at']) and not log['races'].get(r['race_id'],{}).get('prediction_saved_at') for r in races)
        if eligible:
            try: evidence=json.loads(args.forecast_evidence.read_text()) if args.forecast_evidence else fetch_forecast()
            except Exception as error: failure=f'{type(error).__name__}: {error}'
        now=stamp() # strict comparison AFTER forecast I/O, before writing snapshots
        before=sum(r['prediction_status']=='saved' for r in log['races'].values())
        apply_predictions(log,races,evidence,now,failure)
        actual_count=append_actuals(log,json.loads(args.actuals.read_text()),now) if args.actuals else 0
        log['metrics']=metrics(log)
        changed=not args.log.exists() or json.loads(args.log.read_text()) != log
        if changed: write_atomic(args.log,log)
        if args.export_public != args.log and (not args.export_public.exists() or json.loads(args.export_public.read_text()) != log):
            write_atomic(args.export_public,log)
        after=sum(r['prediction_status']=='saved' for r in log['races'].values())
        print(json.dumps({'new_predictions':after-before,'total_predictions':after,'actual_revisions_appended':actual_count,
                          'saved_at':now.isoformat(),'path':str(args.log),'metrics':log['metrics']},ensure_ascii=False))

if __name__=='__main__': main()
