import type { Question } from "./types";
import { AnswerForm } from "./AnswerForm";

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("ja-JP");
}

export function QuestionCard({
  roomId,
  question,
  onSubmitted,
}: {
  roomId: string;
  question: Question;
  onSubmitted: () => Promise<void>;
}) {
  const n = question.answers.length;
  const badge = n === 0 ? "未回答" : `回答 ${n}件`;

  return (
    <article
      data-testid="question-card"
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "1rem 1.1rem",
        boxShadow: "0 1px 2px rgba(0,0,0,.06)",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        <p data-testid="question-body" style={{ margin: 0, flex: 1, whiteSpace: "pre-wrap" }}>
          {question.body}
        </p>
        <span
          data-testid="answer-badge"
          style={{
            flexShrink: 0,
            fontSize: "0.75rem",
            background: n === 0 ? "#eef2f6" : "#324a5e",
            color: n === 0 ? "#324a5e" : "#fff",
            borderRadius: 999,
            padding: "0.15rem 0.55rem",
          }}
        >
          {badge}
        </span>
      </div>
      <p style={{ margin: "0.4rem 0 0", fontSize: "0.8rem", color: "#667085" }}>{formatTime(question.createdAt)}</p>
      {question.answers.length > 0 ? (
        <ul style={{ margin: "0.75rem 0 0", padding: 0, listStyle: "none" }}>
          {question.answers.map((a) => (
            <li
              key={a.id}
              data-testid="answer-item"
              style={{
                background: "#f6f7f9",
                borderRadius: 8,
                padding: "0.55rem 0.7rem",
                marginTop: "0.4rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {a.body}
            </li>
          ))}
        </ul>
      ) : null}
      <AnswerForm roomId={roomId} questionId={question.id} onSubmitted={onSubmitted} />
    </article>
  );
}
