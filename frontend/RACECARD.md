# 出走表ページ（view=racecard）

- URL: `?view=racecard&date=YYYY-MM-DD`（日付省略時は今日以降で最も近い収録日）
- データ: `src/data/racecards/racecard_YYYY-MM-DD.json`（schema `banma-racecard-v1`）。同じファイルを `public/racecards/` にも公開。
- 出典: 公式出走表PDF（banei-keiba.or.jp）を正、umanity `racecard.php?race_id=YYYYMMDD03KKNNRR` と NAR `DebaTable` で頭数・馬番・馬名・性齢・重量・騎手・調教師を照合。umanityの4文字切詰め表記はPDFの正式名で補正し、各レースの `verification.notes` に記録。
- 未発表の馬体重・オッズ・人気は `null`。
- 予想・学習データ（`races_from_pdf.json`, `past/`, `prediction_snapshot.json`, `learned_model.json`）とは独立しており、このページの追加で予想・結果・学習は変わらない。
- 取得・解析スクリプトと生データ: `/workspace/banma_racecards_20261114_15/`（box上）。
