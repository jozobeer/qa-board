import { useEffect, useState } from "react";
import { fetchQuestions } from "./api";
import { QuestionForm } from "./QuestionForm";
import { QuestionCard } from "./QuestionCard";
import type { Question } from "./types";

export function App() {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function reload() {
    const result = await fetchQuestions(unansweredOnly);
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setQuestions(result.value);
  }

  useEffect(() => {
    void reload();
  }, [unansweredOnly]);

  const visible = questions ?? [];
  const emptyMessage = unansweredOnly
    ? "未回答の質問はありません。"
    : "まだ質問はありません。最初の質問を投稿してみましょう。";

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
      <h1 style={{ margin: "0 0 0.4rem", color: "#324a5e", fontSize: "1.6rem" }}>{"匿名Q&Aボード"}</h1>
      <p style={{ margin: "0 0 1.1rem", color: "#4a5563" }}>
        {"名前は残りません。気になったことを自由に投稿してください。"}
      </p>
      <QuestionForm onSubmitted={reload} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          margin: "1.1rem 0 0.8rem",
          fontSize: "0.95rem",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="unanswered-filter"
            checked={unansweredOnly}
            onChange={(e) => setUnansweredOnly(e.target.checked)}
          />
          未回答のみ
        </label>
        <span data-testid="visible-count" style={{ color: "#667085" }}>
          表示中 {visible.length}件
        </span>
      </div>
      {loadError ? (
        <p style={{ color: "#b42318" }}>{loadError}</p>
      ) : questions !== null && questions.length === 0 ? (
        <p style={{ color: "#667085" }}>{emptyMessage}</p>
      ) : (
        <div style={{ display: "grid", gap: "0.8rem" }}>
          {visible.map((q) => (
            <QuestionCard key={q.id} question={q} onSubmitted={reload} />
          ))}
        </div>
      )}
    </main>
  );
}
