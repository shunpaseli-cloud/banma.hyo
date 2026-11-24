# confidence-results（独立した保存推奨・結果画面）

- URL: `?view=confidence-results&date=2026-11-07`。既存の自信度順タブは維持し、日付選択を共用。日別まとめページは再作成しない。
- `src/data/confidence-results.json` / `public/confidence-results.json`に、既存recommendations.jsonのrecommended=trueだけをコピーする（15R: 11/6=2、11/7=6、11/8=7）。元ファイルのSHA-256を保存。
- sourceのconfidence、axis/top3、score、past_form、選定理由commentは完全に同値。モデル・ランキングを呼び直さない。
- 3頭の全順列6券を明示。1券100円・1R600円の想定で、実購入記録とは区別。
- 軸・相手の保存済み特徴、スコア、コメント、軸の保存寄与だけを表示する。未保存の寄与率や理由を創作しない。
- 公式の確定発表時刻は資料にないためnull。公式取得時刻（JST）と同一視しない。11/6は初回取得バッチ時刻、11/7は各Rの取得時刻とHTML hashを保持。

11/6は全12R確定。11/7は2026-11-08 05:24 JSTのNAR公式取得で全12R確定。上位3と三連複・三連単組合せを再確認し、同時取得したraw HTMLから全着順も取り込む。オッズ・人気は表示用JSON・学習用入力へ入れない。11/7 4Rの2頭競走中止は数値着順なしとして分離。

11/6〜7の推奨8Rは8R照合、的中0・外れ8、想定投資4,800円、払戻0円。ただし11/6 4Rは発走後保存の参考照合であり、事前成績に含めない。発走前保存分は7R・的中0・想定投資4,200円。11/8推奨7Rは未確定・照合保留で、外れや0円とはしない。

更新手順（結果のみ、モデル再学習なし）:

```sh
python3 /workspace/banma_scripts/fetch_banei_results.py 2026-11-07 /tmp/banma_results_2026-11-07.json
cd frontend
python3 scripts/merge_live_results.py /tmp/banma_results_2026-11-07.json
python3 scripts/apply_result_source_audit.py /tmp/banma_results_2026-11-06_07_reconciled.json /tmp/banma_results_source_audit_2026-11-06_07.json
python3 scripts/materialize_confidence_results.py
node scripts/export_result_inputs.mjs
npm test
npm run build -- --base=/banma.hyo/
```

`results_from_pdf.json`等の予測用履歴には結果を混ぜない。表示専用verified_resultsだけを更新する。学習入力JSONは24R/230頭、4頭の競走中止を除外。入力を出力するだけで学習は実行しない。

水分ログの別依頼: 11/7 8〜12Rは11/7 18:18 JSTに保存済みの5予測を維持。11/8全12Rを05:24:59 JSTに各1.9%で発走前保存済み。公式日程と05:27 JSTに全R照合、時刻不一致なし。11/7全12Rの実測欄を追記済み、比較可能5RのMAE=0.28 pp、RMSE≈0.28284 pp。定期実行の設定は親routine側の残作業であり保証しない。正本・コマンドはmoisture-prestart-ledger.md参照。

05:28 JSTの別担当canonical/auditと24Rすべての上位3・三連複・三連単・保存confidence/BOXを数値照合。umanity・スポーツナビ・netkeibaの取得成功結果との一致および出典URLを表示専用JSONに追記。Xには結果投稿がなく照合根拠には使わない。reference_onlyのhitはnull、事前成績は7Rのみとして表示する。
