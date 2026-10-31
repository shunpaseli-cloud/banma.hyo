#!/usr/bin/env python3
"""banei-keiba.or.jp の公式出走表PDF (run1.pdf / run2.pdf) を取得・解析し
src/data/races_from_pdf.json と src/data/meta.json を書き出す。
使い方: cd frontend && python3 -m venv .venv && .venv/bin/pip install pdfplumber
        .venv/bin/python scripts/fetch_pdf_races.py [--date-id 0000001774]
失敗時は meta.json を {"source":"html"} にしてアプリ側で「データ未検証」警告を出させる。"""
import io, json, re, sys, unicodedata, urllib.request, datetime, pathlib
import pdfplumber

BASE = "https://banei-keiba.or.jp/"
LIST = BASE + "race_starting_pdf.php"
OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "data"
COLORS = {"白": 1, "黒": 2, "赤": 3, "青": 4, "黄": 5, "緑": 6, "橙": 7, "桃": 8}
N = lambda s: unicodedata.normalize("NFKC", s)
UA = {"User-Agent": "Mozilla/5.0 banma-hyo"}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()

ENTRY = re.compile(r"^(?:(\d) ([白黒赤青黄緑橙桃]) )?(\d{1,2}) (\S+) (\d{3}) ([☆△▲◇]?)(\S+(?: \S+)?)(?: (\S+))? ?(?:(牡|牝|セ) (\d+))?")
RACE = re.compile(r"第 ?(\d+) ?競走")
HEAD = re.compile(r"^8帯\d+ (.+?) 距離")

def parse_column(text, date):
    races, cur, lines = [], None, [N(l).strip() for l in text.splitlines()]
    pending_name = None
    for i, l in enumerate(lines):
        if m := HEAD.match(l): pending_name = m.group(1).strip(); continue
        if (m := RACE.search(l)) and not ENTRY.match(l):
            cur = {"race_no": int(m.group(1)), "name": pending_name or "", "entries": []}
            races.append(cur); continue
        if cur is None: continue
        m = ENTRY.match(l)
        if not m: continue
        gate = int(m.group(1)) if m.group(1) else None
        if gate is None:  # 枠が別行（同枠2頭など）
            for j in (i - 1, i + 1, i - 2, i + 2):
                if 0 <= j < len(lines) and (g := re.fullmatch(r"(\d) ([白黒赤青黄緑橙桃])", lines[j])):
                    gate = int(g.group(1)); break
            if gate is None and cur["entries"]: gate = cur["entries"][-1]["gate"]
        jockey = m.group(7).replace(" ", "")
        sex, age = m.group(9), m.group(10)
        if not sex:
            rest = l[m.end():] + " " + (lines[i + 1] if i + 1 < len(lines) else "")
            if s := re.search(r"(牡|牝|セ) (\d+)", l + " " + rest): sex, age = s.group(1), s.group(2)
        cur["entries"].append({"gate": gate, "umaban": int(m.group(3)), "name": m.group(4),
            "sled_weight": int(m.group(5)), "jockey": jockey, "weight_reduction": m.group(6) or None,
            "sex": sex, "age": int(age) if age else None})
    return races

def parse_pdf(data, date):
    races = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for pg in pdf.pages:
            # 列境界は見出し「枠」の x 座標から決める（4列レイアウト）
            xs = sorted(w["x0"] for w in pg.extract_words() if w["text"] == "枠") or [0]
            edges = [max(0, x - 8) for x in xs] + [pg.width]
            for a, b in zip(edges, edges[1:]):
                races += parse_column(pg.crop((a, 0, b, pg.height)).extract_text() or "", date)
    return races

def main():
    html = get(LIST).decode("utf-8", "ignore")
    ids = re.findall(r"data/shpdf/(\d+/\d+/(\d+))/run1\.pdf", html)
    if "--date-id" in sys.argv:
        want = sys.argv[sys.argv.index("--date-id") + 1]; ids = [x for x in ids if x[1] == want]
    if not ids: raise SystemExit("PDFリンクが見つかりません")
    path = ids[0][0]
    urls = [f"{BASE}data/shpdf/{path}/run{n}.pdf" for n in (1, 2)]
    races, date = [], None
    for u in urls:
        data = get(u)
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            t = N(pdf.pages[0].extract_text() or "")
        if m := re.search(r"令和(\d+)年(\d+)月(\d+)日", t):
            date = f"{2018 + int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        races += parse_pdf(data, date)
    # 重複（同じ競走番号）は頭数の多い方を採用
    best = {}
    for r in races:
        if len(r["entries"]) > len(best.get(r["race_no"], {"entries": []})["entries"]): best[r["race_no"]] = r
    races = sorted(best.values(), key=lambda r: r["race_no"])
    for r in races:  # 枠番は頭数から決定（9頭以上は外枠から2頭ずつ）
        n = len(r["entries"])
        for e in r["entries"]:
            u, d = e["umaban"], max(0, n - 8)
            e["gate"] = u if u <= 8 - d else 8 - d + (u - (8 - d) + 1) // 2
    out = []
    for r in races:
        if not r["entries"]: continue
        rid = f"{date.replace('-', '')}-R{r['race_no']:02d}"
        es = [dict(e, race_id=rid, horse_id=f"{rid}-{e['umaban']:02d}", recent_form=0.3) for e in r["entries"]]
        out.append({"race_id": rid, "race_date": date, "race_no": r["race_no"],
                    "name": f"帯広{r['race_no']}R {r['name']}".strip(), "track_moisture": None, "entries": es})
    if not out: raise SystemExit("PDF解析結果が0件")
    (OUT / "races_from_pdf.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
    (OUT / "meta.json").write_text(json.dumps({"source": "pdf", "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "race_date": date, "url": urls, "races": len(out)}, ensure_ascii=False, indent=1))
    print(f"OK {len(out)} races, {sum(len(r['entries']) for r in out)} entries ({date})")

if __name__ == "__main__":
    try: main()
    except BaseException as e:
        print("PDF取得失敗:", e, file=sys.stderr)
        (OUT / "meta.json").write_text(json.dumps({"source": "html", "error": str(e),
            "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}, ensure_ascii=False, indent=1))
        sys.exit(1)
