# 新聞風の短い各馬寸評（コメントのみの更新）

`learned_model.json` に以前はコメント欄がなかったため、非予測メタデータ `comment_style` だけを追加した。既存キー・学習係数・閾値・重み・学習日・過去snapshotは一切変更しない。再学習もしない。

`sync_comment_style.mjs` が実際にこの欄を読み、小さな `comment_style.json` / 公開 `comment-style.json` に投影する。test/build前に同期し、全画面共通の `SelectionComment` がそのテンプレートを利用。大きなモデルを寸評表示のために追加読込しない。

各選定馬は馬名と一つの短い段落のみ。保存された正寄与のうち説明可能な項目と選定役割を使い、数値・脚質・好調・適性を新しく創作しない。記録不足では選定順位と役割の説明に限定する。非推奨は参考扱いを明示。

予想は再生成しない。共有ストア/予想版/保存日時/BOX/confidence/結果/水分ログ/過去historyは不変。既存保存版の `meta.models` はその予想を作った時点の元モデルのhashを保持する。今回のコメント欄追加後のファイルhashは公開 `comment-style.json` と寸評の `data-comment-model` で別に追跡し、当時の予想生成を装わない。今後の正規CLI exportは従来どおりその時のファイルhashを記録する。

検証：comment_styleを除いたモデルをJSON正規化したhashは元ファイルhashと一致。全13,911個の数値のhashも不変。同じ保存気象・時刻の全36R計算結果はJSON全体で完全一致。これにより順位/confidence/BOXだけでなく全計算出力の不変性を検証する。
