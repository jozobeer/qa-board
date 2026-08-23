import { useEffect, useState } from "react";
import { Board } from "./Board";
import { RoomForm } from "./RoomForm";

type Route = { kind: "home" } | { kind: "board"; id: string };

function parseHash(hash: string): Route {
  const m = /^#\/r\/([^/?#]+)$/.exec(hash);
  if (m) return { kind: "board", id: m[1] };
  return { kind: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    function onHash() {
      setRoute(parseHash(location.hash));
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
      <h1 style={{ margin: "0 0 0.4rem", color: "#324a5e", fontSize: "1.6rem" }}>{"匿名Q&Aボード"}</h1>
      {route.kind === "home" ? (
        <>
          <p style={{ margin: "0 0 1.1rem", color: "#4a5563" }}>
            {"ボードを作って共有URLを配ると、その場の質問だけを集められます。名前は残りません。"}
          </p>
          <RoomForm />
          <HelpSections />
        </>
      ) : (
        <Board key={route.id} roomId={route.id} />
      )}
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
          <li>ボード名を入れてボードを作ります。共有URLが発行されます。</li>
          <li>共有URLを参加者に配ります。URLを知っている人だけが同じボードを見ます。</li>
          <li>参加者が匿名で質問し、誰でもその質問に回答できます。「未回答のみ」で未回答に絞れます。</li>
        </ol>
      </section>
      <section id="faq" aria-labelledby="faq-heading" style={{ marginTop: "1.8rem" }}>
        <h2 id="faq-heading" style={sectionHeading}>
          よくある質問
        </h2>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>名前は表示されますか？</h3>
        <p style={muted}>表示されません。ログインも不要です。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>他のボードの質問は見えますか？</h3>
        <p style={muted}>見えません。共有URLを知っている人だけが、同じボードの質問と回答を見られます。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>投稿はあとから見られますか？</h3>
        <p style={muted}>同じ共有URLを開けば、別の端末やブラウザからでも同じ一覧が見えます。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>何文字まで書けますか？</h3>
        <p style={muted}>ボード名は 1〜40 文字、質問も回答も 1〜400 文字です。空白だけでは送れません。</p>
        <h3 style={{ margin: "0.9rem 0 0", fontSize: "0.95rem", color: "#1a2430" }}>
          「未回答のみ」を入れると質問が消えたときは？
        </h3>
        <p style={muted}>回答が付いた質問は、その表示では出ません。チェックを外すと戻ります。</p>
      </section>
    </>
  );
}
