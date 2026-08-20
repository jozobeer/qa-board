# 匿名Q&Aボード

このリポジトリは kojo が生成した Web アプリです（React UI + Hono API）。公開後の保守はこのリポジトリ単体で行う。

## アプリ概要と構成

勉強会・イベント参加者が名前を残さずに質問を投稿し、誰でもその質問に回答をぶら下げられる公開ボード。1 画面構成で、上部に質問フォーム、その下に新しい順の質問カード、各カードに紐づく回答と「未回答 / 回答 N件」バッジ、「未回答のみ」トグル。投稿はすべて D1 に永続化し、別セッションからも同じ一覧が見える。

| 領域 | 実装 |
|------|------|
| UI | `index.html` + `src/ui/`。状態は `App.tsx` に集約（`questions` / `unansweredOnly` / `loadError`）し props で配る。各フォームは入力・エラー・`submitting` のみローカルに持つ。投稿成功後は `reload()` で `GET /api/questions` を取り直す。textarea に `maxLength` を付けない（401 文字の拒否経路を踏むため）。文字数は `Array.from(value).length`。`file://` でも骨格（h1・フォーム・ツールバー・フッター）は描画し、失敗時は「サーバに接続できませんでした」 |
| API | `src/worker/index.ts`。すべて JSON（HTML は返さない）。`GET /api/health`（`app_meta` への実 SELECT、200 `{"ok":true}`。契約を壊さない）、`GET /api/questions?unanswered=1`（200 `{ questions }`、`Cache-Control: no-store`、新しい順・最大 200 件）、`POST /api/questions`（201 `{ ok: true }` / 400 / 413 / 429）、`POST /api/questions/:id/answers`（201 / 400 / 404 / 413 / 429）。POST は作成物を返さず、UI は成功後に GET する |
| 永続化 | D1 のみ（`c.env.DB`）。`questions` / `answers` / `write_log`（`migrations/0002_qa.sql`）。id は `INTEGER PRIMARY KEY AUTOINCREMENT`。質問は `ORDER BY id DESC`、回答は `ORDER BY id ASC` |
| 書込制限 | 本文は trim 後 1〜400 コードポイント。受信ボディ 8,192 バイト超は 413。同一 IP（`CF-Connecting-IP`、無ければ `"unknown"`）は 10,000ms 窓で受理 5 件まで、6 件目は 429。判定順はサイズ → バリデーション → レート → INSERT。拒否したリクエストは枠を消費しない |
| テスト | API/ロジックは `tests/unit/*.test.ts`（D1 はフェイクを `app.request` の第 3 引数で注入）。ブラウザ挙動は `tests/app.spec.ts`。ローカル D1 は `.wrangler/` に残るため絶対件数で assert しない。各テストは一意トークンで本文をスコープし、`CF-Connecting-IP` でレート枠を分離する。雛形のスモークと health テストは削除しない |

空状態: 質問 0 件なら「まだ質問はありません。最初の質問を投稿してみましょう。」、未回答フィルタ ON で 0 件なら「未回答の質問はありません。」

## 技術スタック（不変）

- TypeScript / React 19（ReactCompiler有効。状態管理ライブラリ禁止、リフトアップとprops受け渡しのみ） / Hono / Vite + vite-plugin-singlefile / vitest + Playwright
- UI の正本は `index.html` と `src/ui/`。`public/index.html` は単一ファイルのビルド出力（直接編集しない）
- 配信: Cloudflare Workers（main=`src/worker/index.ts`、assets=`public/`、/api/* が Worker に落ちる）
- 保守時もこのスタックを維持すること。フレームワーク・ビルドツール・宣言外ライブラリの導入は禁止

## 品質不変条件

次を壊さないこと。変更後は `npm run verify` が通る状態を維持する。

- favicon は `index.html` の `<head>` に `<link rel="icon" href="data:image/svg+xml,...">` のインライン data URI（外部ファイル・外部 URL 不可）
- hub（apps.jozo.beer）へのフッターは `#root` の外に置く。リンク先 `https://apps.jozo.beer` とリンクテキスト `apps.jozo.beer` は変えない

```html
<footer style="margin-top:3rem;text-align:center;font-size:.8rem;opacity:.6">
  <a href="https://apps.jozo.beer" style="color:inherit">apps.jozo.beer</a>
</footer>
```

スタイル（リンク色を含む）はテーマに合わせて調整してよい。リンク色を変える場合は背景とのコントラストを確保する。

その他:

- `public/` は `npm run build` の出力なので直接編集しない
- README.md は削除しない
- apple-touch-icon / manifest / og-image / robots / sitemap は公開基盤が生成するため書かない
- 雛形のスモークテストと health テストは削除しない
- サーバ側の永続化は D1 binding（`c.env.DB`）のみ。KV/DO・外部 API は使わない
- スキーマ変更は `migrations/` に新しい連番の SQL ファイルを追加する。適用済み migration の書き換えと `app_meta` テーブルの削除は禁止
- `GET /api/health` は D1 への実 SELECT（`app_meta`）で 200 と `{"ok":true}` を返し続ける（機械検証が依存）
- 匿名書込エンドポイントには入力サイズ上限・バリデーション・簡易レートリミットを維持する
- UI は API に到達できなくても骨格（タイトル・フッター）を描画する（視覚検証は `file://` で行われる）

## 保守の進め方

1. 変更前に受け入れ条件をテストにする（API/ロジックは `tests/unit/*.test.ts`、ブラウザ挙動は `tests/app.spec.ts`）
2. 実装する
3. `npm test` が通ることを確認する
4. `git commit` と `git push`
5. `npm run deploy`

## PLAN.md について

`PLAN.md` は初回実装時の計画であり歴史的文書である。現状の正は README.md とテスト（`tests/`）である。受け入れ条件の追加・変更はテストと README に反映する。PLAN とテストが食い違う場合はテストに従う。

grow の作業計画は `.grow-plan.md` である。これも一時ファイルであり、現状の正ではない。
