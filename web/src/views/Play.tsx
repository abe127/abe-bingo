import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAYABLE_CELLS, choicesOf, countLines, gameOf, indexOf, type Game } from "../../../shared/game";
import { Brand, Notice } from "../App";
import { Board } from "../components/Board";
import { QrCode } from "../components/QrCode";
import { Sheet, Who } from "../components/Sheet";
import { api, errorMessage, eventId, type OpenResult, type Preview } from "../firebase";
import { ranked, useEventDoc, usePlayers, usePrivate, type Player } from "../hooks";

// カメラ読み取りのライブラリは大きいので、使うときだけ読み込む
const Scanner = lazy(() => import("../components/Scanner").then((m) => ({ default: m.Scanner })));

type Tab = "card" | "all" | "rules";

export function Play({ uid, meetCode }: { uid: string; meetCode: string | null }) {
  const event = useEventDoc(eventId, true);
  const players = usePlayers(eventId, true);
  const priv = usePrivate(eventId, uid);
  const [tab, setTab] = useState<Tab>("card");

  const me = players.data.find((p) => p.id === uid);
  const game = useMemo(() => gameOf(event.data), [event.data]);
  const nicknames = useMemo(() => Object.fromEntries(players.data.map((p) => [p.id, p.nickname])), [players.data]);

  if (event.loading || priv.loading) return <Notice title="読み込み中…" body="参加者の情報を取得しています" />;
  if (!event.data) return <Notice title="このイベントは見つかりません" body="URLが正しいか、主催者に確かめてください。" />;

  const joined = !!priv.data && !!me;
  const finished = event.data.status === "finished";

  return (
    <div className="wrap">
      <Brand sub={event.data.name} />
      {finished && <div className="banner-note">このイベントは終了しました。結果は「みんな」で見られます。</div>}
      {!joined ? (
        finished ? null : <JoinForm game={game} />
      ) : (
        <>
          <nav className="tabs" role="tablist">
            {(
              [
                ["card", "カード"],
                ["all", "みんな"],
                ["rules", "遊び方"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </nav>
          {tab === "card" && (
            <CardView game={game} me={me} code={priv.data!.code} nicknames={nicknames} meetCode={meetCode} finished={finished} />
          )}
          {tab === "all" && <AllView players={players.data} uid={uid} />}
          {tab === "rules" && <RulesView />}
        </>
      )}
    </div>
  );
}

/* ---------- 参加登録 ---------- */
const DRAFT_KEY = `kb-draft-${eventId}`;

function JoinForm({ game }: { game: Game }) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const [nickname, setNickname] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (q: string, v: string) => {
    const next = { ...answers, [q]: v };
    setAnswers(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      /* 保存できなくても続行 */
    }
  };
  const questions = game.questions;
  // 主催者が質問を変えた場合に備え、今の質問と選択肢に合う回答だけを数える
  const valid = Object.fromEntries(
    questions.filter((q) => choicesOf(q).includes(answers[q.id])).map((q) => [q.id, answers[q.id]]),
  );
  const answered = Object.keys(valid).length;
  const ready = answered === questions.length && nickname.trim() && passphrase.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.join({ eventId, nickname: nickname.trim(), passphrase, answers: valid });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* noop */
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <section className="panel">
        <div>
          <h2 className="h2">参加登録</h2>
          <p className="muted small">
            答えをもとにあなただけのカードができます。回答はほかの参加者には見えず、照合のときに共通点だけが表示されます。登録後は変更できません。
          </p>
        </div>
        <label className="field">
          <span className="label">ニックネーム</span>
          <input id="nickname" value={nickname} maxLength={20} onChange={(e) => setNickname(e.target.value)} placeholder="会場で呼ばれたい名前" />
        </label>
        <label className="field">
          <span className="label">合言葉</span>
          <input id="passphrase" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="会場で案内された言葉" />
        </label>
      </section>
      <section className="panel">
        {questions.map((q, i) => (
          <div className="q" key={q.id}>
            <h3>
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              {q.label}
            </h3>
            <div className="chips">
              {choicesOf(q).map((o) => (
                <button key={o} className="chip" aria-pressed={answers[q.id] === o} onClick={() => pick(q.id, o)}>
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
      {error && <p className="err">{error}</p>}
      <div className="progress">
        <div className="count">
          {answered} / {questions.length}
        </div>
        <div className="bar">
          <i style={{ width: `${(answered / questions.length) * 100}%` }} />
        </div>
        <button className="btn" disabled={!ready || busy} onClick={submit}>
          {busy ? "作成中…" : "カードを作る"}
        </button>
      </div>
    </>
  );
}

/* ---------- カード ---------- */
type SheetState =
  | { kind: "preview"; code: string; data: Preview }
  | { kind: "result"; data: OpenResult; partner: string }
  | { kind: "cell"; index: number }
  | { kind: "scan" }
  | null;

function CardView(props: {
  game: Game;
  me: Player | undefined;
  code: string;
  nicknames: Record<string, string>;
  meetCode: string | null;
  finished: boolean;
}) {
  const { game, me, code, nicknames, meetCode, finished } = props;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [justOpened, setJustOpened] = useState<number | null>(null);
  const handledMeet = useRef(false);

  const check = useCallback(async (partnerCode: string) => {
    setError(null);
    if (!/^\d{4}$/.test(partnerCode)) return setError("4けたの数字を入力してください");
    setBusy(true);
    try {
      const data = await api.preview({ eventId, code: partnerCode });
      setSheet({ kind: "preview", code: partnerCode, data });
    } catch (e) {
      setSheet(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // 相手の QR をスマホのカメラで読んで開いたとき（#/meet/1234）
  useEffect(() => {
    if (meetCode && !handledMeet.current) {
      handledMeet.current = true;
      history.replaceState(null, "", location.pathname + location.search);
      check(meetCode);
    }
  }, [meetCode, check]);

  const onScanned = useCallback((c: string) => check(c), [check]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const open = async (partnerCode: string, index: number, partner: string) => {
    setBusy(true);
    try {
      const data = await api.open({ eventId, code: partnerCode, index });
      setJustOpened(index);
      setInput("");
      setSheet({ kind: "result", data, partner });
    } catch (e) {
      setSheet(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!me) return null;
  const lines = countLines(Object.keys(me.opened).map(Number));
  const meetUrl = `${location.origin}${location.pathname}?e=${encodeURIComponent(eventId)}#/meet/${code}`;

  return (
    <>
      <section className="panel mecode">
        <QrCode value={meetUrl} size={112} label={`あなたのコード ${code} の QR コード`} />
        <div className="mecode-text">
          <div className="label">あなたのコード</div>
          <div className="code">{code}</div>
          <div className="status">
            <span className="pill">
              {me.openedCount} / {PLAYABLE_CELLS}マス
            </span>
            {lines > 0 && <span className="pill win">BINGO ×{lines}</span>}
          </div>
        </div>
      </section>
      {lines > 0 && <div className="bingo-banner">BINGO{lines > 1 ? ` ×${lines}` : ""}！</div>}

      <Board
        game={game}
        card={me.card}
        opened={me.opened}
        nicknames={nicknames}
        justOpened={justOpened}
        onCell={(index) => setSheet({ kind: "cell", index })}
      />

      {!finished && (
        <section className="panel">
          <label className="label" htmlFor="pcode">
            話した相手のコード
          </label>
          <form
            className="codeform"
            onSubmit={(e) => {
              e.preventDefault();
              check(input);
            }}
          >
            <input
              id="pcode"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              value={input}
              onChange={(e) => {
                setInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                setError(null);
              }}
            />
            <button className="btn" type="submit" disabled={busy}>
              照合
            </button>
          </form>
          <button className="btn ghost" onClick={() => setSheet({ kind: "scan" })}>
            QRコードを読み取る
          </button>
          {error && <p className="err">{error}</p>}
        </section>
      )}

      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.kind === "scan" && (
            <Suspense fallback={<p className="muted">カメラを準備しています…</p>}>
              <Scanner onCode={onScanned} onClose={closeSheet} />
            </Suspense>
          )}
          {sheet.kind === "preview" && (
            <PreviewSheet sheet={sheet} busy={busy} onOpen={open} onClose={closeSheet} />
          )}
          {sheet.kind === "result" && (
            <>
              <div className="bingo-banner pop">{sheet.data.newBingo ? "BINGO！" : "OPEN！"}</div>
              <p className="center-text">
                <b>{sheet.data.label}</b> を開けました
              </p>
              <div className="hint">
                {sheet.data.detail}
                <br />
                <span className="small">{sheet.data.hint}</span>
              </div>
              <button className="btn" onClick={closeSheet}>
                カードに戻る
              </button>
            </>
          )}
          {sheet.kind === "cell" && <CellSheet game={game} me={me} index={sheet.index} nicknames={nicknames} onClose={closeSheet} />}
        </Sheet>
      )}
    </>
  );
}

function PreviewSheet({
  sheet,
  busy,
  onOpen,
  onClose,
}: {
  sheet: { code: string; data: Preview };
  busy: boolean;
  onOpen: (code: string, index: number, partner: string) => void;
  onClose: () => void;
}) {
  const { partner, alreadyUsed, candidates, commons } = sheet.data;
  return (
    <>
      <Who label="話した相手" name={partner.nickname} />
      {alreadyUsed ? (
        <p>
          この人とは「{alreadyUsed.label}」で開けています。1人につき開けられるのは1マスです。次の人を探しましょう。
        </p>
      ) : candidates.length === 0 ? (
        <>
          <p>いま開けられるマスはありませんでした。</p>
          {commons.length > 0 && (
            <div className="hint">共通点：{commons.map((c) => `${c.label}「${c.value}」`).join("、")}</div>
          )}
        </>
      ) : (
        <>
          <p>
            開けるマスを1つ選んでください。<span className="muted small">この人で開けられるのは1マスだけです。</span>
          </p>
          <div className="opts">
            {candidates.map((c) => (
              <button key={c.index} className="opt" disabled={busy} onClick={() => onOpen(sheet.code, c.index, partner.nickname)}>
                <span>
                  <b>{c.label}</b>
                  <small>{c.detail}</small>
                </span>
                <span className="go">開ける</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button className="btn ghost" onClick={onClose}>
        {candidates.length && !alreadyUsed ? "やめる" : "閉じる"}
      </button>
    </>
  );
}

function CellSheet({
  game,
  me,
  index,
  nicknames,
  onClose,
}: {
  game: Game;
  me: Player;
  index: number;
  nicknames: Record<string, string>;
  onClose: () => void;
}) {
  const { cells, questions } = indexOf(game);
  const cell = cells[me.card[index]];
  if (!cell) return null;
  const o = me.opened[String(index)];
  return (
    <>
      {o ? (
        <>
          <Who label={cell.label} name={nicknames[o.by] ?? "参加者"} />
          <div className="hint">
            {o.detail}
            <br />
            <span className="small">{questions[cell.q]?.hint}</span>
          </div>
        </>
      ) : (
        <p>
          <b>{cell.label}</b>：まだ見つかっていません。
        </p>
      )}
      <button className="btn ghost" onClick={onClose}>
        閉じる
      </button>
    </>
  );
}

/* ---------- みんな ---------- */
export function AllView({ players, uid }: { players: Player[]; uid?: string }) {
  const list = ranked(players);
  const bingos = list.filter((p) => p.lines > 0).length;
  return (
    <section className="panel">
      <div className="stats">
        <div className="stat">
          <span className="label">参加者</span>
          <b>{list.length}</b>
        </div>
        <div className="stat">
          <span className="label">ビンゴ達成</span>
          <b>{bingos}</b>
        </div>
      </div>
      <div className="rows">
        {list.map((p, k) => (
          <div key={p.id} className={`row${p.id === uid ? " me" : ""}`}>
            <div className="rk">{k + 1}</div>
            <div className="avatar sm" aria-hidden="true">
              {[...p.nickname][0]}
            </div>
            <div className="minw0">
              <div className="nm">{p.nickname}</div>
              <div className="meter">
                <i style={{ width: `${(p.openedCount / PLAYABLE_CELLS) * 100}%` }} />
              </div>
            </div>
            <div className="right">
              {p.lines > 0 ? <span className="pill win">BINGO ×{p.lines}</span> : `${p.openedCount}/${PLAYABLE_CELLS}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RulesView() {
  return (
    <section className="panel">
      <h2 className="h2">遊び方</h2>
      <ol className="rules">
        <li>会場で誰かに話しかけて、お互いのQRコードを読み取ります（4けたのコードを入力してもOK）。</li>
        <li>二人の共通点（「×」のマスは違い）で開けられるマスが出てきます。</li>
        <li>
          開けるマスを1つ選びます。<b>1人につき開けられるのは1マスだけ</b>なので、いろいろな人と話しましょう。
        </li>
        <li>タテ・ヨコ・ナナメのどれか1列そろえばビンゴです。「みんな」タブで順位が見られます。</li>
      </ol>
      <p className="muted small">回答はほかの参加者には表示されません。照合した相手には、開けたマスに関わる答えと共通点だけが表示されます。</p>
      <p className="muted small">同じスマホ・同じブラウザで開くと続きから遊べます。ブラウザを変えたり履歴を消したりすると、別の参加者として扱われます。</p>
    </section>
  );
}
