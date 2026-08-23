import { useState } from "react";
import { createRoom } from "./api";

export function RoomForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createRoom(name);
    if (!result.ok) {
      setError(result.message);
      setSubmitting(false);
      return;
    }
    location.hash = "#/r/" + result.value.id;
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
      <input
        data-testid="room-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ボード名を入力"
        aria-label="ボード名"
        style={{
          width: "100%",
          boxSizing: "border-box",
          border: "1px solid #d5dbe3",
          borderRadius: 8,
          padding: "0.6rem 0.7rem",
          font: "inherit",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.6rem" }}>
        <button
          type="submit"
          data-testid="create"
          disabled={submitting}
          style={{
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
          {submitting ? "作成中…" : "ボードを作る"}
        </button>
      </div>
      {error ? (
        <p data-testid="create-error" style={{ color: "#b42318", margin: "0.6rem 0 0", fontSize: "0.9rem" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
