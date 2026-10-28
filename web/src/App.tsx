import { eventId } from "./firebase";
import { useHashRoute, useUid } from "./hooks";
import { Admin } from "./views/Admin";
import { Play } from "./views/Play";
import { Screen } from "./views/Screen";

export function App() {
  const route = useHashRoute();
  const { uid, error } = useUid();

  if (!eventId) return <Notice title="イベントが指定されていません" body="主催者から共有された参加用のURLを開いてください。" />;
  if (error) return <Notice title="開けませんでした" body={error} />;
  if (!uid) return <Notice title="読み込み中…" body="少しお待ちください" />;

  if (route === "screen") return <Screen />;
  if (route === "admin") return <Admin />;
  const meet = route.match(/^meet\/(\d{4})$/)?.[1] ?? null;
  return <Play uid={uid} meetCode={meet} />;
}

export function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="wrap">
      <Brand />
      <div className="panel center">
        <b>{title}</b>
        <span className="muted small">{body}</span>
      </div>
    </div>
  );
}

export function Brand({ sub }: { sub?: string }) {
  return (
    <header className="brand">
      <h1>
        共通点<span>ビンゴ</span>
      </h1>
      {sub && <small>{sub}</small>}
    </header>
  );
}
