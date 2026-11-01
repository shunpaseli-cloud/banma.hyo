#!/usr/bin/env python3
"""公式「成績表」PDF (res1.pdf / res2.pdf) を解析し着順を JSON 化する。
出力: src/data/results_from_pdf.json と public/results.json（同一オリジン配信＝CORS不要）
形式: {"meta": {...}, "races": {"YYYYMMDD-Rnn": [{"finish","gate","umaban","name"}]}}
使い方: .venv/bin/python scripts/fetch_pdf_results.py [--date-id 0000001772] [--all]"""
import io, json, re, sys, unicodedata, urllib.request, datetime, pathlib
import pdfplumber

BASE = "https://banei-keiba.or.jp/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
N = lambda s: unicodedata.normalize("NFKC", s)
UA = {"User-Agent": "Mozilla/5.0 banma-hyo"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read()
# 着順 枠 馬番 馬名 性 齢  （着順の後は必ず 枠→馬番 の順。枠と馬番を取り違えない）
ROW = re.compile(r"^(\d{1,2}) ([1-8]) (\d{1,2}) (\S+?) ?(牡|牝|セン?|ｾﾝ) ?(\d+)")
RACE = re.compile(r"第 ?(\d+) ?競走")

def parse_column(text):
    out, cur = {}, None
    for l in (N(x).strip() for x in text.splitlines()):
        if (m := RACE.search(l)) and not ROW.match(l):
            cur = int(m.group(1)); out.setdefault(cur, []); continue
        if cur is not None and (m := ROW.match(l)):
            f, g, u = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= u <= 10 and f <= 10:
                tm = re.search(r"(\d)\.(\d{2})\.(\d)(?:\s|$)", l[m.end():])
                row = {"finish": f, "gate": g, "umaban": u, "name": m.group(4), "sex": m.group(5)[0], "age": int(m.group(6))}
                if bw := re.match(r"\s*(\d{3,4})\s+(\d{3})", l[m.end():]): row["body_weight"], row["sled_weight"] = int(bw.group(1)), int(bw.group(2))
                if tm: row["time"] = f"{tm.group(1)}.{tm.group(2)}.{tm.group(3)}"; row["time_sec"] = int(tm.group(1))*60+int(tm.group(2))+int(tm.group(3))/10
                out[cur].append(row)
    return out

def parse_pdf(data):
    races, date = {}, None
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pg in pdf.pages:
            t = N(pg.extract_text() or "")
            if m := re.search(r"(\d{4})年(\d+)月(\d+)日", t):
                date = f"{m.group(1)}{int(m.group(2)):02d}{int(m.group(3)):02d}"
            ws = pg.extract_words()
            xs = sorted({round(w["x0"]) for w in ws if N(w["text"]).startswith("第") and "競走" in N(w["text"])})
            cols = []
            for x in xs:  # 近い x をまとめる
                if not cols or x - cols[-1] > 50: cols.append(x)
            edges = [max(0, x - 4) for x in cols] + [pg.width]
            for a, b in zip(edges, edges[1:]):
                for no, rows in parse_column(pg.crop((a, 0, b, pg.height)).extract_text() or "").items():
                    if len(rows) > len(races.get(no, [])): races[no] = rows
    return date, races

def main():
    html = get(BASE + "race_starting_pdf.php").decode("utf-8", "ignore")
    ids = list(dict.fromkeys(re.findall(r"data/shpdf/(\d+/\d+/(\d+))/res1\.pdf", html)))
    if "--date-id" in sys.argv:
        w = sys.argv[sys.argv.index("--date-id") + 1]; ids = [x for x in ids if x[1] == w]
    ids = sorted(ids, key=lambda x: x[1], reverse=True)[: (len(ids) if "--all" in sys.argv else 3)]
    if not ids: raise SystemExit("成績表PDFリンクなし")
    allr, urls = {}, []
    for path, _ in ids:
        for n in (1, 2):
            u = f"{BASE}data/shpdf/{path}/res{n}.pdf"
            try: date, races = parse_pdf(get(u))
            except Exception as e: print("skip", u, e); continue
            urls.append(u)
            for no, rows in races.items():
                if date and rows:
                    ts = [r["time_sec"] for r in rows if "time_sec" in r]
                    if len(ts) >= 3:  # タイム指数: レース内偏差値 (速いほど高い)
                        mu = sum(ts)/len(ts); sd = (sum((t-mu)**2 for t in ts)/len(ts))**.5 or 1
                        for r in rows:
                            if "time_sec" in r: r["time_index"] = round(50 + 10*(mu - r["time_sec"])/sd, 1)
                    allr[f"{date}-R{no:02d}"] = sorted(rows, key=lambda r: r["finish"])
    doc = {"meta": {"source": "pdf", "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                    "url": urls, "races": len(allr)}, "races": allr}
    s = json.dumps(doc, ensure_ascii=False, indent=1)
    (ROOT / "src/data/results_from_pdf.json").write_text(s)
    (ROOT / "public").mkdir(exist_ok=True); (ROOT / "public/results.json").write_text(s)
    print(f"{len(allr)} races", list(allr)[:3])

if __name__ == "__main__": main()
