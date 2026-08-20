# PLAN: 匿名Q&Aボード

## 1. 概要

勉強会やイベントの参加者が、名前を残さずに質問を投稿し、誰でもその質問に回答をぶら下げられる公開ボードを作る。1 画面構成で、上部に質問投稿フォーム、その下に質問カードの一覧（新しい順）を並べ、各カードには紐づく回答と「未回答 / 回答 N件」バッジを表示する。「未回答のみ」トグルで回答が 0 件の質問だけに絞り込める。投稿はすべて D1 に永続化し、別セッション・別ブラウザからも同じ一覧が見える。匿名書込のため、本文の文字数上限・リクエストサイズ上限・IP 単位の簡易レートリミットをサーバ側で強制する。

## 2. 意図（明示）

登壇者や運営が、その場で挙手しづらい参加者からの質問を匿名で集め、まだ答えていない質問を取りこぼさずに拾いたい場面で使う。

## 3. 受け入れ条件

- [ ] **AC1 質問の投稿と永続化**: 質問フォームに本文を入力して「質問する」を押すと、一覧の先頭にその本文がそのまま表示され、バッジが「未回答」になる。Cookie / localStorage を共有しない別ブラウザセッションで開き直しても、同じ本文が一覧に 1 件表示される。
- [ ] **AC2 回答の紐づけ**: 質問 A の回答フォームから回答を投稿すると、その回答テキストは質問 A のカード内にのみ表示され（回答 1 件）、質問 B のカード内には表示されない（回答 0 件・バッジ「未回答」）。別セッションで開き直しても紐づきは変わらない。
- [ ] **AC3 未回答のみの絞り込み**: 「未回答のみ」を ON にすると、回答が 1 件以上ある質問は画面から消え、回答 0 件の質問だけが残る。OFF に戻すと両方表示される。ツールバーの「表示中 N件」の N は、実際に表示されている質問カード数と一致する。
- [ ] **AC4 入力バリデーションの境界**: 空白のみの本文は投稿されず「質問を入力してください」を表示する。trim 後ちょうど 400 文字は投稿でき一覧に全文が表示される。401 文字は投稿されず「400文字以内で入力してください」を表示する。いずれの拒否ケースでも一覧の件数は増えない。
- [ ] **AC5 レートリミットの境界**: 同一クライアント IP からの受理済み書込は 10,000ms あたり 5 件まで。5 件目は成功して一覧に表示され、6 件目は拒否されて「投稿が集中しています。10秒ほど待ってから送信してください」を表示し一覧は 5 件のまま。1 件目から 10,000ms 以上経過後の再投稿は成功して 6 件目が表示される。
- [ ] **AC6 送信処理中の追加操作**: 送信リクエストの処理中は送信ボタンが無効化され表示が「送信中…」になる。処理中に追加でクリックしても追加の POST は発行されず、作成される質問はちょうど 1 件にとどまる。

### 境界値の確定表

| 対象 | 許可 | 拒否 |
| --- | --- | --- |
| 同一 IP の受理済み書込回数（窓 10,000ms） | 5 件目まで → 201 | 6 件目 → 429 |
| 直近書込からの経過時間 | 経過 10,000ms 以上 → 窓外（カウントしない） | 経過 9,999ms 以下 → 窓内（カウントする） |
| 本文文字数（trim 後、質問・回答とも） | 1〜400 文字 → 201 | 0 文字 / 401 文字以上 → 400 |
| リクエストボディのバイト数 | 8,192 バイト以下 | 8,193 バイト以上 → 413 |
| 送信処理中の追加クリック | — | 追加 POST を発行しない（作成は 1 件） |

レートリミットは**受理された書込のみ**を記録する（バリデーション/サイズで拒否したリクエストは枠を消費しない）。判定順は「サイズ → バリデーション → レート判定 → INSERT」。

## 4. 実装方針

### スキーマ（`migrations/0002_qa.sql` を新規追加。既存 migration と `app_meta` は変更しない）

```sql
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id, id);
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_write_log_client ON write_log(client, id);
```

