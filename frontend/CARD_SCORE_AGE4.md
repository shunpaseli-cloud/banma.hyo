# 4歳以上限定 出走表スコアによるBOX候補選定（card-score-age4-v1）

依頼 t269u。4歳以上だけのレースで、三連単3頭BOXの3頭を出走表の個馬スコアで選ぶ。
**点数（常に6点・600円）、購入/見送りゲート、自信度は変更しない。**

## 適用範囲
| レース | BOXの3頭 | 自信度・見送り |
|---|---|---|
| 取消・除外を除く全出走予定馬が4歳以上（pure_O）かつ race_date ≥ 2026-11-09 | card-score-age4（PL集合最大） | 29特徴の軸で従来どおり（条件別テーブル） |
| 3歳以下のみ・混合年齢 | 29特徴の現行BOX（変更なし） | 従来どおり |
| 2026-11-08 以前（保存済み予想） | 再生成しない（行は不変） | 不変 |
| 年齢/ソリ欠測、カード名からクラスが読めない、候補3頭未満、同梱履歴後〜前日の開催に候補馬が出走（`history_gap`） | 29特徴の現行BOX | 従来どおり |

- 年齢帯は出走表の年齢で判定（実験と同じ: <=3 を Y、>=4 を O）。
- 軸の扱い: 自信度テーブルと見送りゲートは29特徴モデル1位の past_form 等で引く（`selection_meta.confidence_axis`）。表示上の「軸」（`selection_meta.axis`）はBOX内の出走表スコア1位。BOXは全順列6点なので軸は券種に影響しない。
- メムロボブサップ: pure_O に出走すれば必ずBOXに含め（メムロを含む集合の中でPL最大）、表示軸に固定。自信度補正は従来の29特徴側のまま。

## モデル
`learned_model.json` の `card_score_age4` セクション（既存29特徴の値は不変。13,911数値のhash 3b20528d… を維持）。
- 17特徴（M1、事前登録）: w_rel, w_delta_prev, w_minus_best_top3, best_top3_missing, female, age_months, form_last1, form_avg3, win_rate5, top3_rate5, log_starts, log_days_since, no_history, last_dnf, class_change, class_unknown_or_switch, scratch_hist
- 標準化: 学習窓の平均/標準偏差。線形効用 u=z·β、Plackett-Luce 上位3着尤度、L2 λ=1。
- 学習窓: pure_O 3,630R（2022-01-02〜2026-11-08、発効日前の全確定データ）。実験の月次walk-forwardと同一レシピ（2026-11月モデルの再現差 0.0）。
- BOX: p=softmax(u)。6順列のPL確率和が最大の3頭集合。
- 履歴: `src/data/card_history_age4.json`（公式確定成績、2026-11-08まで、前日以前のみ）。当日結果は使わない。

## 検証
`tests/card-score-age4.mjs`: 年齢帯判定、本番カード名のクラス解析、実験 prediction_rows と同じ月次係数での特徴/効用/BOX一致（150R中150R一致）、保存済み36Rの不変、3歳以下/混合の不変、ゲート・自信度不変、history_gap とメムロ特例。

## 更新手順（手動）
1. 公式確定成績のクリーンJSONと実験の races_unified.json を更新
2. `python3 analysis/card-score-age4/fit_and_export.py`（HISTORY_THROUGH / EFFECTIVE_FROM を更新）→ `node analysis/card-score-age4/merge_into_learned_model.mjs`
3. `npm test` → build/deploy。ルーティンは作成していない。

関連: 重賞×pure_O は `GRADED5_AGE4.md`（graded5 合成）が優先。非重賞 pure_O は本方式のまま。
