export type Answer = {
  id: number;
  body: string;
  createdAt: number;
};

export type Question = {
  id: number;
  body: string;
  createdAt: number;
  answers: Answer[];
};

export type ApiResult<T> = { ok: true; value: T } | { ok: false; message: string };
