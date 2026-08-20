import type { ApiResult, Question } from "./types";

const UNREACHABLE = "サーバに接続できませんでした";

async function readError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
      return data.error;
    }
  } catch {
  }
  return UNREACHABLE;
}

export async function fetchQuestions(unansweredOnly: boolean): Promise<ApiResult<Question[]>> {
  try {
    const path = unansweredOnly ? "/api/questions?unanswered=1" : "/api/questions";
    const res = await fetch(path);
    if (!res.ok) return { ok: false, message: await readError(res) };
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null || !("questions" in data) || !Array.isArray(data.questions)) {
      return { ok: false, message: UNREACHABLE };
    }
    return { ok: true, value: data.questions as Question[] };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export async function postQuestion(body: string): Promise<ApiResult<void>> {
  return postJson("/api/questions", body);
}

export async function postAnswer(questionId: number, body: string): Promise<ApiResult<void>> {
  return postJson(`/api/questions/${questionId}/answers`, body);
}

async function postJson(path: string, body: string): Promise<ApiResult<void>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
