# ばん馬表（フロントエンドのみ版）

ばんえい競馬の出走表と予想スコアを、スマホのブラウザだけで表示する Vite + React の SPA です。サーバーも API 通信も使いません。

- 予想ロジック: `frontend/src/feedback.js`（`ban_ei_feedback.py` を移植。`horseScore` / `predict` / `savePrediction` / `updateWithResult` / `accuracyReport`）
- 学習率 `LEARNING_RATE = 0.05`。重み・予想・結果は `localStorage` に保存します
- レースデータ: `frontend/src/data/races.json`（12レース同梱）
- 最初は2レースを表示し、「もっと見る」を押すと2レースずつ追加します（配列の limit/offset を使います）
- 各レースの「着順を入力して学習」で結果を入力すると、予想の重みが更新されます

## セットアップ・ビルド
```bash
cd /home/workdir/banma-hyo/frontend
npm install
npm run build        # dist/ を生成
```

## スマホで開く（同じ Wi‑Fi 内）
```bash
npx vite preview --host --port 4173
```
表示される `http://<PCのIP>:4173/` をスマホのブラウザで開きます。
開発中に使う場合は `npx vite --host` を実行します。

> `dist/index.html` をスマホで直接（file://）開くと、ES モジュールが読み込めずに画面が真っ白になることがあります。上の preview か、下の公開方法を使ってください。

## 公開する（Vercel / Netlify）
- **Netlify**: https://app.netlify.com/drop を開き、`frontend/dist` フォルダをドラッグ＆ドロップします。
- **Vercel**: `npx vercel deploy frontend/dist` を実行するか、ダッシュボードで新しいプロジェクトを作ります（Root Directory: `frontend`、Build Command: `npm run build`、Output: `dist`）。

ビルドでは `base: './'` を指定しているので、サブパスに置いても動きます。

## 自動結果取得（スクレイピング）

### 使い方
1. レース一覧上部の「結果を自動取得」ボタンを押す。
2. 表示中の全レースについて結果ページを取得し、着順を抽出して `feedback.js` の `updateWithResult` を自動実行（重み更新）。
3. 連打防止: 最後の取得から60秒以内は実行せず「あと◯秒」と表示（`localStorage` の `banma.lastAutoFetch`）。
4. 失敗したレースは `console.error` に記録され、アプリは止まりません。馬名が一致しなかった馬は `console.warn` に出ます。
5. 学習対象は「予想を保存済み（pending）」の馬のみです。

### 取得先と CORS
- obikan.net は調査時点（2026-10）で応答しなかったため、帯広（babaCode=3）の公式成績表 `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/RaceMarkTable?k_raceDate=YYYY/MM/DD&k_raceNo=N&k_babaCode=3` を使用。
- raceId `20261031-R01` → 日付 2026/10/31・第1R に変換。races.json の各レースに `resultUrl` を書けばそれを優先。
- このサイトは `Access-Control-Allow-Origin` を返さないため、ブラウザの直接 fetch は CORS で失敗する見込み。失敗時は `https://api.allorigins.win/raw?url=...` 経由で1回だけ再試行します（公開プロキシなので不安定なことがあります）。

### サイト構造が変わった時の修正箇所（`src/scraper.js`）
- `RESULT_BASE` / `BABA_CODE` / `buildResultUrl()` … URL形式
- `PROXY` … フォールバックのプロキシ（例: `https://corsproxy.io/?url=` に差し替え）
- `parseResults()` … セレクタ `section.gradeTable table tr`、着順 `td.a`、馬名 `td.horseName`
- `normalizeName()` / `matchToEntries()` … 馬名の照合ルール
- `MIN_INTERVAL_MS` … 再取得ガード（既定60秒）

### 取得経路（フォールバック順）
1. 直接 fetch → 2. Cloudflare Workers（`VITE_PROXY_URL` 設定時）→ 3. corsproxy.io → 4. allorigins.win
各段階は try-catch で、失敗しても次へ進みアプリは止まりません。

