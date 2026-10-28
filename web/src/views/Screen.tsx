import { PLAYABLE_CELLS } from "../../../shared/game";
import { Notice } from "../App";
import { QrCode } from "../components/QrCode";
import { eventId } from "../firebase";
import { ranked, useEventDoc, usePlayers } from "../hooks";

/** 会場のプロジェクター用。参加用QRとランキングを大きく出す */
export function Screen() {
  const event = useEventDoc(eventId, true);
  const players = usePlayers(eventId, true);
  if (event.loading) return <Notice title="読み込み中…" body="" />;
  if (!event.data) return <Notice title="このイベントは見つかりません" body="URLを確かめてください。" />;

  const list = ranked(players.data);
  const bingos = list.filter((p) => p.lines > 0);
  const joinUrl = `${location.origin}${location.pathname}?e=${encodeURIComponent(eventId)}`;

  return (
    <div className="screen">
      <aside className="screen-side">
        <h1 className="screen-title">
          共通点<span>ビンゴ</span>
        </h1>
        <p className="screen-event">{event.data.name}</p>
        {event.data.status === "playing" ? (
          <>
            <QrCode value={joinUrl} size={240} label="参加用のQRコード" />
            <p className="muted">スマホで読み取って参加</p>
          </>
        ) : (
          <p className="screen-finished">終了しました</p>
        )}
        <div className="stats">
          <div className="stat">
            <span className="label">参加者</span>
            <b>{list.length}</b>
          </div>
          <div className="stat">
            <span className="label">ビンゴ達成</span>
            <b>{bingos.length}</b>
          </div>
        </div>
      </aside>
      <main className="screen-main">
        <h2 className="label">ランキング</h2>
        <ol className="screen-rank">
          {list.slice(0, 12).map((p, i) => (
            <li key={p.id} className={p.lines > 0 ? "won" : ""}>
              <span className="rk">{i + 1}</span>
              <span className="nm">{p.nickname}</span>
              <span className="meter">
                <i style={{ width: `${(p.openedCount / PLAYABLE_CELLS) * 100}%` }} />
              </span>
              <span className="right">{p.lines > 0 ? `BINGO ×${p.lines}` : `${p.openedCount}マス`}</span>
            </li>
          ))}
          {list.length === 0 && <li className="muted">まだ参加者はいません</li>}
        </ol>
      </main>
    </div>
  );
}