id は `INTEGER PRIMARY KEY AUTOINCREMENT` にして採番順＝表示順とする（同一ミリ秒の投稿でも並びが決定的になり、「先頭に表示される」という assert が安定する）。質問は `ORDER BY id DESC`、回答は `ORDER BY id ASC`。

### API（`src/worker/index.ts`。Hono、JSON のみ。HTML は返さない）

| メソッド | パス | 応答 |
| --- | --- | --- |
| GET | `/api/health` | 既存のまま。`app_meta` への実 SELECT で `{"ok":true}`（変更禁止） |
| GET | `/api/questions?unanswered=1` | 200 `{ questions: [{ id, body, createdAt, answers: [{ id, body, createdAt }] }] }`。`Cache-Control: no-store` |
| POST | `/api/questions` | 201 `{ ok: true }` / 400 / 413 / 429 |
| POST | `/api/questions/:id/answers` | 201 `{ ok: true }` / 400 / 404 / 413 / 429 |

- POST は作成物を返さず `{ ok: true }` のみ返し、UI は成功後に GET で一覧を取り直す。表示の正本を常に GET 側に一本化し、並び順・フィルタ結果のズレをなくす。
- GET は 2 クエリ。(1) 質問を `LIMIT 200` で取得（`unanswered=1` のときは `WHERE NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = questions.id)`）。(2) 取得した id 群に対し `SELECT ... FROM answers WHERE question_id IN (?,...) ORDER BY id ASC`。JS 側で質問にぶら下げる。
- エラー応答は `{ error: "<画面に出す文言>" }` で返し、UI はその文言をそのまま表示する（文言の正本をサーバに置く）。

### 主要関数（`src/worker/index.ts`）

- `readJsonBody(c, maxBytes = 8192)` — 生テキストを読んでバイト長を検査。超過は 413。JSON パース失敗は 400。
- `validateBody(raw: unknown, max = 400): { ok: true; value: string } | { ok: false; message: string }` — 文字列型チェック → trim → 空なら「質問を入力してください」/「回答を入力してください」、`Array.from(trimmed).length > 400` なら「400文字以内で入力してください」。
- `RATE_LIMIT = { windowMs: 10_000, max: 5 }`
- `isRateLimited(recentCreatedAt: number[], now: number): boolean` — **純関数**。`recentCreatedAt.filter(t => now - t < RATE_LIMIT.windowMs).length >= RATE_LIMIT.max`。時刻判定を SQL に持たせないことで、ミリ秒境界を単体テストで直接突ける。
- `clientKey(c)` — `c.req.header("CF-Connecting-IP") ?? "unknown"`。本番の Cloudflare エッジはこのヘッダを実クライアント IP で上書きするため詐称できない。ローカル dev（miniflare）は既存値があればそのまま通すため（`node_modules/miniflare/dist/src/workers/core/entry.worker.js:4507`）、E2E はコンテキストごとに異なる IP を与えてレート制限バケットを分離する。
- `checkAndRecordWrite(db, client, now)` — `SELECT created_at FROM write_log WHERE client = ? ORDER BY id DESC LIMIT 5` → `isRateLimited` → 許可なら `INSERT INTO write_log` と `DELETE FROM write_log WHERE client = ? AND created_at <= ?`（窓外を掃除）。
- `listQuestions(db, unansweredOnly)` — 上記 GET の 2 クエリを実行して整形。

`D1Like` は `bind(...)` の戻りに `all<T>()` を追加する（現状 `first`/`run` のみ）。テストのフェイク D1 は SQL 文字列でディスパッチする。

### UI（正本は `index.html` と `src/ui/`。`public/` は `npm run build` の出力なので触らない）

構成ファイル: `src/ui/types.ts`（`Question` / `Answer`）、`src/ui/api.ts`（`fetchQuestions` / `postQuestion` / `postAnswer`。失敗時は `{ ok: false, message }` を返す）、`src/ui/App.tsx`、`src/ui/QuestionForm.tsx`、`src/ui/QuestionCard.tsx`、`src/ui/AnswerForm.tsx`。

