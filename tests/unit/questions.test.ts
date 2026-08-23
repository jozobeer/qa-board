import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";
import { createMemoryDb } from "./memory-db";

function jsonHeaders(ip: string) {
  return { "Content-Type": "application/json", "CF-Connecting-IP": ip };
}

async function postRoom(db: ReturnType<typeof createMemoryDb>, name: string, ip: string) {
  const res = await app.request(
    "/api/rooms",
    { method: "POST", headers: jsonHeaders(ip), body: JSON.stringify({ name }) },
    { DB: db },
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; name: string };
}

async function postQuestion(
  db: ReturnType<typeof createMemoryDb>,
  roomId: string,
  body: string,
  ip: string,
) {
  return app.request(
    `/api/rooms/${roomId}/questions`,
    { method: "POST", headers: jsonHeaders(ip), body: JSON.stringify({ body }) },
    { DB: db },
  );
}

function withInsertCounter(inner: ReturnType<typeof createMemoryDb>, prefix: string) {
  let count = 0;
  const db = {
    prepare(query: string) {
      const stmt = inner.prepare(query);
      if (query.replace(/\s+/g, " ").trim().startsWith(prefix)) {
        return {
          bind(...values: unknown[]) {
            const bound = stmt.bind(...values);
            return {
              first: bound.first,
              all: bound.all,
              run: async () => {
                count += 1;
                return bound.run();
              },
            };
          },
          first: stmt.first,
          all: stmt.all,
          run: stmt.run,
        };
      }
      return stmt;
    },
  };
  return { db, inserts: () => count };
}

describe("POST /api/rooms/:id/questions", () => {
  it("受理すると 201 と {ok:true} を返す", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.1");
    const res = await postQuestion(db, room.id, "初回の質問", "198.51.100.1");
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("空文字は 400 で質問を入力してください", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.2");
    const res = await postQuestion(db, room.id, "", "198.51.100.2");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "質問を入力してください" });
  });

  it("ちょうど 400 文字は 201", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.3");
    const res = await postQuestion(db, room.id, "あ".repeat(400), "198.51.100.3");
    expect(res.status).toBe(201);
  });

  it("401 文字は 400 で 400文字以内で入力してください", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.4");
    const res = await postQuestion(db, room.id, "あ".repeat(401), "198.51.100.4");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "400文字以内で入力してください" });
  });

  it("8,193 バイトのボディは 413", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.5");
    const payload = JSON.stringify({ body: "a".repeat(8182) });
    expect(new TextEncoder().encode(payload).byteLength).toBe(8193);
    const res = await app.request(
      `/api/rooms/${room.id}/questions`,
      { method: "POST", headers: jsonHeaders("198.51.100.5"), body: payload },
      { DB: db },
    );
    expect(res.status).toBe(413);
  });

  it("未知ルームへの POST は 404 で INSERT しない", async () => {
    const inner = createMemoryDb();
    const { db, inserts } = withInsertCounter(inner, "INSERT INTO questions");
    const res = await app.request(
      "/api/rooms/aaaaaaaa/questions",
      { method: "POST", headers: jsonHeaders("198.51.100.6"), body: JSON.stringify({ body: "迷子の質問" }) },
      { DB: db },
    );
    expect(res.status).toBe(404);
    expect(inserts()).toBe(0);
  });
});

