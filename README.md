# ナニウル 新サイト（ラフテル構成 × Graffベンチマーク）

## 構成
```
naniuru-site/
├ index.html              … サイト本体
├ admin.html              … CMS（買取実績×ブログ管理・画像アップ・関連記事・GitHub公開）
├ blog.html               … ブログ記事ページ（?post=スラッグ で記事表示／無指定で一覧）
├ data/
│ ├ gold.json             … 本日の相場（毎朝10:00にGASが書き換え）
│ ├ reviews.json          … Google高評価レビュー（同上）
│ └ posts.js              … 買取実績×ブログ 共通データ（1件追加で全箇所反映）
└ gas/
  ├ gold_price_updater.gs … 金相場 自動更新（GAS）
  └ reviews_updater.gs    … レビュー 自動更新（GAS）
```

## 仕組み（毎朝10:00の自動更新）
1. Google Apps Script が時間トリガー（JST 10:00）で起動
2. 最新の金相場／Googleレビュー（★4以上のみ）を取得
3. GitHub Contents API で `data/*.json` を上書きコミット
4. GitHub Pages（またはロリポップ等へのデプロイ）で即時反映
5. `index.html` は JSON を `?t=タイムスタンプ` 付きで fetch（キャッシュ回避）

ナニウルCMSで採用済みの「GitHub API 直接コミット方式」と同一パターンです。

## セットアップ手順
1. GitHubリポジトリにこの一式をpush → GitHub Pagesを有効化
2. GASプロジェクトを作成し、`gas/` の2ファイルを貼り付け
3. スクリプトプロパティを設定
   - `GITHUB_TOKEN` / `GITHUB_REPO` / `GITHUB_BRANCH`
   - `PLACES_API_KEY` / `PLACE_ID`（レビュー用）
4. `setupTrigger()` と `setupReviewTrigger()` を各1回実行
5. `updateGoldPrice()` を手動実行して初回動作を確認

## CMS（admin.html）の使い方
1. admin.html をブラウザで開く（サイトと同じ場所に置くとposts.jsを自動読込）
2. 右上「⚙接続設定」でGitHubのPAT・リポジトリ・ブランチを登録
3. 記事の作成・編集 → 画像をドラッグ＆ドロップ（自動リサイズ1600px）→ 関連記事にチェック → 保存
   - カテゴリ＝商品ジャンル（ブランド名は入れない）／ブランドタグ＝ブランド名（SEO用）。カテゴリを選ぶとそのジャンルのブランド候補に切り替わり、「＋新しいタグを追加…」で候補を増やせます（posts.js の `CATEGORIES` に保存）
   - スラッグ（URL）は 日付-カテゴリ-ブランド（例: 20260902-watch-rolex）で自動生成。重複時は -2 付与。手入力で上書き可（公開済み記事は自動では変更しない）
   - 画像カードの「本文に挿入」で本文の任意の位置に `[画像N]` を差し込めます（文章→画像→文章のレイアウトが可能。未使用の画像は本文末尾に原寸比率で並びます）
   - 公開側は `blog.html?cat=腕時計` / `blog.html?tag=ロレックス` でカテゴリ別・ブランド別の一覧ページになります
4. 「サイトに公開する」で画像（img/posts/スラッグ/）と data/posts.js がコミットされ、
   実績スライダー・ブログ一覧・記事ページ・関連記事にワンクリックで反映
※GitHub未接続でも「JSエクスポート」でposts.jsを手動運用できます（画像は公開時のみアップロード）

## 調整ポイント
- 買取係数（K18=0.745 など）は `GOLD_RATES` / `PT_RATES` で店舗レートに合わせて変更
- 掲載する最低星数は GAS側 `MIN_STARS` と index.html の `CONFIG.MIN_STARS`（二重フィルタ）
- 買取実績→ブログのリンク先は index.html 内 `RESULTS` 配列の `blog` を実URLに差し替え
- 画像（実績写真・ヒーロー画像）は現状プレースホルダー。実写真に差し替えるとGraffトーンがさらに際立ちます

## 注意
- Places APIで取得できるレビューは最大5件（Google仕様）。全件掲載したい場合は
  ビジネスプロフィールAPI（オーナー認証）等への切り替えが必要です。
- 相場取得元ページの構造変更時は `fetchLatestPrice()` のみ修正すればOKです。
