import { describe, expect, it } from "vitest";
import app, { isRateLimited } from "../../src/worker/index";
import { createMemoryDb } from "./memory-db";

describe("isRateLimited", () => {
  const now = 1_000_000;

  it("窓内が4件なら制限しない", () => {
    expect(isRateLimited([now, now, now, now], now)).toBe(false);
  });

  it("窓内が5件なら制限する", () => {
    expect(isRateLimited([now, now, now, now, now], now)).toBe(true);
  });

  it("経過 9,999ms の記録は窓内として数え、5件で制限する", () => {
    const t = now - 9_999;
    expect(isRateLimited([t, t, t, t, t], now)).toBe(true);
  });

  it("経過 10,000ms の記録は窓外として数えず、制限しない", () => {
    const t = now - 10_000;
    expect(isRateLimited([t, t, t, t, t], now)).toBe(false);
  });
});

describe("POST /api/rooms/:id/questions のレート制限", () => {
  it("同一クライアントの6件目を 429 で拒否する", async () => {
    const db = createMemoryDb();
    const headers = { "CF-Connecting-IP": "198.51.100.51", "Content-Type": "application/json" };

    const created = await app.request(
      "/api/rooms",
      { method: "POST", headers, body: JSON.stringify({ name: "レート検証" }) },
      { DB: db },
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    for (let i = 1; i <= 5; i++) {
      const res = await app.request(
        `/api/rooms/${id}/questions`,
        { method: "POST", headers, body: JSON.stringify({ body: `q${i}` }) },
        { DB: db },
      );
      expect(res.status).toBe(201);
    }

    const sixth = await app.request(
      `/api/rooms/${id}/questions`,
      { method: "POST", headers, body: JSON.stringify({ body: "q6" }) },
      { DB: db },
    );
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({
      error: "投稿が集中しています。10秒ほど待ってから送信してください",
    });
  });
});