## Cloudflare Workers プロキシ

### なぜ必要か
競馬サイトは `Access-Control-Allow-Origin` を返さないため、ブラウザから直接読めません（CORS）。公開プロキシは不安定なので、自分専用の無料プロキシを Workers に置くのが確実です。`proxy/worker.js` は `?url=` のページをサーバー側で取得し、`Access-Control-Allow-Origin: *` を付けて返します。悪用防止のため obikan.net / keiba.go.jp のみ許可（`ALLOWED_HOSTS` で変更可）。

### 1. アカウント登録
https://dash.cloudflare.com/sign-up でメール・パスワードを登録し、メール認証を済ませます（無料プランで可）。

### 2-A. wrangler でデプロイ
```bash
cd proxy
npx wrangler login     # ブラウザが開くので許可
npx wrangler deploy
```
完了時に `https://banma-hyo-proxy.<サブドメイン>.workers.dev` が表示されます。

### 2-B. ダッシュボードからコピペ
1. ダッシュボード → **Workers & Pages** → **Create** → **Create Worker**（Hello World）
2. 名前を `banma-hyo-proxy` にして **Deploy**
3. **Edit code** を開き、`proxy/worker.js` の中身を全部貼り付けて **Deploy**

### 3. URL の確認
Workers & Pages → `banma-hyo-proxy` の画面に `*.workers.dev` の URL が表示されます（初回は workers.dev のサブドメイン名を決める画面が出ます）。独自ドメインを使う場合は Settings → Domains & Routes で追加。
動作確認: `https://<URL>/?url=https%3A%2F%2Fwww.keiba.go.jp%2F`

### 4. アプリに設定して再ビルド
`frontend/.env` を作成:
```
VITE_PROXY_URL=https://banma-hyo-proxy.<サブドメイン>.workers.dev
```
```bash
cd frontend && npm run build
```

### キャッシュ
結果ページは 5分（300秒）だけキャッシュ（`caches.default` + `Cache-Control: max-age=300, s-maxage=300`）。確定直後の古い結果を長く返さないための設定で、`CACHE_TTL` で変更できます。

## GitHub 公開リポジトリと Netlify 自動デプロイ（スマホ完結）

このプロジェクトは `/home/workdir/banma-hyo/` を Git 管理しています。公開名は **banma-hyo** です。

### あなたがスマホでやること（最小）
1. このチャットに出る **GitHub 接続カード** を開き、Cursor に GitHub を接続する（初回のみ）。
2. （任意）Netlify を使う場合は [app.netlify.com](https://app.netlify.com) でサインアップし、User settings → Applications → Personal access tokens でトークンを発行して Bot に渡す。または GitHub 連携後に Netlify の「Import from Git」で `banma-hyo` を選ぶ。
3. 公開後の `https://xxxx.netlify.app` をブックマークして開くだけ。

### Bot 側の再デプロイ（dist 更新後）
```bash
cd /home/workdir/banma-hyo/frontend
npm run build
# 静的デプロイ（サイトリンク済み・NETLIFY_AUTH_TOKEN 設定時）
npx netlify deploy --prod --dir=dist
```
またはリポジトリルートから:
```bash
cd /home/workdir/banma-hyo
npx netlify deploy --prod --dir=frontend/dist
```
Git 連携サイトなら `git push` だけで Netlify がビルドします（`netlify.toml` の `base=frontend` / `command=npm run build` / `publish=dist`）。

### トークンの作り方（スマホブラウザ）
- **GitHub**: Cursor の接続カードから OAuth するだけで十分です。CLI 用に必要なら GitHub → Settings → Developer settings → Personal access tokens で `repo` 権限のトークンを作成。
- **Netlify**: [User settings → Applications → Personal access tokens](https://app.netlify.com/user/applications#personal-access-tokens) → New access token。発行した文字列を Bot に渡すと `NETLIFY_AUTH_TOKEN` として使います。
