#!/usr/bin/env python3
"""公式成績PDF (res1/res2.pdf) から馬場水分を読む。
出走表PDF (run*.pdf) には水分は載っていない（発走前のため）。成績PDFでは各競走見出しの下に
「200m(晴 水分 2.2%)」形式で天候・水分が書かれる。4列レイアウトなので列ごとに切り出して
「第N競走」の直後に現れる水分をその競走に割り当てる。
使い方: python3 scripts/parse_moisture.py /tmp/banei_pdfs/*res*.pdf > out.json"""
import sys, re, json, unicodedata, pdfplumber
N = lambda s: unicodedata.normalize("NFKC", s)
RACE = re.compile(r"第 ?(\d+) ?競走"); MOIST = re.compile(r"\((\S+?) ?水分 ?([\d.]+) ?%\)")

def parse_moisture(path):
    out = []
    with pdfplumber.open(path) as pdf:
        t0 = N(pdf.pages[0].extract_text() or "")
        m = re.search(r"(20\d\d) ?年 ?(\d+) ?月 ?(\d+) ?日", t0)
        date = f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}" if m else None
        for pg in pdf.pages:
            ws = pg.extract_words()
            xs = sorted({round(w["x0"]) for w in ws if N(w["text"]).startswith("第") and "競走" in N(w["text"])})
            xs = [x for i, x in enumerate(xs) if i == 0 or x - xs[i-1] > 50] or [0]
            edges = [max(0, x - 8) for x in xs] + [pg.width]
            for a, b in zip(edges, edges[1:]):
                pending = None
                for l in N(pg.crop((a, 0, b, pg.height)).extract_text() or "").splitlines():
                    if r := RACE.search(l): pending = int(r[1])
                    if (mm := MOIST.search(l)) and pending:
                        out.append({"race_date": date, "race_no": pending, "weather": mm[1], "track_moisture": float(mm[2])}); pending = None
    for r in out:
        r["race_id"] = f"{r['race_date'].replace('-','')}-R{r['race_no']:02d}" if r["race_date"] else None
        r["source_pdf"] = path.split("/")[-1]
    return out

if __name__ == "__main__":
    rows = {}
    for p in sys.argv[1:]:
        for r in parse_moisture(p): rows.setdefault(r["race_id"], r)
    print(json.dumps(sorted(rows.values(), key=lambda r: r["race_id"] or ""), ensure_ascii=False, indent=1))
