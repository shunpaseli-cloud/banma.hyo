"""NAR取得JSONを表示専用データへ変換。予測用過去走・学習モデルには書き込まない。"""
import json
import sys
from pathlib import Path


def convert(raw):
    out = {'schema_version': 1, 'meta': {
        'retrieved_at_asia_tokyo': raw['meta']['取得時刻JST'],
        'source': 'NAR公式（単一出典）', 'payout_unit_yen': 100,
        'note': '表示・照合専用。予測入力や自動学習には使用しない。オッズ・人気は除外。',
    }, 'dates': {}, 'races': {}}
    for day, info in raw['days'].items():
        status = 'not_held' if info.get('開催') is False else 'final' if info.get('取得R数') == 12 else 'provisional'
        out['dates'][day] = {'status': status, 'note': info.get('reason', info['status'])}
    for race in raw['races']:
        rid = f"{race['date'].replace('-', '')}-R{race['race_no']:02d}"
        final = race['status'] == '確定結果公開'
        rows = race.get('着順') or []
        finishes = [{'finish': r['着順'], 'umaban': r['馬番'], 'name': r['馬名'],
                     'status': 'finished' if isinstance(r['着順'], int) else {'中止': 'dnf', '取消': 'withdrawn', '除外': 'excluded'}.get(r.get('着順表記') or r.get('着差'), 'unknown'),
                     'time': r.get('タイム'), 'time_sec': r.get('タイム秒')} for r in rows]
        payouts = {}
        for key, label in [('trio', '三連複'), ('trifecta', '三連単')]:
            values = race.get(label)
            payouts[key] = None if values is None else [{'combo': [int(n) for n in p['組合せ'].split('-')], 'yen': p['払戻円']} for p in values]
        if final:
            assert len(rows) == race['頭数'], rid
            assert len({r['馬番'] for r in rows}) == len(rows), rid
            top = [next(r['馬番'] for r in rows if r['着順'] == n) for n in [1,2,3]]
            assert any(p['combo'] == top for p in payouts['trifecta']), rid
            assert any(sorted(p['combo']) == sorted(top) for p in payouts['trio']), rid
        out['races'][rid] = {'race_date': race['date'], 'race_no': race['race_no'],
            'status': 'final' if final else 'provisional', 'note': race.get('reason'),
            'race_name': race.get('競走名'), 'start_time_jst': race.get('発走時刻'),
            'source_urls': [race['source_url']], 'finishes': finishes, 'payouts': payouts,
            'all_payouts': {kind: [{'combo': p['組合せ'], 'yen': p['払戻円']} for p in values]
                            for kind, values in race.get('払戻金_全券種', {}).items()},
            'refunds': race.get('返還', [])}
    return out

if __name__ == '__main__':
    data = convert(json.loads(Path(sys.argv[1]).read_text()))
    root = Path(__file__).resolve().parents[1]
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    for target in [root/'src/data/verified_results.json', root/'public/verified-results.json']:
        target.write_text(text)
    print(f"Validated and imported {len(data['races'])} race statuses; no prediction/model updates")
