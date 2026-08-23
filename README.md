# 匿名Q&Aボード

勉強会やイベントごとにボードを作り、共有URL（`#/r/<8桁hex>`）を知っている人だけが同じ質問一覧を見られる匿名Q&Aです。ルートではボード名を入れて作成し、作成後の画面から質問と回答を投稿します。各カードから回答をぶら下げられ、回答は投稿先の質問にだけ表示されます。「未回答のみ」を入れると、回答が 0 件の質問だけが残ります。投稿は D1 に残るので、共有URLを別ブラウザで開いても同じ一覧が見えます。

ボード名は trim 後 1〜40 文字。質問・回答は trim 後 1〜400 文字。空白のみや文字数超過はサーバが 400 で拒否します。ボード作成と質問・回答はレート枠が分かれており、いずれも同一 IP は 10 秒あたり 5 件まで、6 件目は 429 です。共有URLを知っていれば誰でも読み書きできます（ログインやパスワードはありません）。API に届かないときも見出しとフッターは描画されます。

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
  - `App.tsx` — ハッシュルーティング（`#/r/<id>`）。ルートはボード作成、ボード画面は `Board.tsx`
  - `RoomForm.tsx` / `Board.tsx` / `QuestionForm.tsx` / `QuestionCard.tsx` / `AnswerForm.tsx`
- `src/worker/index.ts` — Hono（`GET /api/health`・`POST /api/rooms`・`GET /api/rooms/:id`・`GET|POST /api/rooms/:id/questions`・`POST /api/rooms/:id/questions/:qid/answers`。永続化は D1）
- `tests/unit/` — vitest ユニットテスト、`tests/app.spec.ts` — Playwright E2E
- `PLAN.md` — 初回実装時の計画（歴史的文書。現状の正は本 README とテスト）
