# 馬場水分予測 v2（2段階・M7）の設計メモ

作成 2026-11-20 JST。設定 `frontend/src/data/moisture_model_v2.json`（version `moisture-v2-m7-20261117`）。

## 1. learned_model.json と水分の関係（整理）
| もの | 役割 | v2 での扱い |
|---|---|---|
| `learned_model.json` / `learned_model_rain.json` | 29特徴の着順モデル（通常用・雨用）。水分 ≥ 1.8% なら雨用を選ぶ | **変更なし**（SHA e657cd39…3893）。v2 はこのファイルを読みも書きもしない |
| `moisture.js`（v1 固定式） | 気象だけの日単位推定。過去走の水分帯（moisture_form・学習用 histEntry）にも使う | **そのまま**。過去走の特徴は学習時と同じ v1 のまま（モデルとの整合のため） |
| `moistureV2.js` + `moisture_model_v2.json` | 当該レースの水分（予測値）を2段階で出す独立モジュール | 新規。保存済みの値を受け取って予想エンジンへ渡すだけ |
| `moisture_prediction_log.json` | 発走前の水分予測と公式実測の追記型台帳 | v1 欄は不変。各レースに `v2` 欄を追記 |

予想エンジンで当該レースの水分を決める順番: **公式実測 `track_moisture` ＞ v2 保存値 `track_moisture_v2` ＞ v1 気象推定**。
この値が (a) 雨用／通常モデルの切替（1.8%）、(b) 特徴 track_moisture・moisture_form、(c) 旧4条件自信度テーブルの水分帯 に入るので、2R 以降で stage2 の値が変わると BOX・自信度も再計算されます。
v2 の値は `calculateRows(races, raw, generated, {moistureV2})` で渡したときだけ使われ、未指定なら従来と1バイトも変わりません（tests/moisture-v2.mjs で確認）。
- 生成CLI: `node scripts/generate_prediction_snapshot.mjs [--apply] --moisture-v2-log /workspace/banma-moisture-state/moisture_prediction_log.json`
- 公開ページ: 予想の再確認時に gh-pages の `moisture_prediction_log.json` を取得し、発走前に保存された v2 値があれば、その値で1回だけ再計算します（取得失敗時は従来どおり v1）。

## 2. モデル
- stage1（朝、1R 発走前に1回だけ保存）: `raw = b0 + b·[前開催日最終Rの公式水分, 当日降水, 開催間降水, 前開催日降水, 当日ET0, 開催間ET0, 当日湿度, 7日超の空き, (R−1), (R−1)×当日降水] − 季節補正[月グループ]`。丸め・clamp は v1 と同じ（0.5〜8、0.1 刻み）。
- 季節補正（点時点）: 11〜2月／7〜8月／その他の3グループごとに、**締切より前の 365 日の out-of-sample 残差（予測−実測）平均**を引く。各日の予測はその日より前だけで学習し直したもの。値は winter −0.165、summer +0.057、other +0.041（v1 で見られた「冬 +0.25 高め・夏 −0.3 低め」の偏りは、持ち越し項が既に吸収しているため。v1 の固定オフセットを足すと二重計上になり悪化する。下表）。`season_correction.enabled=false` で無効化可。
- stage2（1R 確定後、2R 発走前）: `value_k = stage1_raw_k + (1R公式水分 − stage1_raw_1)`（k ≥ 2）。各Rの発走前に保存できたものだけ有効。
- フォールバック: 1R の水分が 2R 発走前に取れない → その日は stage1（前日値ベース）のまま。前開催日の公式水分が無い／開催間の気象が欠ける → v1 固定式（`stage1_v1_fallback`）。

## 3. 検証（時系列・日付ブロックのブートストラップ 1000 回）
テスト 2024-01-20〜2026-11-16（410日・4,903R）。各テスト日はそれより前のレースだけで学習（拡張窓）。当日気象は前日発表の予報（Open-Meteo Previous Runs day1）、過去日は解析値。スクリプト `/workspace/banma_moisture_v2/validation/validate_v2.py`（本番と同じ `scripts/moisture_v2.py` の関数を使用）。

