import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

MODULE = Path(__file__).resolve().parents[1]/'scripts/moisture_log.py'
spec = importlib.util.spec_from_file_location('moisture_log', MODULE)
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class MoistureLogTests(unittest.TestCase):
    def setUp(self):
        self.now=m.parse('2026-11-07T08:16:00+09:00')
        self.races=m.schedule_rows([{'race_date':'2026-11-07','race_no':1,'post_time':'14:40'}], '2026-11-07')
        self.e={'source_url':m.URL,'fetched_at':self.now.isoformat(),'run_issued_at':None,
            'response':{'timezone':'Asia/Tokyo','utc_offset_seconds':32400,'daily':{
                'time':['2026-11-05','2026-11-06','2026-11-07'],
                'precipitation_sum':[7,11.7,1.4],'relative_humidity_2m_mean':[76,80,52],
                'et0_fao_evapotranspiration':[1.02,1.37,1.95]}}}
    def save(self,when=None,evidence=None):
        return m.apply_predictions(m.initial(),self.races,self.e if evidence is None else evidence,when or self.now)
    def test_before_at_after(self):
        start=m.parse(self.races[0]['scheduled_start_at'])
        self.assertEqual(self.save()['races']['20261107-R01']['predicted_moisture'],2.4)
        for dt in [start,start+timedelta(seconds=1)]:
            row=self.save(dt)['races']['20261107-R01']
            self.assertEqual(row['prediction_status'],'missed_prestart')
            self.assertIsNone(row['prediction_saved_at']);self.assertIsNone(row['predicted_moisture'])
    def test_timezone(self):
        a=self.save(self.now.astimezone(timezone.utc))
        self.assertTrue(a['races']['20261107-R01']['prediction_saved_at'].endswith('+09:00'))
        with self.assertRaises(ValueError):m.parse('2026-11-07T08:16:00')
        with self.assertRaises(ValueError):self.save(datetime(2026,11,7,8,16))
    def test_first_snapshot_immutable_idempotent(self):
        a=self.save();before=copy.deepcopy(a)
        b=copy.deepcopy(self.e);b['response']['daily']['precipitation_sum'][-1]=100
        m.apply_predictions(a,self.races,b,self.now+timedelta(minutes=10))
        self.assertEqual(before,a)
    def test_forecast_missing_and_retry(self):
        a=m.initial();m.apply_predictions(a,self.races,None,self.now,'network failed')
        self.assertEqual(a['races']['20261107-R01']['prediction_status'],'forecast_missing')
        m.apply_predictions(a,self.races,self.e,self.now+timedelta(minutes=1))
        self.assertEqual(a['races']['20261107-R01']['prediction_status'],'saved')
        self.assertEqual(len(a['races']['20261107-R01']['attempts']),1)
    def test_no_archive_future_stale_or_missing_inputs(self):
        for edit in ['archive','future','stale','missing','zone']:
            e=copy.deepcopy(self.e)
            if edit=='archive':e['source_url']='https://archive-api.open-meteo.com/v1/archive'
            if edit=='future':e['fetched_at']=(self.now+timedelta(seconds=1)).isoformat()
            if edit=='stale':e['fetched_at']=(self.now-timedelta(hours=2)).isoformat()
            if edit=='missing':e['response']['daily']['precipitation_sum'][-1]=None
            if edit=='zone':e['response']['utc_offset_seconds']=0
            row=self.save(evidence=e)['races']['20261107-R01']
            self.assertIsNone(row['predicted_moisture']);self.assertEqual(row['prediction_status'],'forecast_missing')
    def actual(self,value=2.2,status='確定'):
        return {'races':[{'date':'2026-11-07','race_no':1,'status':status,'馬場水分%':value,
            'source_url':'https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?k_raceDate=2026%2f11%2f07&k_raceNo=1&k_babaCode=3',
            '取得時刻JST':'2026-11-07T15:00:00+09:00'}]}
    def test_actual_only_corrections_and_metrics(self):
        log=self.save();snapshot=copy.deepcopy(log['races']['20261107-R01'])
        when=m.parse('2026-11-07T16:00:00+09:00')
        self.assertEqual(m.append_actuals(log,self.actual(),when),1)
        row=log['races']['20261107-R01']
        for key in snapshot:
            if not key.startswith('actual'):self.assertEqual(snapshot[key],row[key])
        self.assertIsNone(row['actual_observed_at'])
        self.assertAlmostEqual(m.metrics(log)['mae'],.2)
        self.assertEqual(m.append_actuals(log,self.actual(),when),0)
        self.assertEqual(m.append_actuals(log,self.actual(2.3),when),1)
        self.assertEqual([h['actual_moisture'] for h in row['actual_history']],[2.2,2.3])
    def test_unconfirmed_actual_and_prestart_ignored(self):
        log=self.save()
        self.assertEqual(m.append_actuals(log,self.actual(status='未確定'),m.parse('2026-11-07T16:00:00+09:00')),0)
        self.assertEqual(m.append_actuals(log,self.actual(),self.now),0)
        self.assertIsNone(log['races']['20261107-R01']['actual_moisture'])
    def test_no_retrospective_prediction_or_metric(self):
        log=self.save(m.parse('2026-11-07T16:00:00+09:00'))
        m.append_actuals(log,self.actual(),m.parse('2026-11-07T16:00:00+09:00'))
        self.assertIsNone(log['races']['20261107-R01']['predicted_moisture'])
        self.assertEqual(m.metrics(log)['n'],0)
        m.apply_predictions(log,self.races,self.e,self.now)
        self.assertIsNone(log['races']['20261107-R01']['predicted_moisture'], 'missed deadline is terminal even if clock later moves backwards')
        self.assertEqual(m.schedule_rows([{'race_date':'2026-11-06','race_no':1,'post_time':'14:40'}],'2026-11-06'),[])
    def test_schedule_changes_fail_closed(self):
        log=self.save();new=copy.deepcopy(self.races);new[0]['scheduled_start_at']='2026-11-07T15:00:00+09:00'
        with self.assertRaises(ValueError):m.apply_predictions(log,new,self.e,self.now)
    def test_concurrent_cli_lock_and_idempotent_export(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);now=m.stamp();start=now+timedelta(hours=2);day=start.date().isoformat()
            schedule=[{'race_date':day,'race_no':1,'post_time':start.strftime('%H:%M')}]
            evidence=copy.deepcopy(self.e);evidence['fetched_at']=now.isoformat()
            evidence['response']['daily']['time']=[(start-timedelta(days=i)).date().isoformat() for i in [2,1,0]]
            (root/'schedule.json').write_text(json.dumps(schedule));(root/'forecast.json').write_text(json.dumps(evidence))
            cmd=[sys.executable,str(MODULE),'--date',day,'--schedule',str(root/'schedule.json'),
                 '--forecast-evidence',str(root/'forecast.json'),'--log',str(root/'log.json'),
                 '--export-public',str(root/'export.json')]
            processes=[subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
            reports=[]
            for process in processes:
                out,err=process.communicate(timeout=15);self.assertEqual(process.returncode,0,err);reports.append(json.loads(out))
            self.assertEqual(sum(r['new_predictions'] for r in reports),1)
            self.assertEqual(json.loads((root/'log.json').read_text()),json.loads((root/'export.json').read_text()))
    def test_atomic_write_complete_json(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'log.json';a=self.save();m.write_atomic(p,a)
            self.assertEqual(json.loads(p.read_text()),a)
            m.write_atomic(p,a);self.assertEqual(list(Path(d).iterdir()),[p])

if __name__=='__main__':unittest.main()
