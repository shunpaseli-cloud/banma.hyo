# 発走前水分予測の固定保存（モデルとは独立）

## 永続ファイル

- 正本: `/workspace/banma-moisture-state/moisture_prediction_log.json`（共有コンピュータ上、チェックアウトの切替から独立）
- 配布コピー: `frontend/public/moisture_prediction_log.json`。GitHub Pagesにも同名で配置。
- `races`の一意キーは`YYYYMMDD-Rnn`。各行に`date`, `race_no`, `scheduled_start_at`, `predicted_moisture`, `prediction_saved_at`, `prediction_status`, `actual_moisture`, `actual_observed_at`を保存。
- すべての時刻は+09:00、値と誤差の単位はpercentage point（2.4は水分2.4%を表す）。

予測は最初に成功した発走前スナップショットを採用し、上書きしない。取得失敗時は`forecast_missing`と試行履歴を残し、発走前のみ再試行可能。発走同時・以後は`missed_prestart`で予測値と保存日時をnullにし、後から埋めない。この締切超過状態は終端。2026-11-06以前の行は作成しない。

実測はNAR公式の確定結果の水分だけを独立して追記。未確定・取得失敗では埋めない。値または出典が訂正されたら`actual_history`へrevisionを追加し、既存予測は不変。同値・同出典の再取得は冪等。公式の独立した測定時刻は資料にないため`actual_observed_at=null`と明示し、発走時刻を測定時刻に置き換えない。公式取得時刻と追記時刻は別に保存。

`fcntl.flock`で正本単位の排他制御、同一ディレクトリの一時ファイル→fsync→os.replaceで原子的に更新。正本のロック中に配布コピーも更新する。

## 予報の根拠と限界

Open-Meteoのlive `/v1/forecast`を使用。archive/reanalysisを予測保存に使わない。URL、取得日時、HTTPヘッダ、応答ハッシュ、応答全体、入力3日分、式version/hash、入力hashを残す。入力欠損・古すぎる取得・取得日時が未来の場合は欠測とする。

**Best Match seamless APIは個別の発行runを返さないため、run_issued_atはnull（不明）を明示。取得時刻やgenerationtime_msをrunの発行時刻とは呼ばない。** 各日が複数runの継ぎ合わせである可能性があり、厳密な単一run追跡は今回の記録では保証しない。入力と応答自体は固定保存済み。

式は既存moisture.jsの固定係数・clamp・丸めを再現（入力欠損時だけ安全側でnull）。日単位の推定なので同一日に保存した各Rの値が同じでも仕様どおり。既存アプリのmoisture.jsやモデルへの入力・ランキングを置換しない。

## 実行

```sh
DAY=$(TZ=Asia/Tokyo date +%F)
RESULTS=/tmp/banma_results_${DAY}.json
# 既存の公式取得処理（別担当が整備。ここでは変更しない）
python3 /workspace/banma_scripts/fetch_banei_results.py "$DAY" "$RESULTS"
python3 /workspace/banma-confidence-dates/frontend/scripts/moisture_log.py \
  --date "$DAY" --schedule "$RESULTS" --actuals "$RESULTS"
```

当日の公式日程が取得できなければ停止し、未取得を非開催と断定しない。初回だけ既存同梱日程を利用したが、将来の開催日は公式取得JSONの発走時刻を使う（同梱36Rを将来の日程として流用しない）。CLIに時刻偽装オプションはない。テストの模擬時刻・模擬値は一時ディレクトリのみ。

## 実行基盤

現状GitHubにはPagesの配信ジョブだけで、定期保存workflowはなく、既定workflow権限はread。権限拡大やsecret追加はしていない。静的SPA/localStorageでの保証にも頼らない。

親エージェントが既存routineにCLI実行を組み込む必要がある。提案は08:16 JSTに当日の全Rを一括保存、欠測再試行のため12:16 JSTにも確認（開催が週末にもあるため全曜日）。次の朝は2026-11-08 08:16 JST。公式実測の追記は既存の30分ごと結果取得routineに上の2つ目のコマンドを組み込む。定期実行の設定完了までは自動保存を保証しない。ネットワーク障害等は欠測として通知する。

公開時は既存gh-pages作業ツリーの最新状態を確認し、このJSONだけをコピー・コミット・通常pushする。既存HTML/JS/モデル/結果データを上書きしない。後続のアプリ再ビルド前にも正本から配布コピーを再同期する。

`metrics`は発走前保存済みかつ実測確定のペアだけでn/MAE/RMSE/biasを計算。過去値の捏造・回顧予測、学習やOLSの再開は行わない。
