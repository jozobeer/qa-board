import { expect, test, type Browser, type Page } from "@playwright/test";

// 雛形スモーク。builder は受け入れ条件ごとの機能テストをこのファイルに追記する（雛形は削除しない）
test("ページがロードできてページエラーがない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});

test("GET /api/health が 200 で ok:true を返す", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

function uniqueToken(): string {
  return `T${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
}

async function openBoard(browser: Browser, ip: string) {
  const context = await browser.newContext({ extraHTTPHeaders: { "CF-Connecting-IP": ip } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "匿名Q&Aボード" })).toBeVisible();
  return { context, page };
}

function bodiesWith(page: Page, text: string) {
  return page.getByTestId("question-body").filter({ hasText: text });
}

function cardFor(page: Page, text: string) {
  return page.getByTestId("question-card").filter({
    has: page.getByTestId("question-body").filter({ hasText: text }),
  });
}

async function submitQuestion(page: Page, body: string) {
  await page.getByTestId("question-input").fill(body);
  await page.getByTestId("question-submit").click();
  await expect(page.getByTestId("question-submit")).toHaveText("質問する");
  await expect(page.getByTestId("question-submit")).toBeEnabled();
}

test("質問を投稿すると一覧の先頭に出て、別セッションでも見える", async ({ browser }) => {
  const token = uniqueToken();
  const body = `AC1 本文 ${token}`;
  const { context, page } = await openBoard(browser, "198.51.100.11");
  try {
    await submitQuestion(page, body);
    await expect(page.getByTestId("question-body").first()).toHaveText(body);
    await expect(page.getByTestId("answer-badge").first()).toHaveText("未回答");
  } finally {
    await context.close();
  }

  const second = await openBoard(browser, "198.51.100.12");
  try {
    await expect(bodiesWith(second.page, body)).toHaveCount(1);
  } finally {
    await second.context.close();
  }
});

test("回答は投稿先の質問にだけ紐づく", async ({ browser }) => {
  const token = uniqueToken();
  const { context, page } = await openBoard(browser, "198.51.100.21");
  try {
    await submitQuestion(page, `QB ${token}`);
    await submitQuestion(page, `QA ${token}`);

    const qa = cardFor(page, `QA ${token}`);
    const qb = cardFor(page, `QB ${token}`);
    await qa.getByTestId("answer-input").fill(`A1 ${token}`);
    await qa.getByTestId("answer-submit").click();

    await expect(qa.getByTestId("answer-item")).toHaveCount(1);
    await expect(qa.getByTestId("answer-item")).toHaveText(`A1 ${token}`);
    await expect(qa.getByTestId("answer-badge")).toHaveText("回答 1件");
    await expect(qb.getByTestId("answer-item")).toHaveCount(0);
    await expect(qb.getByTestId("answer-badge")).toHaveText("未回答");
  } finally {
    await context.close();
  }

  const second = await openBoard(browser, "198.51.100.22");
  try {
    const qa = cardFor(second.page, `QA ${token}`);
    const qb = cardFor(second.page, `QB ${token}`);
    await expect(qa.getByTestId("answer-item")).toHaveCount(1);
    await expect(qa.getByTestId("answer-item")).toHaveText(`A1 ${token}`);
    await expect(qa.getByTestId("answer-badge")).toHaveText("回答 1件");
    await expect(qb.getByTestId("answer-item")).toHaveCount(0);
    await expect(qb.getByTestId("answer-badge")).toHaveText("未回答");
  } finally {
    await second.context.close();
  }
});

test("未回答のみで回答 0 件の質問だけが残る", async ({ browser }) => {
  const token = uniqueToken();
  const { context, page } = await openBoard(browser, "198.51.100.31");
  try {
    await submitQuestion(page, `QB ${token}`);
    await submitQuestion(page, `QA ${token}`);
    const qa = cardFor(page, `QA ${token}`);
    await qa.getByTestId("answer-input").fill(`A1 ${token}`);
    await qa.getByTestId("answer-submit").click();
    await expect(qa.getByTestId("answer-item")).toHaveCount(1);

    await page.getByTestId("unanswered-filter").check();
    await expect(bodiesWith(page, `QA ${token}`)).toHaveCount(0);
    await expect(bodiesWith(page, `QB ${token}`)).toHaveCount(1);
    const visibleOn = await page.getByTestId("visible-count").innerText();
    const nOn = Number(visibleOn.match(/(\d+)/)?.[1]);
    expect(nOn).toBe(await page.getByTestId("question-card").count());

    await page.getByTestId("unanswered-filter").uncheck();
    await expect(bodiesWith(page, token)).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("入力の境界（空白のみ / 400文字 / 401文字）", async ({ browser }) => {
  const token = uniqueToken();
  const { context, page } = await openBoard(browser, "198.51.100.41");
  try {
    await expect(bodiesWith(page, token)).toHaveCount(0);
    await page.getByTestId("question-input").fill("   ");
    await page.getByTestId("question-submit").click();
    await expect(page.getByTestId("question-error")).toHaveText("質問を入力してください");
    await expect(bodiesWith(page, token)).toHaveCount(0);

    const exact400 = token + "あ".repeat(400 - token.length);
    await page.getByTestId("question-input").fill(exact400);
    await expect(page.getByTestId("question-counter")).toHaveText("400 / 400");
    await page.getByTestId("question-submit").click();
    await expect(page.getByTestId("question-body").first()).toHaveText(exact400);
    const posted = await page.getByTestId("question-body").first().textContent();
    expect(Array.from(posted ?? "").length).toBe(400);

    const tooLong = exact400 + "あ";
    await page.getByTestId("question-input").fill(tooLong);
    await expect(page.getByTestId("question-counter")).toHaveText("401 / 400");
    await page.getByTestId("question-submit").click();
    await expect(page.getByTestId("question-error")).toHaveText("400文字以内で入力してください");
    await expect(page.getByTestId("question-body").filter({ hasText: tooLong })).toHaveCount(0);
    await expect(bodiesWith(page, token)).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("10秒5件のレート制限境界", async ({ browser }) => {
  test.setTimeout(60_000);
  const token = uniqueToken();
  const { context, page } = await openBoard(browser, "198.51.100.51");
  try {
    for (let i = 1; i <= 5; i++) {
      await submitQuestion(page, `R${i} ${token}`);
    }
    await expect(bodiesWith(page, token)).toHaveCount(5);

    await page.getByTestId("question-input").fill(`R6 ${token}`);
    await page.getByTestId("question-submit").click();
    await expect(page.getByTestId("question-error")).toHaveText(
      "投稿が集中しています。10秒ほど待ってから送信してください",
    );
    await expect(bodiesWith(page, token)).toHaveCount(5);

    await page.waitForTimeout(11_000);
    await submitQuestion(page, `R6 ${token}`);
    await expect(bodiesWith(page, token)).toHaveCount(6);
  } finally {
    await context.close();
  }
});

test("送信処理中の追加操作では二重投稿されない", async ({ browser }) => {
  const token = uniqueToken();
  const body = `AC6 ${token}`;
  const { context, page } = await openBoard(browser, "198.51.100.61");
  try {
    let postCount = 0;
    await page.route("**/api/questions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      postCount += 1;
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue();
    });

    await page.getByTestId("question-input").fill(body);
    await page.getByTestId("question-submit").click();
    await expect(page.getByTestId("question-submit")).toBeDisabled();
    await expect(page.getByTestId("question-submit")).toHaveText("送信中…");
    await page.getByTestId("question-submit").click({ force: true });
    await page.getByTestId("question-submit").click({ force: true });

    await expect(bodiesWith(page, body)).toHaveCount(1);
    expect(postCount).toBe(1);
  } finally {
    await context.close();
  }
});

test("meta description があり空でない", async ({ page }) => {
  await page.goto("/");
  const meta = page.locator('meta[name="description"]');
  await expect(meta).toBeAttached();
  const content = await meta.getAttribute("content");
  expect(content?.trim().length).toBeGreaterThan(0);
});

test("JSON-LD に WebApplication の必須フィールドがある", async ({ page }) => {
  await page.goto("/");
  const loc = page.locator('script[type="application/ld+json"]');
  await expect(loc.first()).toBeAttached();
  const raw = await loc.first().textContent();
  expect(raw).toBeTruthy();
  const parsed: unknown = JSON.parse(raw ?? "");
  const app = findWebApplication(parsed);
  expect(app).toBeTruthy();
  expect(String(app?.name ?? "").trim().length).toBeGreaterThan(0);
  expect(String(app?.description ?? "").trim().length).toBeGreaterThan(0);
  expect(String(app?.url ?? "").trim().length).toBeGreaterThan(0);
  expect(String(app?.applicationCategory ?? "").trim().length).toBeGreaterThan(0);
  const offers = app?.offers as { price?: unknown } | undefined;
  expect(String(offers?.price)).toBe("0");
});

test("使い方と FAQ のセクションがある", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#how-to")).toBeVisible();
  await expect(page.getByRole("heading", { name: "使い方" })).toBeVisible();
  await expect(page.locator("#faq")).toBeVisible();
  await expect(page.getByRole("heading", { name: /よくある質問|FAQ/ })).toBeVisible();
});

function findWebApplication(data: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findWebApplication(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!data || typeof data !== "object") return undefined;
  const rec = data as Record<string, unknown>;
  const types = Array.isArray(rec["@type"]) ? rec["@type"] : [rec["@type"]];
  if (types.includes("WebApplication")) return rec;
  if ("@graph" in rec) return findWebApplication(rec["@graph"]);
  return undefined;
}
