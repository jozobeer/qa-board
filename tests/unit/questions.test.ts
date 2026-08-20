import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";
import { createMemoryDb } from "./memory-db";

const jsonHeaders = { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.1" };

async function postQuestion(db: ReturnType<typeof createMemoryDb>, body: string, ip = "198.51.100.1") {
  return app.request(
    "/api/questions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ body }),
    },
    { DB: db },
  );
}

describe("POST /api/questions", () => {
  it("受理すると 201 と {ok:true} を返す", async () => {
    const db = createMemoryDb();
    const res = await postQuestion(db, "初回の質問");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("空文字は 400 で質問を入力してください", async () => {
    const db = createMemoryDb();
    const res = await postQuestion(db, "");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "質問を入力してください" });
  });

  it("ちょうど 400 文字は 201", async () => {
    const db = createMemoryDb();
    const res = await postQuestion(db, "あ".repeat(400));
    expect(res.status).toBe(201);
  });

  it("401 文字は 400 で 400文字以内で入力してください", async () => {
    const db = createMemoryDb();
    const res = await postQuestion(db, "あ".repeat(401));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "400文字以内で入力してください" });
  });

  it("8,193 バイトのボディは 413", async () => {
    const db = createMemoryDb();
    const payload = JSON.stringify({ body: "a".repeat(8182) });
    expect(new TextEncoder().encode(payload).byteLength).toBe(8193);
    const res = await app.request(
      "/api/questions",
      { method: "POST", headers: jsonHeaders, body: payload },
      { DB: db },
    );
    expect(res.status).toBe(413);
  });
});

describe("GET /api/questions", () => {
  it("投稿済み質問を新しい順で返す", async () => {
    const db = createMemoryDb();
    await postQuestion(db, "古い質問", "198.51.100.2");
    await postQuestion(db, "新しい質問", "198.51.100.3");

    const res = await app.request("/api/questions", {}, { DB: db });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = (await res.json()) as { questions: { body: string; answers: unknown[] }[] };
    expect(json.questions.map((q) => q.body)).toEqual(["新しい質問", "古い質問"]);
    expect(json.questions[0].answers).toEqual([]);
  });

  it("unanswered=1 では回答付き質問を含めない", async () => {
    const db = createMemoryDb();
    await postQuestion(db, "未回答", "198.51.100.4");
    await postQuestion(db, "回答済み", "198.51.100.5");

    const listed = (await (await app.request("/api/questions", {}, { DB: db })).json()) as {
      questions: { id: number; body: string }[];
    };
    const answered = listed.questions.find((q) => q.body === "回答済み");
    expect(answered).toBeDefined();

    const ans = await app.request(
      `/api/questions/${answered!.id}/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.6" },
        body: JSON.stringify({ body: "回答本文" }),
      },
      { DB: db },
    );
    expect(ans.status).toBe(201);

    const filtered = await app.request("/api/questions?unanswered=1", {}, { DB: db });
    const json = (await filtered.json()) as { questions: { body: string }[] };
    expect(json.questions.map((q) => q.body)).toEqual(["未回答"]);
  });
});

describe("POST /api/questions/:id/answers", () => {
  it("回答は question_id で bind され、他の質問には現れない", async () => {
    const db = createMemoryDb();
    await postQuestion(db, "質問B", "198.51.100.7");
    await postQuestion(db, "質問A", "198.51.100.8");

    const listed = (await (await app.request("/api/questions", {}, { DB: db })).json()) as {
      questions: { id: number; body: string }[];
    };
    const qa = listed.questions.find((q) => q.body === "質問A")!;
    const qb = listed.questions.find((q) => q.body === "質問B")!;

    const posted = await app.request(
      `/api/questions/${qa.id}/answers`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.9" },
        body: JSON.stringify({ body: "Aへの回答" }),
      },
      { DB: db },
    );
    expect(posted.status).toBe(201);
    expect(await posted.json()).toEqual({ ok: true });

    const after = (await (await app.request("/api/questions", {}, { DB: db })).json()) as {
      questions: { id: number; body: string; answers: { body: string }[] }[];
    };
    const qaAfter = after.questions.find((q) => q.id === qa.id)!;
    const qbAfter = after.questions.find((q) => q.id === qb.id)!;
    expect(qaAfter.answers.map((a) => a.body)).toEqual(["Aへの回答"]);
    expect(qbAfter.answers).toEqual([]);
  });

  it("存在しない id は 404", async () => {
    const db = createMemoryDb();
    const res = await app.request(
      "/api/questions/999/answers",
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ body: "幽霊への回答" }),
      },
      { DB: db },
    );
    expect(res.status).toBe(404);
  });
});
