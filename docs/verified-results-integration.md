# 確定結果と学習用入力

`frontend/src/data/verified_results.json`は表示・照合専用。予測用results_from_pdf/過去走/learned_model/learned_weightsには混ぜない。public/verified-results.jsonは同内容の配布版。全着順・全券種払戻（100円当たり）・出典を収録し、オッズ・人気は除外。

11/6はNAR公式12Rで上位3頭と三連単/三連複組合せを再検証。11/7は取得時点で未公表、外れ・0円として扱わない。9Rアソノリキ、11Rクリスタルゴーストは競走中止（学習の数値着順から除外）。返還・取消等は通常の照合と分けて保留。

既存recommendations.jsonのselection_meta.top3/box_idx=[0,1,2]だけからBOX6順列を復元。結果から予想を再生成しない。100円×6点=600円の想定照合で購入記録ではない。見送りに投資を計上しない。
保存時刻2026-11-06 19:06:48 JSTは4R（16:00 JST発走）の発走後。事前予想成績として扱えない旨をUI表示。12Rは20:40 JST発走。

通常ビューの「同梱結果を入力欄へ」は入力だけで学習しない。学習ボタンは別操作。結果欄のJSON保存ボタン、またはpublic/feedback-inputs.jsonで入力を書き出す。
形式: `{race_id, results:{horse_id:positive_integer_finish}, meta:{status,source_urls,partial,excluded}}`。
既存feedback.updateWithResult(race,input.results)互換。ban_ei_feedback.py本体はリポジトリにないため未知のCLI形式との完全互換は主張しない。欠損・中止等を0着や最下位に変換しない。

再取得後（資料検証必須）:

```sh
python3 frontend/scripts/import_verified_results.py /workspace/banma_results_2026-11-06_07.json
cd frontend
node scripts/export_result_inputs.mjs
npm test
npm run build -- --base=/banma.hyo/
```

学習・OLSルーチンは開始しない。
