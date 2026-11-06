# オッズ・人気の削除 (2026-11-06)

## 削除したもの
- エントリの `odds` / `popularity` フィールド（umanity JSON 全件）
- 市場との順位相関 ρ（確定単勝オッズとの Spearman）— 確定オッズ依存のため廃止
- スクレイパー (`/tmp/uman*/scrape.py`) でのオッズ・人気の保存

## 残しているもの
- 払戻 (`payouts` / trio_payouts / trifecta_payouts / win_payouts) — 結果の円であり予想オッズではない
- OLS 特徴量（水分・斤量・体重・年齢・性・頭数・枠・馬番・騎手・過去着順など 24 個）— オッズ非依存

## 本番
予測コード (`learnCore.js` FEATURE_NAMES) はもともとオッズ未使用。データからも削除済み。
