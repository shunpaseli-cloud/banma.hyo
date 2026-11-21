import copy, importlib.util, json, subprocess, sys, tempfile, unittest
from datetime import timedelta
from pathlib import Path
HERE = Path(__file__).resolve().parents[1]
def load(name, file):
    s = importlib.util.spec_from_file_location(name, HERE / 'scripts' / file); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
m = load('moisture_v2', 'moisture_v2.py'); v1 = load('moisture_log', 'moisture_log.py')
CFG = m.load_config()
HIST, _ = m.training_table(HERE / CFG['training']['races_csv'], HERE / CFG['training']['weather_json'])
DAY = '2026-11-21'
def races():
    return m.schedule_rows([{'race_date': DAY, 'race_no': k, 'post_time': t} for k, t in [(1, '14:05'), (2, '14:40'), (3, '15:15')]], DAY)
def base_log():
    log = v1.initial()
    log['races']['20261116-R12'] = {**v1.schedule_rows([{'race_date': '2026-11-16', 'race_no': 12, 'post_time': '20:45'}], '2026-11-16')[0],
        'predicted_moisture': 2.6, 'prediction_saved_at': '2026-11-16T08:55:00+09:00', 'prediction_status': 'saved', 'attempts': [],
        'actual_moisture': 2.9, 'actual_observed_at': None, 'actual_history': [{'actual_moisture': 2.9}], 'actual_source_url': 'https://www.keiba.go.jp/x'}
    return log
def evidence(now):
    days = [m.dshift(DAY, -k) for k in range(6, -3, -1)]
    return {'source_url': m.OM.format(past=6), 'fetched_at': now.isoformat(), 'run_issued_at': None,
            'response': {'timezone': 'Asia/Tokyo', 'utc_offset_seconds': 32400, 'daily': {'time': days,
              'precipitation_sum': [6.4, 0, 14.7, 21.5, 0, 0, 0, 0.3, 0], 'relative_humidity_2m_mean': [80, 68, 97, 81, 55, 61, 72, 68, 70],
              'et0_fao_evapotranspiration': [1.26, 1.22, .28, .9, 1.21, 1.29, 1.01, .97, 1]}}}
NOW = m.parse(f'{DAY}T09:00:00+09:00')
def racelist(at, r1=None, r2=None):
    return {'source_url': m.RACELIST.format(y='2026', m='11', d='21'), 'retrieved_at': at.isoformat(), 'http_date': None, 'response_sha256': 'x',
            'races': {1: {'post_time': '14:05', 'moisture': r1}, 2: {'post_time': '14:40', 'moisture': r2}, 3: {'post_time': '15:15', 'moisture': None}}}

