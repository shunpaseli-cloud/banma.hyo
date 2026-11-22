"""Regenerate src/data/moisture_model_v2.json (versioned) from analysis/moisture_v2/ training data.
coefficients: ridge(1e-3) fit on every race dated < --cutoff (exclusive) with previous-meeting carry-over.
season_correction: mean out-of-sample stage-1 residual (pred-actual) by season group over the 365 days before cutoff,
computed with expanding-window refits (each day fitted only on earlier days). Never touches learned_model.json."""
import argparse, importlib.util, json
from pathlib import Path
from datetime import datetime
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('mv2', HERE / 'moisture_v2.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
ap = argparse.ArgumentParser(); ap.add_argument('--cutoff', required=True, help='first date NOT used (YYYY-MM-DD)')
ap.add_argument('--version', required=True); ap.add_argument('--out', type=Path, default=m.CONFIG_PATH); a = ap.parse_args()
ROOT = m.ROOT; races_csv = 'analysis/moisture_v2/training_races.csv'; weather_json = 'analysis/moisture_v2/training_weather_daily.json'
byday, W = m.training_table(ROOT / races_csv, ROOT / weather_json); WX = W['days']; wx = lambda d: WX.get(d)
days = sorted(d for d in byday if d < a.cutoff); feats = {}
for i, t in enumerate(days):
    if i == 0: continue
    f = m.day_features(t, days[i - 1], byday[days[i - 1]][-1][1], wx)
    if f: feats[t] = f
rows = lambda until: [(m.race_vector(feats[d], no), y) for d in feats if d < until for no, y in byday[d]]
coef = m.fit(rows(a.cutoff))
res = []
for t in [d for d in feats if d >= m.dshift(a.cutoff, -365)]:
    c = m.fit(rows(t))
    for no, y in byday[t]: res.append((t, m.season_group(t), m.predict_raw(c, feats[t], no) - y))
tab = m.season_correction_table(res, a.cutoff)
train_days = [d for d in feats if d < a.cutoff]
cfg = {'version': a.version, 'description': 'Two-stage track moisture: stage1 = carry-over + weather + race drift - seasonal OOS bias; stage2 = shift 2R+ by 1R official error (M7).',
  'unit': 'percentage point', 'features': m.FEATURES, 'coefficients': coef, 'coefficient_order': ['intercept'] + m.FEATURES,
  'feature_definitions': {'prev_last': "official moisture of the previous meeting day's last race", 'P0': 'precipitation_sum on race day (forecast, mm)',
     'Pb': 'precipitation_sum summed over calendar days strictly between previous meeting day and race day', 'Pprev': 'precipitation_sum on previous meeting day',
     'E0': 'et0_fao_evapotranspiration on race day', 'Eb': 'et0 summed over days strictly between meetings', 'RH0': 'relative_humidity_2m_mean on race day',
     'long_gap': '1 if days since previous meeting > 7', 'race_k': 'race_no - 1', 'race_k_x_P0': '(race_no - 1) * P0'},
  'ridge_lambda': 1e-3, 'rounding': 'clamp 0.5..8 then half-up to 0.1 (same as v1)', 'rain_switch_threshold': 1.8,
  'season_correction': {'enabled': True, 'groups': {'winter_11_2': [11, 12, 1, 2], 'summer_7_8': [7, 8], 'other': 'remaining months'},
     'values': {g: round(v['value'], 6) for g, v in tab.items()}, 'n_races': {g: v['n'] for g, v in tab.items()},
     'method': 'stage1 = regression - value[group]; value = mean out-of-sample residual (pred-actual) of expanding-window refits in the 365 days before cutoff; groups with <30 races -> 0'},
  'stage2': {'anchor': 'race 1 official moisture (NAR RaceList 馬場 column)', 'rule': 'value_k = stage1_raw_k + (anchor - stage1_raw_1) for k>=2',
     'deadline': 'anchor must be retrieved strictly before race 2 scheduled start; otherwise stage1 stays effective (fallback)', 'per_race_deadline': 'stage2 saved strictly before each race start'},
  'fallbacks': ['no 1R anchor before 2R start -> stage1 (carry-over based)', 'no previous-meeting official moisture or missing weather between meetings -> v1 frozen formula (flag stage1_v1_fallback)'],
  'training': {'races_csv': races_csv, 'weather_json': weather_json, 'cutoff_exclusive': a.cutoff, 'first_day': train_days[0], 'last_day': train_days[-1],
     'days': len(train_days), 'races': sum(len(byday[d]) for d in train_days),
     'races_csv_sha256': m.hashlib.sha256((ROOT / races_csv).read_bytes()).hexdigest(), 'weather_json_sha256': m.hashlib.sha256((ROOT / weather_json).read_bytes()).hexdigest()},
  'validation': 'see docs/moisture-v2-design.md (rolling-origin 2024-01-20..2026-11-16, 410 days / 4,903 races)',
  'independent_of': 'learned_model.json (not read, not written)'}
cfg['config_sha256'] = m.digest(cfg)
a.out.write_text(json.dumps(cfg, ensure_ascii=False, indent=1) + '\n'); print(json.dumps({k: cfg[k] for k in ('version', 'coefficients', 'season_correction', 'training')}, ensure_ascii=False, indent=1))
