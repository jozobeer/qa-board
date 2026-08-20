import { Hono } from "hono";
import type { Context } from "hono";

// workers-types 非依存方針（DOM lib と衝突するため）の最小 D1 型。使うメソッドだけ宣言する
export interface D1Like {
  prepare(query: string): {
    first<T = unknown>(): Promise<T | null>;
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
}

type AppEnv = { Bindings: { DB: D1Like } };
type Kind = "question" | "answer";

type ValidateOk = { ok: true; value: string };
type ValidateErr = { ok: false; message: string };
type JsonOk = { ok: true; value: unknown };
type JsonErr = { ok: false; status: 400 | 413; error: string };

type QuestionRow = { id: number; body: string; created_at: number };
type AnswerRow = { id: number; question_id: number; body: string; created_at: number };

const RATE_LIMIT = { windowMs: 10_000, max: 5 };
const MAX_BYTES = 8192;
const MAX_CHARS = 400;
const LIST_LIMIT = 200;

const MSG = {
  tooLarge: "リクエストが大きすぎます",
  badJson: "不正なリクエストです",
  questionEmpty: "質問を入力してください",
  answerEmpty: "回答を入力してください",
  tooLong: "400文字以内で入力してください",
  rate: "投稿が集中しています。10秒ほど待ってから送信してください",
  notFound: "質問が見つかりません",
} as const;

const app = new Hono<AppEnv>();

export function isRateLimited(recentCreatedAt: number[], now: number): boolean {
  return recentCreatedAt.filter((t) => now - t < RATE_LIMIT.windowMs).length >= RATE_LIMIT.max;
}

function validateBody(raw: unknown, kind: Kind, max = MAX_CHARS): ValidateOk | ValidateErr {
  const empty = kind === "question" ? MSG.questionEmpty : MSG.answerEmpty;
  if (typeof raw !== "string") return { ok: false, message: empty };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: empty };
  if (Array.from(value).length > max) return { ok: false, message: MSG.tooLong };
  return { ok: true, value };
}

async function readJsonBody(c: Context<AppEnv>, maxBytes = MAX_BYTES): Promise<JsonOk | JsonErr> {
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, status: 413, error: MSG.tooLarge };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: MSG.badJson };
  }
}

function bodyField(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("body" in value)) return undefined;
  return (value as { body: unknown }).body;
}

function clientKey(c: Context<AppEnv>): string {
  return c.req.header("CF-Connecting-IP") ?? "unknown";
}

function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

async function checkAndRecordWrite(db: D1Like, client: string, now: number): Promise<boolean> {
  const { results } = await db
    .prepare("SELECT created_at FROM write_log WHERE client = ? ORDER BY id DESC LIMIT 5")
    .bind(client)
    .all<{ created_at: number }>();
  if (isRateLimited(results.map((r) => r.created_at), now)) return true;
  await db.prepare("INSERT INTO write_log (client, created_at) VALUES (?, ?)").bind(client, now).run();
  await db
    .prepare("DELETE FROM write_log WHERE client = ? AND created_at <= ?")
    .bind(client, now - RATE_LIMIT.windowMs)
    .run();
  return false;
}

async function listQuestions(db: D1Like, unansweredOnly: boolean) {
  const sql = unansweredOnly
    ? `SELECT id, body, created_at FROM questions WHERE NOT EXISTS (SELECT 1 FROM answers a WHERE a.question_id = questions.id) ORDER BY id DESC LIMIT ${LIST_LIMIT}`
    : `SELECT id, body, created_at FROM questions ORDER BY id DESC LIMIT ${LIST_LIMIT}`;
  const { results: questions } = await db.prepare(sql).all<QuestionRow>();
  if (questions.length === 0) return [];

  const placeholders = questions.map(() => "?").join(",");
  const { results: answers } = await db
    .prepare(
      `SELECT id, question_id, body, created_at FROM answers WHERE question_id IN (${placeholders}) ORDER BY id ASC`,
    )
    .bind(...questions.map((q) => q.id))
    .all<AnswerRow>();

  const byQuestion = new Map<number, { id: number; body: string; createdAt: number }[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.question_id) ?? [];
    list.push({ id: a.id, body: a.body, createdAt: a.created_at });
    byQuestion.set(a.question_id, list);
  }

  return questions.map((q) => ({
    id: q.id,
    body: q.body,
    createdAt: q.created_at,
    answers: byQuestion.get(q.id) ?? [],
  }));
}

async function parseWriteBody(c: Context<AppEnv>, kind: Kind): Promise<ValidateOk | JsonErr | ValidateErr> {
  const parsed = await readJsonBody(c);
  if (!parsed.ok) return parsed;
  return validateBody(bodyField(parsed.value), kind);
}

function rejectWrite(body: JsonErr | ValidateErr) {
  const status = "status" in body ? body.status : 400;
  const error = "error" in body ? body.error : body.message;
  return { error, status };
}

// 機械検証と監視が依存する。migrations 適用済みスキーマへ実 SELECT して 200 を返す。壊さないこと
app.get("/api/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT count(*) AS n FROM app_meta").first<{ n: number }>();
  return row != null ? c.json({ ok: true }) : c.json({ ok: false }, 500);
});

app.get("/api/questions", async (c) => {
  const questions = await listQuestions(c.env.DB, c.req.query("unanswered") === "1");
  return c.json({ questions }, 200, { "Cache-Control": "no-store" });
});

app.post("/api/questions", async (c) => {
  const body = await parseWriteBody(c, "question");
  if (!body.ok) {
    const failed = rejectWrite(body);
    return c.json({ error: failed.error }, failed.status);
  }
  const now = Date.now();
  if (await checkAndRecordWrite(c.env.DB, clientKey(c), now)) {
    return c.json({ error: MSG.rate }, 429);
  }
  await c.env.DB.prepare("INSERT INTO questions (body, created_at) VALUES (?, ?)").bind(body.value, now).run();
  return c.json({ ok: true }, 201);
});

app.post("/api/questions/:id/answers", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: MSG.notFound }, 404);

  const body = await parseWriteBody(c, "answer");
  if (!body.ok) {
    const failed = rejectWrite(body);
    return c.json({ error: failed.error }, failed.status);
  }

  const found = await c.env.DB.prepare("SELECT id FROM questions WHERE id = ?").bind(id).first<{ id: number }>();
  if (found == null) return c.json({ error: MSG.notFound }, 404);

  const now = Date.now();
  if (await checkAndRecordWrite(c.env.DB, clientKey(c), now)) {
    return c.json({ error: MSG.rate }, 429);
  }
  await c.env.DB
    .prepare("INSERT INTO answers (question_id, body, created_at) VALUES (?, ?, ?)")
    .bind(id, body.value, now)
    .run();
  return c.json({ ok: true }, 201);
});

export default app;
