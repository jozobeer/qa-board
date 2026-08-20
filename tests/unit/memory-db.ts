export type QuestionRow = { id: number; body: string; created_at: number };
export type AnswerRow = { id: number; question_id: number; body: string; created_at: number };
export type WriteLogRow = { id: number; client: string; created_at: number };

type ExecResult = { first: unknown; results: unknown[] };

export function createMemoryDb() {
  const questions: QuestionRow[] = [];
  const answers: AnswerRow[] = [];
  const writeLog: WriteLogRow[] = [];
  let nextQ = 1;
  let nextA = 1;
  let nextW = 1;

  function exec(sql: string, values: unknown[]): ExecResult {
    const q = sql.replace(/\s+/g, " ").trim();

    if (q.startsWith("SELECT count(*) AS n FROM app_meta")) {
      return { first: { n: 0 }, results: [{ n: 0 }] };
    }
    if (q.startsWith("INSERT INTO questions")) {
      questions.push({ id: nextQ++, body: String(values[0]), created_at: Number(values[1]) });
      return { first: null, results: [] };
    }
    if (q.startsWith("INSERT INTO answers")) {
      answers.push({
        id: nextA++,
        question_id: Number(values[0]),
        body: String(values[1]),
        created_at: Number(values[2]),
      });
      return { first: null, results: [] };
    }
    if (q.startsWith("INSERT INTO write_log")) {
      writeLog.push({ id: nextW++, client: String(values[0]), created_at: Number(values[1]) });
      return { first: null, results: [] };
    }
    if (q.startsWith("DELETE FROM write_log")) {
      const client = String(values[0]);
      const cutoff = Number(values[1]);
      for (let i = writeLog.length - 1; i >= 0; i--) {
        const row = writeLog[i];
        if (row.client === client && row.created_at <= cutoff) writeLog.splice(i, 1);
      }
      return { first: null, results: [] };
    }
    if (q.startsWith("SELECT created_at FROM write_log")) {
      const client = String(values[0]);
      const results = writeLog
        .filter((r) => r.client === client)
        .sort((a, b) => b.id - a.id)
        .slice(0, 5)
        .map((r) => ({ created_at: r.created_at }));
      return { first: results[0] ?? null, results };
    }
    if (q.startsWith("SELECT id FROM questions WHERE id")) {
      const row = questions.find((x) => x.id === Number(values[0]));
      return { first: row ? { id: row.id } : null, results: row ? [{ id: row.id }] : [] };
    }
    if (q.startsWith("SELECT id, body, created_at FROM questions")) {
      let rows = [...questions].sort((a, b) => b.id - a.id).slice(0, 200);
      if (q.includes("NOT EXISTS")) {
        rows = rows.filter((qq) => !answers.some((a) => a.question_id === qq.id));
      }
      return { first: rows[0] ?? null, results: rows };
    }
    if (q.includes("FROM answers") && q.includes("question_id IN")) {
      const ids = new Set(values.map(Number));
      const results = answers.filter((a) => ids.has(a.question_id)).sort((a, b) => a.id - b.id);
      return { first: results[0] ?? null, results };
    }
    throw new Error(`unhandled sql: ${q}`);
  }

  function statement(query: string, values: unknown[]) {
    return {
      bind(...next: unknown[]) {
        return statement(query, next);
      },
      first: async () => exec(query, values).first,
      all: async () => ({ results: exec(query, values).results }),
      run: async () => {
        exec(query, values);
        return {};
      },
    };
  }

  return { prepare: (query: string) => statement(query, []) };
}
