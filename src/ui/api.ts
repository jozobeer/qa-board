import type { ApiResult, LoadResult, Question, Room } from "./types";

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

function asLoadFail(res: Response, message: string): LoadResult<never> {
  return { ok: false, notFound: res.status === 404, message };
}

export async function createRoom(name: string): Promise<ApiResult<Room>> {
  try {
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return { ok: false, message: await readError(res) };
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("id" in data) ||
      !("name" in data) ||
      typeof data.id !== "string" ||
      typeof data.name !== "string"
    ) {
      return { ok: false, message: UNREACHABLE };
    }
    return { ok: true, value: { id: data.id, name: data.name } };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export async function fetchRoom(roomId: string): Promise<LoadResult<Room>> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
    if (!res.ok) return asLoadFail(res, await readError(res));
    const data: unknown = await res.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("id" in data) ||
      !("name" in data) ||
      typeof data.id !== "string" ||
      typeof data.name !== "string"
    ) {
      return { ok: false, notFound: false, message: UNREACHABLE };
    }
    return { ok: true, value: { id: data.id, name: data.name } };
  } catch {
    return { ok: false, notFound: false, message: UNREACHABLE };
  }
}

export async function fetchQuestions(roomId: string, unansweredOnly: boolean): Promise<LoadResult<Question[]>> {
  try {
    const q = unansweredOnly ? "?unanswered=1" : "";
    const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/questions${q}`);
    if (!res.ok) return asLoadFail(res, await readError(res));
    const data: unknown = await res.json();
    if (typeof data !== "object" || data === null || !("questions" in data) || !Array.isArray(data.questions)) {
      return { ok: false, notFound: false, message: UNREACHABLE };
    }
    return { ok: true, value: data.questions as Question[] };
  } catch {
    return { ok: false, notFound: false, message: UNREACHABLE };
  }
}

export async function postQuestion(roomId: string, body: string): Promise<ApiResult<void>> {
  return postJson(`/api/rooms/${encodeURIComponent(roomId)}/questions`, body);
}

export async function postAnswer(roomId: string, questionId: number, body: string): Promise<ApiResult<void>> {
  return postJson(`/api/rooms/${encodeURIComponent(roomId)}/questions/${questionId}/answers`, body);
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