describe("GET /api/rooms/:id/questions", () => {
  it("投稿済み質問を新しい順で返す", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.10");
    await postQuestion(db, room.id, "古い質問", "198.51.100.11");
    await postQuestion(db, room.id, "新しい質問", "198.51.100.12");

    const res = await app.request(`/api/rooms/${room.id}/questions`, {}, { DB: db });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = (await res.json()) as { questions: { body: string; answers: unknown[] }[] };
    expect(json.questions.map((q) => q.body)).toEqual(["新しい質問", "古い質問"]);
    expect(json.questions[0].answers).toEqual([]);
  });

  it("unanswered=1 では回答付き質問を含めない", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.13");
    await postQuestion(db, room.id, "未回答", "198.51.100.14");
    await postQuestion(db, room.id, "回答済み", "198.51.100.15");

    const listed = (await (await app.request(`/api/rooms/${room.id}/questions`, {}, { DB: db })).json()) as {
      questions: { id: number; body: string }[];
    };
    const answered = listed.questions.find((q) => q.body === "回答済み");
    expect(answered).toBeDefined();

    const ans = await app.request(
      `/api/rooms/${room.id}/questions/${answered!.id}/answers`,
      {
        method: "POST",
        headers: jsonHeaders("198.51.100.16"),
        body: JSON.stringify({ body: "回答本文" }),
      },
      { DB: db },
    );
    expect(ans.status).toBe(201);

    const filtered = await app.request(`/api/rooms/${room.id}/questions?unanswered=1`, {}, { DB: db });
    const json = (await filtered.json()) as { questions: { body: string }[] };
    expect(json.questions.map((q) => q.body)).toEqual(["未回答"]);
  });

  it("未知ルームへの GET は 404", async () => {
    const db = createMemoryDb();
    const res = await app.request("/api/rooms/aaaaaaaa/questions", {}, { DB: db });
    expect(res.status).toBe(404);
  });

  it("ボード A の質問はボード B の一覧に出ない", async () => {
    const db = createMemoryDb();
    const a = await postRoom(db, "ボードA", "198.51.100.17");
    const b = await postRoom(db, "ボードB", "198.51.100.18");
    await postQuestion(db, a.id, "Aだけの質問", "198.51.100.19");

    const listB = (await (await app.request(`/api/rooms/${b.id}/questions`, {}, { DB: db })).json()) as {
      questions: { body: string }[];
    };
    expect(listB.questions.map((q) => q.body)).not.toContain("Aだけの質問");
    expect(listB.questions).toEqual([]);
  });
});

describe("POST /api/rooms/:id/questions/:qid/answers", () => {
  it("回答は question_id で bind され、他の質問には現れない", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.20");
    await postQuestion(db, room.id, "質問B", "198.51.100.21");
    await postQuestion(db, room.id, "質問A", "198.51.100.22");

    const listed = (await (await app.request(`/api/rooms/${room.id}/questions`, {}, { DB: db })).json()) as {
      questions: { id: number; body: string }[];
    };
    const qa = listed.questions.find((q) => q.body === "質問A")!;
    const qb = listed.questions.find((q) => q.body === "質問B")!;

    const posted = await app.request(
      `/api/rooms/${room.id}/questions/${qa.id}/answers`,
      {
        method: "POST",
        headers: jsonHeaders("198.51.100.23"),
        body: JSON.stringify({ body: "Aへの回答" }),
      },
      { DB: db },
    );
    expect(posted.status).toBe(201);
    expect(await posted.json()).toEqual({ ok: true });

    const after = (await (await app.request(`/api/rooms/${room.id}/questions`, {}, { DB: db })).json()) as {
      questions: { id: number; body: string; answers: { body: string }[] }[];
    };
    const qaAfter = after.questions.find((q) => q.id === qa.id)!;
    const qbAfter = after.questions.find((q) => q.id === qb.id)!;
    expect(qaAfter.answers.map((a) => a.body)).toEqual(["Aへの回答"]);
    expect(qbAfter.answers).toEqual([]);
  });

  it("存在しない id は 404", async () => {
    const db = createMemoryDb();
    const room = await postRoom(db, "勉強会", "198.51.100.24");
    const res = await app.request(
      `/api/rooms/${room.id}/questions/999/answers`,
      {
        method: "POST",
        headers: jsonHeaders("198.51.100.24"),
        body: JSON.stringify({ body: "幽霊への回答" }),
      },
      { DB: db },
    );
    expect(res.status).toBe(404);
  });

  it("他ボードの質問 id への回答は 404 で answers に増えない", async () => {
    const inner = createMemoryDb();
    const a = await postRoom(inner, "ボードA", "198.51.100.25");
    const b = await postRoom(inner, "ボードB", "198.51.100.26");
    await postQuestion(inner, a.id, "Aの質問", "198.51.100.27");
    const listed = (await (await app.request(`/api/rooms/${a.id}/questions`, {}, { DB: inner })).json()) as {
      questions: { id: number }[];
    };
    const qid = listed.questions[0].id;

    const { db, inserts } = withInsertCounter(inner, "INSERT INTO answers");
    const res = await app.request(
      `/api/rooms/${b.id}/questions/${qid}/answers`,
      {
        method: "POST",
        headers: jsonHeaders("198.51.100.28"),
        body: JSON.stringify({ body: "越境回答" }),
      },
      { DB: db },
    );
    expect(res.status).toBe(404);
    expect(inserts()).toBe(0);

    const afterA = (await (await app.request(`/api/rooms/${a.id}/questions`, {}, { DB: inner })).json()) as {
      questions: { answers: unknown[] }[];
    };
    expect(afterA.questions[0].answers).toEqual([]);
  });
});