| 方式 | MAE | 中央値 | 偏り | 1.8%誤判定 | 対 v1 ΔMAE [95%CI] |
|---|---|---|---|---|---|
| v1 現行式 | 0.429 | 0.400 | +0.069 | 29.6% | — |
| stage1 季節補正なし | 0.325 | 0.255 | +0.020 | 18.6% | −0.104 [−0.138, −0.072] |
| **stage1 季節補正あり（本番）** | 0.322 | 0.236 | −0.007 | 18.8% | −0.108 [−0.144, −0.073] |
| stage1 季節ダミーを回帰に入れる | 0.325 | 0.252 | +0.018 | 19.4% | −0.104 [−0.137, −0.071] |
| stage1 + v1 固定オフセット（冬−0.25・夏+0.30） | 0.357 | — | — | 23.5% | 季節補正なし比 +0.032 [+0.015, +0.046]（悪化） |
| stage2 季節補正なし | 0.106 | 0.051 | −0.015 | 4.7% | −0.323 [−0.354, −0.295] |
| **stage2 季節補正あり（本番）** | 0.106 | 0.051 | −0.017 | 4.6% | −0.323 [−0.354, −0.295] |

季節補正の効果（あり − なし）: stage1 ΔMAE −0.003 [−0.011, +0.005]、stage2 −0.0002 [−0.0009, +0.0005]。差は有意ではなく、7〜8月の stage1 だけは +0.021 [+0.001, +0.044] と悪化。二重計上はしていないが、上積みもほぼない、が結論。

## 4. 台帳 `moisture_prediction_log.json` の v2 スキーマ（追記のみ）
トップレベルに `v2_models`（version → config_sha256）、`v2_schema`、`metrics_v2` を追加。各レースに:
```
"v2": {"model_version", "stage1": {value, raw, saved_at, forecast_key, forecast_retrieved_at, prev_meeting{date,race_no,actual,source,source_url}, features, config_sha256, fallback},
       "stage1_status": saved|saved_fallback_v1|missed_prestart|forecast_missing,
       "stage2": {status: saved|missed_prestart|anchor_missed_2R_start, value, raw, shift, saved_at, anchor{race_id, actual, source_url, retrieved_at, http_date, response_sha256, stage1_raw_R1, visible_moisture_by_race}, switch_changed_vs_stage1},
       "effective": {value, stage: stage1|stage2|stage1_v1_fallback, fallback, fallback_reason}, "attempts": [...]}
```
v1 の `predicted_moisture` 等と既存の予報・実測履歴は書き換えない（`assert_append_only` が検査し、違反なら書き込まず停止）。stage1/stage2 は一度保存したら上書きしない。v1 routine（moisture_log.py）は従来どおり動き、v2 欄を保持する（テスト済み）。

## 5. 実行
```sh
cd /workspace/banma-moisture-v2-runtime/frontend   # v2 を含むチェックアウト（routine 用の固定 worktree）
python3 scripts/moisture_v2.py stage1 --date "$DAY"   # 朝。日程は NAR RaceList から取得（--schedule でも可）
python3 scripts/moisture_v2.py stage2 --date "$DAY"   # 1R 発走後〜2R 発走前に数分おき。anchor_not_published なら再実行
python3 scripts/moisture_v2.py show --date "$DAY"
python3 scripts/fit_moisture_v2.py --cutoff YYYY-MM-DD --version moisture-v2-m7-YYYYMMDD   # 再学習（新 version として保存）
```
既定の台帳は正本 `/workspace/banma-moisture-state/moisture_prediction_log.json`（flock で v1 と同じロック）。公開は従来どおりこの JSON だけを gh-pages にコピーする。

## 6. 未確定
- 1R の公式水分が 2R 発走前に NAR に出るか（11/15 朝 09:50 時点の RaceList では空欄、レース後は全R表示までは確認済み）。11/21〜23 の 12:30〜17:00 JST に2分おき記録中（`/workspace/banma_moisture_v2/publish_timing/`）。
- 係数は 2026-11-16 までで固定。再学習は手動（version を上げる）。
