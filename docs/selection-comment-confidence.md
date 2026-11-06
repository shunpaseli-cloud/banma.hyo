# 選定理由コメント + confidence（2026-11-06）

各レースの買い目ブロックに `selection_comment`（日本語）と `confidence`（0〜1）を付与。

- 生成: `frontend/src/selectionReason.js` → `buildRaceRecommendation(race, preds)`
- JSON: `frontend/src/data/recommendations.json`（`public/` にも同梱）。再生成は `npx vite-node scripts/export_recommendations.mjs`
- confidence: `confidence_bands.json`（prod BOX123・pf≥0.65・k=0.05・plus_hjz の過去実績）を
  pf帯×頭数帯×水分帯×重賞 で照合（joint→coarse→pf→baseline）
- UI: RaceCard ヘッダの推奨/見送り、TrioPayout の選定理由ボックス
- 付随修正: OLS `sd≈0` を `max(sd,1e-9)` にして着順スコアの NaN を解消