class T(unittest.TestCase):
    def stage1(self, log=None, now=NOW):
        log = log or base_log(); m.apply_stage1(log, races(), CFG, evidence(now), now, HIST); return log
    def test_config_and_model_untouched(self):
        self.assertEqual(CFG['config_sha256'], m.digest({k: v for k, v in CFG.items() if k != 'config_sha256'}))
        import hashlib
        self.assertEqual(hashlib.sha256((HERE / 'src/data/learned_model.json').read_bytes()).hexdigest(), 'e657cd397eccf5ca5b256d5ece69422b7fe0cffd8cb595663e4bf475ee403893')
        self.assertNotIn('learned_model', (HERE / 'scripts/moisture_v2.py').read_text().replace('learned_model.json and', ''))
    def test_stage1_uses_previous_meeting_carry_over(self):
        log = self.stage1(); s = log['races']['20261121-R01']['v2']['stage1']
        self.assertEqual(s['prev_meeting']['date'], '2026-11-16'); self.assertEqual(s['features']['prev_last'], 2.9)
        self.assertEqual(s['features']['Pb'], 36.2); self.assertEqual(s['features']['gap_days'], 5)
        f = s['features']; self.assertAlmostEqual(s['raw'], round(m.stage1_raw(CFG, f, 1, DAY), 6))
        self.assertEqual(log['races']['20261121-R01']['v2']['effective']['stage'], 'stage1')
        self.assertIsNone(log['races']['20261121-R01']['predicted_moisture'], 'v1 field not written by v2')
    def test_stage1_immutable_and_missed_prestart(self):
        log = self.stage1(); before = copy.deepcopy(log)
        m.apply_stage1(log, races(), CFG, evidence(NOW + timedelta(minutes=30)), NOW + timedelta(minutes=30), HIST)
        self.assertEqual(log['races']['20261121-R02']['v2']['stage1'], before['races']['20261121-R02']['v2']['stage1'])
        late = m.parse(f'{DAY}T14:50:00+09:00'); log2 = base_log(); m.apply_stage1(log2, races(), CFG, evidence(late), late, HIST)
        self.assertEqual(log2['races']['20261121-R01']['v2']['stage1_status'], 'missed_prestart')
        self.assertEqual(log2['races']['20261121-R02']['v2']['stage1_status'], 'missed_prestart')
        self.assertEqual(log2['races']['20261121-R03']['v2']['stage1_status'], 'saved')
    def test_stage1_fallback_v1_without_previous_actual(self):
        log = base_log(); del log['races']['20261116-R12']
        r = m.apply_stage1(log, races(), CFG, evidence(NOW), NOW, {})
        v = log['races']['20261121-R01']['v2']
        self.assertEqual(v['stage1_status'], 'saved_fallback_v1'); self.assertTrue(v['effective']['fallback'])
    def test_stage2_anchor_shift(self):
        log = self.stage1(); t = m.parse(f'{DAY}T14:20:00+09:00')
        self.assertEqual(m.apply_stage2(log, races(), CFG, racelist(t), t)['status'], 'anchor_not_published')
        r = m.apply_stage2(log, races(), CFG, racelist(t, r1=2.0), t)
        self.assertEqual(r['status'], 'saved')
        s1 = {k: log['races'][f'20261121-R0{k}']['v2']['stage1']['raw'] for k in (1, 2, 3)}
        for k in (2, 3):
            v = log['races'][f'20261121-R0{k}']['v2']
            self.assertAlmostEqual(v['stage2']['raw'], round(s1[k] + 2.0 - s1[1], 6)); self.assertEqual(v['effective']['stage'], 'stage2')
            self.assertEqual(v['stage2']['anchor']['actual'], 2.0)
        self.assertIsNone(log['races']['20261121-R01']['v2']['stage2'])
        before = copy.deepcopy(log); self.assertEqual(m.apply_stage2(log, races(), CFG, racelist(t, r1=9.9), t)['status'], 'already_done'); self.assertEqual(log, before)
    def test_stage2_late_anchor_falls_back(self):
        log = self.stage1(); t = m.parse(f'{DAY}T14:41:00+09:00')
        self.assertEqual(m.apply_stage2(log, races(), CFG, racelist(t, r1=2.0), t)['status'], 'anchor_missed_2R_start')
        v = log['races']['20261121-R03']['v2']; self.assertEqual(v['effective']['stage'], 'stage1'); self.assertTrue(v['effective']['fallback'])
        self.assertEqual(v['effective']['value'], v['stage1']['value'])
    def test_stage2_ignores_value_before_1R_start(self):
        log = self.stage1(); t = m.parse(f'{DAY}T13:00:00+09:00')
        self.assertEqual(m.apply_stage2(log, races(), CFG, racelist(t, r1=2.0), t)['status'], 'anchor_before_1R_start_ignored')
    def test_append_only_guard(self):
        log = self.stage1(); after = copy.deepcopy(log); after['races']['20261116-R12']['actual_moisture'] = 1.0
        with self.assertRaises(RuntimeError): m.assert_append_only(log, after)
        after = copy.deepcopy(log); after['races']['20261121-R01']['v2']['stage1']['value'] = 9
        with self.assertRaises(RuntimeError): m.assert_append_only(log, after)
    def test_v1_routine_still_runs_on_v2_rows(self):
        log = self.stage1(); v1ev = {'source_url': v1.URL, 'fetched_at': NOW.isoformat(), 'run_issued_at': None,
            'response': {'timezone': 'Asia/Tokyo', 'utc_offset_seconds': 32400, 'daily': {'time': ['2026-11-19', '2026-11-20', DAY],
            'precipitation_sum': [21.5, 0, 0], 'relative_humidity_2m_mean': [81, 55, 61], 'et0_fao_evapotranspiration': [.9, 1.21, 1.29]}}}
        before = copy.deepcopy(log['races']['20261121-R01']['v2'])
        v1.apply_predictions(log, races(), v1ev, NOW)
        r = log['races']['20261121-R01']; self.assertEqual(r['prediction_status'], 'saved'); self.assertEqual(r['predicted_moisture'], 2.0)
        self.assertEqual(r['v2'], before)
    def test_cli_on_copy(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'log.json'; p.write_text(json.dumps(base_log())); now = m.now_jst()
            ev = Path(d) / 'ev.json'; e = evidence(now); ev.write_text(json.dumps(e))
            day = now.date().isoformat(); sched = Path(d) / 's.json'
            sched.write_text(json.dumps([{'race_date': day, 'race_no': 1, 'post_time': '23:59'}]))
            out = subprocess.run([sys.executable, str(HERE / 'scripts/moisture_v2.py'), 'stage1', '--date', day, '--schedule', str(sched), '--log', str(p), '--export-public', str(Path(d) / 'pub.json'), '--forecast-evidence', str(ev)], capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, out.stderr); self.assertIn('stage1', out.stdout)
            self.assertEqual(json.loads(p.read_text()), json.loads((Path(d) / 'pub.json').read_text()))
if __name__ == '__main__': unittest.main()
