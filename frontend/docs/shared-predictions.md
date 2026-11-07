# 共通の最新版予想

- 全画面の主表示は `predictionSnapshot.js` の単一external store。各画面の独立predictは禁止。
- 起動、画面/日付変更、focus/pageshow/visibility、表示中60秒ごとに `prediction-version.json` をno-store取得。新版JSONはmanifestのSHA256と全行version/6券を検証して採用する。
- 同じ処理が一つのOpen-Meteoレスポンスを取得。daily入力が変わった場合だけ `calculateSnapshot.js` で全36Rを一括計算し、全画面へ一回でpublishする。同時refreshは一つのPromiseに集約。変更がなければ再計算しない。
- ブラウザ版は履歴キー `banma.snapshot.history.<version>` へ追記（上書き拒否）。別タブ/再訪も共通latest pointerから履歴を採用して最新確認。履歴容量不足/利用不可は明示し、事前精度検証対象にはしない。履歴は端末内であり公開サーバーへの自動アップロードではない。
- 通信失敗/hash/version不一致は最後の共通版を残し「最新確認できず」と表示。最新取得時刻と予想更新時刻は区別する。古い値を最新と偽らない。
- `prediction-history/legacy-20261106T190648/` は上書き前のJSONと照合データをbytewise保全。旧事前7R/0的中を新版の事後参考成績と合算しない。
- 発走以後に計算する版は事後再計算。過去日の現在API入力は発走前予報の復元ではない。水分予測正本ログやモデル/重み、公式結果生データは変更しない。glob guardの別問題は変更していない。

## 公開保存版を更新するCLI

```
cd /workspace/banma-confidence-dates/frontend
node scripts/generate_prediction_snapshot.mjs --apply
npm test
npm run build -- --base=/banma.hyo/ --manifest
```

`export_recommendations.mjs` はこの新CLIへ委譲。`--apply` なしは `/workspace/banma-prepared-snapshot` への準備のみで、公開sourceを上書きしない。applyは排他lock、immutable history、atomic writeを使用。

公式結果取得/追記routineは従来通り。`materialize_confidence_results.py` は新snapshotがあればそれを使い、予想を生成せず結果だけjoinする。

今回新しいserver cron/workflow/routineは作成していない。画面が開いている間/再訪時の最新化は実装済みだが、誰も開いていない間のpublic JSON無人更新・ブラウザ履歴のサーバー集約は実装していない。必要なら親がこのCLI+通常build/deployを独立routineに設定する（OLS学習routineは再開しない）。旧checkoutや旧no-trifectaからのdeployで新版を巻き戻さないこと。
