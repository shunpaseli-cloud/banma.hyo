# 公式着順の視認性（表示のみ）

共有OfficialFinishesでconfidence-results、既存自信度順、通常レース結果、展開したレース詳細の公式着順を表示。
従来はmetaの13.6px・通常ウェイト・opacity .75の一続きテキスト。新表示は1頭1行、上位3着を以下のclampで強調する（root 16px前提）。

| viewport | 着順 | 馬番 | 馬名 |
|---|---:|---:|---:|
| 320px | 24px | 20px | 18.4px |
| 375px | 25.1px | 20px | 18.95px |
| 880px | 32px | 24px | 22px |

着順weight 800、馬番/馬名700。行間1.35〜1.5、行余白10px、行間隔8px。4着以下・競走中止等は16pxで区別。明るい背景と濃い文字を明示し、詳細画面の暗い背景でも読めるようにした。
minmax(0,1fr)、flex-wrap、min-width:0、overflow-wrap:anywhereで長い馬名が折り返される。予想券（13.6px）・confidence・モデルスコア・データには変更なし。

npm testは両画面のSSRマークアップ、データ不変、3着強調、共有クラス、折返しCSS、上記clamp計算と既存テストを検証。npm run build成功。
追加のオフラインheadless Chrome実測は30秒でタイムアウトし、computed style/実viewportの成功とは主張しない。手動ブラウザ操作はしていない。再実行用はBANMA_HEADLESS=1 node tests/official-finishes.mjs。親による公開URLの目視確認を推奨。

公開時はindex/404と新JS/CSSのみを既存gh-pagesへ追加する。水分ログを含むすべてのJSONはコピーし直さず、公開済み最新値を維持する。
