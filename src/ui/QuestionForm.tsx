import { useState } from "react";
import { postQuestion } from "./api";

export function QuestionForm({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const count = Array.from(value).length;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await postQuestion(value);
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    setValue("");
    setSubmitting(false);
    await onSubmitted();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "1rem",
        boxShadow: "0 1px 2px rgba(0,0,0,.06)",
      }}
    >
      <textarea
        data-testid="question-input"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="質問を入力"
        aria-label="質問本文"
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          border: "1px solid #d5dbe3",
          borderRadius: 8,
          padding: "0.6rem 0.7rem",
          font: "inherit",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem" }}>
        <span
          data-testid="question-counter"
          style={{ fontSize: "0.85rem", color: count > 400 ? "#b42318" : "#667085" }}
        >
          {count} / 400
        </span>
        <button
          type="submit"
          data-testid="question-submit"
          disabled={submitting}
          style={{
            marginLeft: "auto",
            background: "#324a5e",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "0.45rem 1rem",
            font: "inherit",
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "送信中…" : "質問する"}
        </button>
      </div>
      {error ? (
        <p data-testid="question-error" style={{ color: "#b42318", margin: "0.6rem 0 0", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
