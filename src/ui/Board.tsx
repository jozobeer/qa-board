import { useEffect, useState } from "react";
import { fetchQuestions, fetchRoom } from "./api";
import { QuestionForm } from "./QuestionForm";
import { QuestionCard } from "./QuestionCard";
import type { Question, Room } from "./types";

export function Board({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const shareUrl = `${location.origin}/#/r/${roomId}`;

  async function reload() {
    const roomRes = await fetchRoom(roomId);
    if (!roomRes.ok) {
      if (roomRes.notFound) {
        setNotFound(true);
        setLoadError(null);
      } else {
        setNotFound(false);
        setLoadError(roomRes.message);
      }
      return;
    }
    setNotFound(false);
    setRoom(roomRes.value);
    const qRes = await fetchQuestions(roomId, unansweredOnly);
    if (!qRes.ok) {
      if (qRes.notFound) {
        setNotFound(true);
        setLoadError(null);
      } else {
        setLoadError(qRes.message);
      }
      return;
    }
    setLoadError(null);
    setQuestions(qRes.value);
  }

  useEffect(() => {
    void reload();
  }, [roomId, unansweredOnly]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied("コピーしました");
    } catch {
      setCopied("コピーできませんでした。URLを選択してコピーしてください");
    }
  }

  if (notFound) {
    return (
      <p data-testid="notfound" style={{ color: "#b42318" }}>
        このボードは見つかりませんでした
      </p>
    );
  }

  const visible = questions ?? [];
  const emptyMessage = unansweredOnly
    ? "未回答の質問はありません。"
    : "まだ質問はありません。最初の質問を投稿してみましょう。";

  return (
    <>
      {room ? (
        <>
          <h2 data-testid="room-name" style={{ margin: "0 0 0.4rem", fontSize: "1.2rem", color: "#1a2430" }}>
            {room.name}
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <code data-testid="share-url" style={{ fontSize: "0.85rem", color: "#4a5563", wordBreak: "break-all" }}>
              {shareUrl}
            </code>
            <button
              type="button"
              data-testid="copy"
              onClick={() => void copy()}
              style={{
                background: "#324a5e",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "0.35rem 0.8rem",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              コピー
            </button>
            {copied ? (
              <span data-testid="copied" style={{ fontSize: "0.85rem", color: "#324a5e" }}>
                {copied}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
      {loadError ? <p style={{ color: "#b42318" }}>{loadError}</p> : null}
      {room && !loadError ? (
        <>
          <QuestionForm roomId={roomId} onSubmitted={reload} />
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
          {questions !== null && questions.length === 0 ? (
            <p style={{ color: "#667085" }}>{emptyMessage}</p>
          ) : (
            <div style={{ display: "grid", gap: "0.8rem" }}>
              {visible.map((q) => (
                <QuestionCard key={q.id} roomId={roomId} question={q} onSubmitted={reload} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
