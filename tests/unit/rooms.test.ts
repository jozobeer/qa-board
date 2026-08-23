import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";
import { createMemoryDb } from "./memory-db";

function jsonHeaders(ip: string) {
  return { "Content-Type": "application/json", "CF-Connecting-IP": ip };
}

async function postRoom(db: ReturnType<typeof createMemoryDb>, name: string, ip: string) {
  return app.request(
    "/api/rooms",
    { method: "POST", headers: jsonHeaders(ip), body: JSON.stringify({ name }) },
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

describe("POST /api/rooms", () => {
  it("201 で { id, name } を返し、id は 8 桁 hex、name は trim 済み", async () => {
    const db = createMemoryDb();
    const res = await postRoom(db, "  春の勉強会  ", "198.51.100.101");
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; name: string };
    expect(json.id).toMatch(/^[0-9a-f]{8}$/);
    expect(json.name).toBe("春の勉強会");
  });

  it("空のボード名は 400 でボードが作られない", async () => {
    const { db, inserts } = withInsertCounter(createMemoryDb(), "INSERT INTO rooms");
    const res = await app.request(
      "/api/rooms",
      { method: "POST", headers: jsonHeaders("198.51.100.102"), body: JSON.stringify({ name: "   " }) },
      { DB: db },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ボード名を入力してください" });
    expect(inserts()).toBe(0);
  });

  it("41 文字のボード名は 400 でボードが作られない", async () => {
    const { db, inserts } = withInsertCounter(createMemoryDb(), "INSERT INTO rooms");
    const res = await app.request(
      "/api/rooms",
      { method: "POST", headers: jsonHeaders("198.51.100.103"), body: JSON.stringify({ name: "あ".repeat(41) }) },
      { DB: db },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "ボード名は40文字以内で入力してください" });
    expect(inserts()).toBe(0);
  });

  it("8,193 バイトのボディは 413", async () => {
    const db = createMemoryDb();
    const payload = JSON.stringify({ name: "a".repeat(8182) });
    expect(new TextEncoder().encode(payload).byteLength).toBe(8193);
    const res = await app.request(
      "/api/rooms",
      { method: "POST", headers: jsonHeaders("198.51.100.104"), body: payload },
      { DB: db },
    );
    expect(res.status).toBe(413);
  });

  it("同一 IP は 10 秒窓で 5 件まで 201、6 件目は 429。同じ IP からの質問投稿はこの後も 201", async () => {
    const db = createMemoryDb();
    const ip = "198.51.100.105";
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await postRoom(db, `ボード${i}`, ip);
      expect(res.status).toBe(201);
      const json = (await res.json()) as { id: string };
      ids.push(json.id);
    }
    const sixth = await postRoom(db, "ボード6", ip);
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({
      error: "作成が集中しています。10秒ほど待ってから作成してください",
    });

    const q = await app.request(
      `/api/rooms/${ids[0]}/questions`,
      { method: "POST", headers: jsonHeaders(ip), body: JSON.stringify({ body: "枠が独立している証明" }) },
      { DB: db },
    );
    expect(q.status).toBe(201);
  });

  it("SELECT id FROM rooms が常にヒットするフェイクでは 4 回試行のうえ 500", async () => {
    const inner = createMemoryDb();
    let idLookups = 0;
    const db = {
      prepare(query: string) {
        const q = query.replace(/\s+/g, " ").trim();
        if (q.startsWith("SELECT id FROM rooms WHERE id")) {
          return {
            bind(...values: unknown[]) {
              return {
                first: async () => {
                  idLookups += 1;
                  return { id: String(values[0]) };
                },
                all: async () => ({ results: [{ id: values[0] }] }),
                run: async () => ({}),
              };
            },
            first: async () => ({ id: "x" }),
            all: async () => ({ results: [] }),
            run: async () => ({}),
          };
        }
        return inner.prepare(query);
      },
    };
    const res = await app.request(
      "/api/rooms",
      { method: "POST", headers: jsonHeaders("198.51.100.106"), body: JSON.stringify({ name: "衝突" }) },
      { DB: db },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "ボードを作成できませんでした。もう一度お試しください",
    });
    expect(idLookups).toBe(4);
  });
});

describe("GET /api/rooms/:id", () => {
  it("存在するボードは 200 で { id, name } と no-store", async () => {
    const db = createMemoryDb();
    const created = await postRoom(db, "公開ボード", "198.51.100.107");
    const { id, name } = (await created.json()) as { id: string; name: string };
    const res = await app.request(`/api/rooms/${id}`, {}, { DB: db });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ id, name });
  });

  it("形式不正（zzzzzzzz / 7 桁 / 9 桁）は D1 を引かずに 404", async () => {
    const inner = createMemoryDb();
    let prepares = 0;
    const db = {
      prepare(query: string) {
        prepares += 1;
        return inner.prepare(query);
      },
    };
    for (const id of ["zzzzzzzz", "abcdefg", "abcdefghi"]) {
      prepares = 0;
      const res = await app.request(`/api/rooms/${id}`, {}, { DB: db });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "このボードは見つかりませんでした" });
      expect(prepares).toBe(0);
    }
  });

  it("未存在の 8 桁 hex は 404", async () => {
    const db = createMemoryDb();
    const res = await app.request("/api/rooms/00000000", {}, { DB: db });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "このボードは見つかりませんでした" });
  });
});
