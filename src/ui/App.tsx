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
      <HelpSections />
    </main>
  );
}

const sectionHeading = { margin: "0 0 0.6rem", color: "#324a5e", fontSize: "1.15rem" } as const;
const muted = { margin: "0.35rem 0 0", color: "#4a5563", lineHeight: 1.7 } as const;

function HelpSections() {
  return (
    <>
      <section id="how-to" aria-labelledby="how-to-heading" style={{ marginTop: "2.5rem" }}>
        <h2 id="how-to-heading" style={sectionHeading}>
          使い方
        </h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem", color: "#4a5563", lineHeight: 1.7 }}>
          <li>上の欄に質問を書いて「質問する」を押します。名前は残りません。</li>
          <li>投稿は新しい順のカードになります。各カードから、その質問への回答を送れます。</li>
          <li>「未回答のみ」を入れると、まだ回答がない質問だけが表示されます。</li>
        </ol>
      </section>
      <section id="faq" aria-labelledby="faq-heading" style={{ marginTop: "1.8rem" }}>
        <h2 id="faq-heading" style={sectionHeading}>
          よくある質問
        </h2>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>名前は表示されますか？</h3>
        <p style={muted}>表示されません。ログインも不要です。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>投稿はあとから見られますか？</h3>
        <p style={muted}>このボードに残るので、別の端末やブラウザから開いても同じ一覧が見えます。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>何文字まで書けますか？</h3>
        <p style={muted}>質問も回答も 1〜400 文字です。空白だけでは送れません。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>
          「未回答のみ」を入れると質問が消えたときは？
        </h3>
        <p style={muted}>回答が付いた質問は、その表示では出ません。チェックを外すと戻ります。</p>
      </section>
    </>
  );
}
