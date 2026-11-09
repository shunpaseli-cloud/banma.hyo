# 重賞×4歳以上: graded5 + 出走表スコア合成 BOX（graded5-age4-v1）

依頼 t279u。重賞かつ4歳以上のみのレースで、三連単3頭BOXを **出走表スコア（card-score-age4）** と **直近5走ロジスティック（graded5）** の等重み合成で選ぶ。
**点数（常に6点）、購入/見送りゲート、自信度（旧4条件テーブル）は変更しない。**

## 適用範囲

| レース | BOXの3頭 | 自信度・見送り |
|---|---|---|
| 重賞かつ pure_O（全出走予定馬が4歳以上）かつ race_date ≥ 2026-11-09 | combined = 0.5·z(card_u) + 0.5·z(graded_logit)、上位3頭 | 29特徴の軸で従来どおり |
| 非重賞の pure_O | card-score-age4 のみ（t269） | 従来どおり |
| 3歳以下のみ・混合年齢 | 29特徴の現行BOX | 従来どおり |
| 2026-11-08 以前（保存済み予想） | 再生成しない | 不変 |

## 重賞の事前判定（発走前）

本番カードに公式 `grade` が無い場合があるため、次のいずれかで重賞と判定する（t276主定義 BG1/2/3 に整合）:

1. `race.grade` / `metadata.grade` ∈ {BG1, BG2, BG3}
2. レース名に `(BG1)` / `(BG2)` / `(BG3)` / `BG1` 等
3. `grade_races.json` の `name_keywords`（ばんえい記念・帯広記念・グランプリ等）の部分一致

準重賞はキーワードに含めず、重賞扱いにしない。

## モデル

`learned_model.json` の `graded5_age4` セクション（既存29特徴と `card_score_age4` は不変。13,911数値 hash `3b20528d…` を維持）。

- 特徴（レース日より前の出走のみ）: last5_mean_norm_finish, last5_win_rate, career_win_rate_before, last_start_finish, days_since_last, prior_graded_count, n_prior_starts
- 標準化: 学習窓の平均/SD。ロジスティック P(top3)、L2 C=1
- 学習: 重賞かつ age≥4 の finished 出走、日付 ≤ 2026-11-08（n=548）
- 履歴: `src/data/graded_form_history_age4.json`（〜2026-11-08、前日以前のみ）
- 欠測: finished 先行が無い馬は `imputation.no_finished_prior`（文書化済み）
- 合成ルール（評価前に固定）: レース内zスコアの平均。表示軸は合成1位。メムロはBOX強制

## 検証（デプロイ前）

Walk-forward（重賞 pure_O、min_train=40、日ブロックBS1000）: n=55

| 方式 | BOX的中率 |
|---|---:|
| card のみ | 14.55% |
| graded logit 上位3のみ | 3.64% |
| **combined** | **18.18%** |
| combined−card | +3.64pt［−7.3, +16.4］（ゼロまたぎ・標本小） |

参考: t276 の top3 AUC 0.702 vs 帰無 0.562（確率校正の話であり、BOX的中そのものではない）。

## 更新手順

1. クリーン結果JSONを更新し history_through / effective_from を決める
2. `python3` で `analysis/graded5-age4/` の fit（または同等スクリプト）→ `node analysis/graded5-age4/merge_into_learned_model.mjs`
3. `npm test` → build → gh-pages デプロイ
