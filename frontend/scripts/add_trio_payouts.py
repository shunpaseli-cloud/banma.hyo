"""結果PDFから三連複の払戻を抽出し results_from_pdf.json / public/results.json に trio_payouts を追加。
レイアウトが段組みのため、各レースの1〜3着馬番の組と一致する「三連複 a－b－c N円」を探して紐付ける。"""
import json, re, subprocess, urllib.request, tempfile, os
C = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯'
P = re.compile(r'三連複\s*([%s])－([%s])－([%s])\s*([\d,]+)円' % (C, C, C))
for path in ['src/data/results_from_pdf.json', 'public/results.json']:
    d = json.load(open(path)); found = []
    for u in d['meta']['url']:
        f = tempfile.mktemp('.pdf'); urllib.request.urlretrieve(u, f)
        t = subprocess.run(['pdftotext', '-layout', f, '-'], capture_output=True, text=True).stdout; os.remove(f)
        found += [(frozenset(C.index(x) + 1 for x in m[:3]), int(m[3].replace(',', ''))) for m in P.findall(t)]
    out = {}
    for rid, rows in d['races'].items():
        top = frozenset(r['umaban'] for r in rows if r.get('finish') in (1, 2, 3))
        if len(top) != 3: continue
        pays = {p for k, p in found if k == top}
        if len(pays) == 1: out[rid] = {'combo': sorted(top), 'payout': pays.pop()}
    d['trio_payouts'] = out; json.dump(d, open(path, 'w'), ensure_ascii=False, indent=1)
    print(path, len(out), '/', len(d['races']))
