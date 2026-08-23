import { useState } from "react";
import { postAnswer } from "./api";

export function AnswerForm({
  roomId,
  questionId,
  onSubmitted,
}: {
  roomId: string;
  questionId: number;
  onSubmitted: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await postAnswer(roomId, questionId, value);
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
      style={{ marginTop: "0.75rem" }}
    >
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          data-testid="answer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="回答を入力"
          aria-label="回答本文"
          style={{
            flex: 1,
            border: "1px solid #d5dbe3",
            borderRadius: 8,
            padding: "0.4rem 0.6rem",
            font: "inherit",
          }}
        />
        <button
          type="submit"
          data-testid="answer-submit"
          disabled={submitting}
          style={{
            background: "#324a5e",
            color: "#fff",
            border: 0,
            borderRadius: 8,
            padding: "0.4rem 0.8rem",
            font: "inherit",
            cursor: submitting ? "default" : "pointer",
            opacity: submitting ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {submitting ? "送信中…" : "回答する"}
        </button>
      </div>
      {error ? (
        <p style={{ color: "#b42318", margin: "0.4rem 0 0", fontSize: "0.85rem" }}>{error}</p>
      ) : null}
    </form>
  );
}