状態は App にリフトアップし props で配る（状態管理ライブラリは使わない）。App が持つのは `questions: Question[] | null` / `unansweredOnly: boolean` / `loadError: string | null` の 3 つ。各フォームは自分の入力文字列・エラー文言・`submitting` フラグのみローカルに持つ。投稿成功時は App から渡された `reload()` で一覧を再取得する。

レイアウト（1 カラム、上から順に）:

1. `<h1>匿名Q&Aボード</h1>` と説明文「名前は残りません。気になったことを自由に投稿してください。」
2. 質問フォーム — textarea（3行）＋ 文字数カウンタ「12 / 400」（サーバと同じ `Array.from(value).length` で数える）＋ ボタン「質問する」（送信中は disabled で「送信中…」）。エラー文言はフォーム直下。
3. ツールバー — チェックボックス「未回答のみ」と「表示中 N件」
4. 質問カード一覧（新しい順） — 本文、投稿時刻、バッジ（`未回答` / `回答 N件`）、回答リスト（古い順）、回答フォーム（1 行 input ＋ ボタン「回答する」）
5. フッター（`#root` の外、AGENTS.md 指定のマークアップのまま）

- **textarea / input に `maxLength` 属性を付けない**。付けると 401 文字を入力できず AC4 の拒否経路が実行されない。超過はカウンタの色変化と送信時のエラー文言で伝え、サーバも独立に 400 を返す。
- API 到達不能でも骨格を描く: `fetchQuestions` の失敗は `loadError` に落とすだけで、h1・説明文・フォーム・ツールバー・フッターは常に描画する（`file://` での視覚検証が依存）。失敗時は「サーバに接続できませんでした」を一覧領域に表示。
- 空状態: 質問 0 件なら「まだ質問はありません。最初の質問を投稿してみましょう。」、未回答フィルタ ON で 0 件なら「未回答の質問はありません。」
- 配色は favicon と揃える。背景 `#f6f7f9`、カード白、アクセント `#324a5e`。`index.html` の favicon は現状の無地角丸から、同色の角丸背景＋白の吹き出しと「?」を描くインライン SVG data URI に差し替える（外部ファイル・外部 URL は使わない）。

### テストで使う `data-testid`

`question-input` / `question-counter` / `question-submit` / `question-error` / `unanswered-filter` / `visible-count` / `question-card` / `question-body` / `answer-badge` / `answer-item` / `answer-input` / `answer-submit`

## 5. テスト計画

### 前提（すべての Playwright テストで守る）

- ローカル D1 は `.wrangler/` に永続し、テスト間・テスト実行間で行が残る。よって**絶対件数で assert しない**。各テストは一意トークン（例 `T<ms><rand5>`）を本文に埋め、`getByTestId('question-body').filter({ hasText: token })` のようにスコープして件数と文言を検証する。
- 各テストは `browser.newContext({ extraHTTPHeaders: { 'CF-Connecting-IP': '<テスト固有 IP>' } })` で独自コンテキストを作り、レート制限バケットを分離する（AC1 `198.51.100.11/.12`、AC2 `.21/.22`、AC3 `.31`、AC4 `.41`、AC5 `.51`、AC6 `.61`）。

### 受け入れ条件 ↔ テスト対応表

