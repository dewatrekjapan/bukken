# 自己実現支援AI（career.html）— 運用メモ

成果物は `career.html`（単一 HTML）と `career.webmanifest`（スマホ共有メニュー用）。
GitHub Pages で公開すると `https://<user>.github.io/<repo>/career.html` で動く。

## 1. 自分ひとりで使う（サーバー不要）

設定タブ → 接続方法「自分の Anthropic API キーを使う」→ キーを保存。以上。

## 2. Gmail / カレンダーの自動取り込み（サーバー不要）

Google Cloud Console で OAuth クライアント ID を作る。

1. https://console.cloud.google.com/ → プロジェクト作成
2. 「API とサービス」→「ライブラリ」→ **Gmail API** と **Google Calendar API** を有効化
3. 「OAuth 同意画面」→ 外部 → アプリ名・メール → スコープに `gmail.readonly` と `calendar.readonly` を追加 → テストユーザーに自分の Gmail を追加
4. 「認証情報」→「OAuth クライアント ID」→ 種類「ウェブ アプリケーション」→ 承認済み JavaScript 生成元に公開 URL のオリジン（例 `https://dewatrekjapan.github.io`）を追加
5. できたクライアント ID を career.html の設定タブに貼る

注意: `gmail.readonly` は Google の「制限付きスコープ」。テストユーザー（最大 100 人）までは審査なしで使えるが、
不特定多数に公開するには Google の審査（セキュリティ評価 CASA を含む）が必要になる。多人数展開の際はここが最大の関門。

## 3. 多人数に使ってもらう（中継サーバー）

利用者に API キーを配らず、運営者のキーを Cloudflare Workers に置いてアクセスコードで配布する構成。

```
cd worker
npm i -g wrangler && wrangler login
wrangler kv namespace create QUOTA        # 出た id を wrangler.toml に貼る
wrangler secret put ANTHROPIC_API_KEY     # 運営者の API キー
wrangler secret put ACCESS_CODES          # 例: abc123,def456（利用者ごとに1つ）
wrangler deploy                           # https://career-ai-relay.<account>.workers.dev
```

利用者は設定タブ → 接続方法「サービスのアクセスコードを使う」→ 中継サーバー URL とコードを入力。

中継サーバーがやること: アクセスコード認証、コードごとの 1 日の回数制限（KV）、使えるモデルの制限、CORS、
Anthropic への転送（ストリーミングそのまま）。利用者のデータは中継サーバーに保存されない。

## 4. 本格的な多人数サービスにするなら（未実装）

- ログイン（メール／Google）とアクセスコードの自動発行、決済（Stripe）
- 回数ではなくトークン量での課金・上限管理（Anthropic のレスポンス `usage` を KV/D1 に記録）
- 端末をまたいだデータ同期（現在は端末内 IndexedDB のみ。暗号化したうえで R2/D1 に置く）
- X の取り込み（API は有料・審査あり。当面はアーカイブ取り込みで代替）
- Google 制限付きスコープの審査（上記 2）
- 利用規約・プライバシーポリシーの整備（個人情報保護法上、送信先＝Anthropic の明示が必要）
