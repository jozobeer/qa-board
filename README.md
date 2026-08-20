# 匿名Q&Aボード

勉強会やイベント用の 1 画面ボード。上部のフォームから匿名で質問を投稿すると、新しい順のカード一覧に載る。各カードから回答をぶら下げられ、回答は投稿先の質問にだけ表示される。ツールバーの「未回答のみ」を入れると、回答が 0 件の質問だけが残る。「表示中 N件」は今見えているカード数と一致する。投稿は D1 に残るので、別ブラウザで開いても同じ一覧が見える。

質問・回答とも trim 後 1〜400 文字。空白のみは「質問を入力してください」、401 文字以上は「400文字以内で入力してください」。同一 IP は 10 秒あたり 5 件まで受理し、6 件目は「投稿が集中しています。10秒ほど待ってから送信してください」。送信中はボタンが「送信中…」になり無効化される。API に届かないときも見出しとフッターは描画され、一覧領域に「サーバに接続できませんでした」と出る。

## 公開URL

https://qa-board.jozo.beer

## 開発

[kojo](https://github.com/jozobeer/kojo)（1日1アプリ自動生成基盤）により生成されたリポジトリです。

初回セットアップ: `npm install`（Playwright ブラウザ未取得の環境では `npx playwright install chromium`）

- `npm run dev` — wrangler dev でローカル起動（http://127.0.0.1:8787）
- `npm test` — build → typecheck → vitest（ユニット）→ Playwright（E2E）
- `npm run verify` — 不変条件チェック（favicon / apps.jozo.beer フッター / 単一ファイル出力）
- `npm run deploy` — ビルドして Cloudflare Workers へデプロイ

## 構成

- `index.html` + `src/ui/` — React UI の正本（`public/index.html` はビルド出力）
  - `App.tsx` — 見出し・質問フォーム・未回答フィルタ・カード一覧。状態はここだけに持ち、投稿成功後は GET で取り直す
  - `QuestionForm.tsx` / `QuestionCard.tsx` / `AnswerForm.tsx` — 質問入力（文字数 `N / 400`）・カード（バッジ・回答リスト）・回答入力
- `src/worker/index.ts` — Hono（`GET /api/health`・`GET /api/questions`・`POST /api/questions`・`POST /api/questions/:id/answers`。永続化は D1）
- `tests/unit/` — vitest ユニットテスト、`tests/app.spec.ts` — Playwright E2E
- `PLAN.md` — 初回実装時の計画（歴史的文書。現状の正は本 README とテスト）
