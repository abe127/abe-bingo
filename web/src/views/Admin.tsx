import { useState } from "react";
import { gameOf, type Game } from "../../../shared/game";
import { Brand, Notice } from "../App";
import { GameEditor } from "../components/GameEditor";
import { api, errorMessage, eventId } from "../firebase";
import { useEventDoc, usePlayers } from "../hooks";
import { AllView } from "./Play";

const KEY_STORE = `kb-admin-${eventId}`;

/** 主催者画面。主催者キーを入れると開始・終了・リセットができる */
export function Admin() {
  const event = useEventDoc(eventId, true);
  const players = usePlayers(eventId, true);
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem(KEY_STORE) ?? "";
    } catch {
      return "";
    }
  });
  const [authed, setAuthed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (event.loading) return <Notice title="読み込み中…" body="" />;
  if (!event.data) return <Notice title="このイベントは見つかりません" body="URLを確かめてください。" />;

  const saveGame = async (game: Game) => {
    try {
      await api.admin({ eventId, adminKey: key, action: "saveGame", game });
    } catch (e) {
      throw new Error(errorMessage(e));
    }
  };

  const run = async (action: "check" | "start" | "finish" | "reset", done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.admin({ eventId, adminKey: key, action });
      setAuthed(true);
      try {
        sessionStorage.setItem(KEY_STORE, key);
      } catch {
        /* noop */
      }
      setMessage(done);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const base = `${location.origin}${location.pathname}?e=${encodeURIComponent(eventId)}`;

  return (
    <div className="wrap">
      <Brand sub="主催者画面" />
      <section className="panel">
        <h2 className="h2">{event.data.name}</h2>
        <p className="muted small">
          状態：<b>{event.data.status === "playing" ? "受付・プレイ中" : "終了"}</b>　参加者 {players.data.length}人
        </p>
        <div className="field">
          <span className="label">参加用URL</span>
          <code className="url">{base}</code>
        </div>
        <div className="field">
          <span className="label">会場スクリーン用URL</span>
          <code className="url">{base}#/screen</code>
        </div>
      </section>

      {!authed ? (
        <section className="panel">
          <label className="field">
            <span className="label">主催者キー</span>
            <input id="admin-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <button className="btn" disabled={!key || busy} onClick={() => run("check", "確認できました")}>
            主催者として操作する
          </button>
          {message && <p className="err">{message}</p>}
        </section>
      ) : (
        <section className="panel">
          <div className="btn-row">
            <button className="btn" disabled={busy || event.data.status === "playing"} onClick={() => run("start", "受付を再開しました")}>
              受付・プレイを再開
            </button>
            <button className="btn ghost" disabled={busy || event.data.status === "finished"} onClick={() => run("finish", "終了しました")}>
              終了する
            </button>
          </div>
          <p className="muted small">終了すると、新しい参加登録とマスを開ける操作ができなくなります。</p>
          <hr />
          <p className="muted small">リハーサルのあとなどに、全員のカード・回答・コードを削除します。元に戻せません。</p>
          {!confirmReset ? (
            <button className="btn danger" disabled={busy} onClick={() => setConfirmReset(true)}>
              全員のデータを削除
            </button>
          ) : (
            <div className="btn-row">
              <button className="btn danger" disabled={busy} onClick={() => run("reset", "削除しました")}>
                {players.data.length}人分を削除する
              </button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                やめる
              </button>
            </div>
          )}
          {message && <p className="small">{message}</p>}
        </section>
      )}
      {authed && <GameEditor game={gameOf(event.data)} locked={players.data.length > 0} onSave={saveGame} />}
      <AllView players={players.data} />
    </div>
  );
}