| AC | 主テスト（実ブラウザ・`tests/app.spec.ts`） | 画面上で直接検証する実値 | 補助ユニット（`tests/unit/`） |
| --- | --- | --- | --- |
| AC1 | 「質問を投稿すると一覧の先頭に出て、別セッションでも見える」 | 先頭 `question-body` のテキスト＝入力文字列と完全一致、先頭 `answer-badge`＝`未回答`、別コンテキストでの同本文の件数＝1 | `questions.test.ts`: `POST /api/questions` が 201 `{ok:true}`、`GET /api/questions` が投稿済み質問を返す |
| AC2 | 「回答は投稿先の質問にだけ紐づく」 | 質問 A カード内 `answer-item` 件数＝1 かつテキスト一致、質問 B カード内 `answer-item` 件数＝0、バッジが `回答 1件` / `未回答` | `questions.test.ts`: 回答が `question_id` で bind される / 存在しない id は 404 |
| AC3 | 「未回答のみで回答 0 件の質問だけが残る」 | ON 時: 回答済み本文の件数＝0、未回答本文の件数＝1、`visible-count` の N ＝ `question-card` の実数。OFF 時: トークン一致の本文＝2 | `questions.test.ts`: `?unanswered=1` で `NOT EXISTS` 付きクエリが発行され、回答付き質問が結果に含まれない |
| AC4 | 「入力の境界（空白のみ / 400文字 / 401文字）」 | `question-error`＝`質問を入力してください` および `400文字以内で入力してください`、`question-counter`＝`400 / 400` と `401 / 400`、400 文字投稿後の先頭 `question-body` の文字数＝400、拒否時のトークン一致件数が増えない | `questions.test.ts`: 空文字 400 / 401 文字 400 / ちょうど 400 文字 201 / 8,193 バイトのボディ 413 |
| AC5 | 「10秒5件のレート制限境界」 | 5 件目まではトークン一致件数＝5、6 件目で `question-error`＝`投稿が集中しています。10秒ほど待ってから送信してください` かつ件数は 5 のまま、11 秒待機後の再投稿で件数＝6 | `ratelimit.test.ts`: `isRateLimited` が 4 件→false / 5 件→true、経過 9,999ms→カウントされ true / 経過 10,000ms→カウントされず false。ハンドラが 6 件目に 429 を返す |
| AC6 | 「送信処理中の追加操作では二重投稿されない」 | クリック直後に `question-submit` が disabled かつテキスト`送信中…`、応答後のトークン一致件数＝1、`page.route` で数えた POST 回数＝1 | — |

### 各ブラウザテストの手順（要点）

**AC2** — 質問 `QB <token>` → `QA <token>` の順に投稿（QA が先頭）。QA カードの `answer-input` に `A1 <token>` を入れて「回答する」。QA カード内の回答件数・テキスト・バッジ `回答 1件` と、QB カード内の回答件数 0・バッジ `未回答` を検証。別コンテキストで再読込しても同じ紐づきであることを確認。

**AC3** — AC2 と同様に回答済み QA と未回答 QB を用意（書込 3 回でレート枠 5 に収まる）。`unanswered-filter` を ON → 回答済み本文が 0 件・未回答本文が 1 件、`visible-count` の N と `question-card` の実数が一致することを検証。OFF に戻してトークン一致本文が 2 件に戻ることを検証。

**AC4** — (1) `"   "` を送信 → エラー文言と、送信前後でトークン一致件数が変わらないことを検証。(2) `<token> + "あ".repeat(400 - token.length)` のちょうど 400 文字を送信 → カウンタ `400 / 400` を確認して送信、先頭カード本文の文字数が 400 であることを検証。(3) それに「あ」を 1 文字足した 401 文字 → カウンタ `401 / 400`、送信でエラー文言、その本文を含むカードが 0 件。受理される書込は (2) の 1 件だけなのでレート枠を圧迫しない。

**AC5** — `test.setTimeout(60_000)` を宣言。`R1..R5 <token>` を連続投稿しトークン一致件数＝5 を検証。`R6 <token>` を送信して 429 由来のエラー文言と件数 5 のままを検証。`page.waitForTimeout(11_000)`（1 件目から 10,000ms 超が経過）してから `R6 <token>` を再送信し、件数＝6 を検証。1〜6 件目は 1 件目から 10,000ms 以内に送信し終えること（超えると 1 件目が窓外に出て 6 件目が受理され、テストの前提が崩れる）。そのため投稿と投稿の間に個別の assert を挟まない。ミリ秒ちょうどの境界（9,999 / 10,000）は `isRateLimited` の単体テストで確定させる。

**AC6** — `page.route('**/api/questions', ...)` で POST のみ 1,500ms 遅延させ、POST 回数をカウントする。本文を入力して 1 回クリック → ボタンが disabled かつ `送信中…` を検証 → `{ force: true }` で追加クリックを 2 回。応答完了後にトークン一致件数＝1、カウントした POST 回数＝1 を検証。
