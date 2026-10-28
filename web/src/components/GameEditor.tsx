import { useMemo, useState } from "react";
import {
  CELL_KINDS,
  DEFAULT_GAME,
  KIND_NAMES,
  LIMITS,
  PLAYABLE_CELLS,
  SKIP,
  cellsOf,
  kindAllowed,
  validateGame,
  type CellKind,
  type Game,
  type Question,
} from "../../../shared/game";

type Props = {
  game: Game;
  /** 参加者がいて編集できない */
  locked: boolean;
  onSave: (game: Game) => Promise<void>;
};

const clone = (g: Game): Game => JSON.parse(JSON.stringify(g));

/** キーの順番に左右されない比較用の文字列（Firestore から戻るとキー順が変わるため） */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

/** 選択肢の数が変わって使えなくなった種類のマスを外す */
function dropDisallowed(q: Question): Question {
  const cells = { ...q.cells };
  for (const k of CELL_KINDS) if (cells[k] !== undefined && !kindAllowed(k, q.options.length)) delete cells[k];
  return { ...q, cells, ...(kindAllowed("adj", q.options.length) ? {} : { cyclic: undefined }) };
}
const newId = () => "q" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
const cut = (s: string, n: number) => [...s].slice(0, n).join("");

/** マスを有効にしたときに入れておく表示名の案 */
function suggestLabel(q: Question, kind: CellKind): string {
  const base = q.label.replace(/[？?。、]+$/, "");
  if (kind === "same") return cut(`${cut(base, 8)}が同じ`, LIMITS.cellLabel);
  if (kind === "opp") return cut(`${q.options[0] ?? ""}×${q.options[1] ?? ""}`, LIMITS.cellLabel);
  return cut(`${cut(base, 7)}がおとなり`, LIMITS.cellLabel);
}

/** 主催者が部屋ごとの質問とマスを編集する */
export function GameEditor({ game, locked, onSave }: Props) {
  const [draft, setDraft] = useState<Game>(() => clone(game));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importText, setImportText] = useState<string | null>(null);

  const dirty = stable(draft) !== stable(game);
  const check = useMemo(() => validateGame(draft), [draft]);
  const cellCount = useMemo(() => cellsOf(draft).length, [draft]);
  const templates = DEFAULT_GAME.questions.filter((t) => !draft.questions.some((q) => q.id === t.id));

  const update = (id: string, fn: (q: Question) => Question) =>
    setDraft((g) => ({ questions: g.questions.map((q) => (q.id === id ? fn(q) : q)) }));
  const move = (index: number, delta: number) =>
    setDraft((g) => {
      const qs = [...g.questions];
      const [q] = qs.splice(index, 1);
      qs.splice(index + delta, 0, q);
      return { questions: qs };
    });
  const remove = (id: string) => setDraft((g) => ({ questions: g.questions.filter((q) => q.id !== id) }));
  const add = (q: Question) => {
    setDraft((g) => ({ questions: [...g.questions, q] }));
    setOpen(q.id);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await onSave(check.game!);
      setMessage("保存しました。これから参加する人のカードに反映されます");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
      setMessage("設定をコピーしました");
    } catch {
      setImportText(JSON.stringify(draft, null, 2));
      setMessage("コピーできなかったので、下の欄から選択してコピーしてください");
    }
  };
  const loadJson = () => {
    try {
      const parsed = JSON.parse(importText ?? "");
      if (!Array.isArray(parsed?.questions)) throw new Error();
      setDraft(clone(parsed));
      setImportText(null);
      setMessage("読み込みました。内容を確認して保存してください");
    } catch {
      setMessage("JSON として読み込めませんでした");
    }
  };

  return (
    <section className="panel editor">
      <div className="editor-head">
        <h2 className="h2">質問とマス</h2>
        <span className={`pill ${cellCount >= PLAYABLE_CELLS ? "ok" : "ng"}`}>
          マス {cellCount} / {PLAYABLE_CELLS}種類以上
        </span>
      </div>
      {locked ? (
        <p className="banner-note">
          参加者がいるため編集できません。変えるときは、下の「全員のデータを削除」をしてから編集してください。
        </p>
      ) : (
        <p className="muted small">
          質問ごとに「同じ」「違う（2択のみ）」「となり（3択以上）」のマスを作れます。カードには{PLAYABLE_CELLS}
          種類がランダムに並ぶので、合計{PLAYABLE_CELLS}種類以上必要です。種類が多いほどカードがばらけます。
        </p>
      )}

      <fieldset className="editor-body" disabled={locked || busy}>
        <ol className="qlist">
          {draft.questions.map((q, i) => {
            const isOpen = open === q.id;
            const kinds = CELL_KINDS.filter((k) => q.cells[k] && kindAllowed(k, q.options.length));
            return (
              <li key={q.id} className={`qitem${isOpen ? " open" : ""}`}>
                <button type="button" className="qsum" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : q.id)}>
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="qsum-text">
                    <b>{q.label || "（質問文なし）"}</b>
                    <small>
                      {q.options.length}択{q.allowSkip ? "＋答えない" : ""}・マス {kinds.map((k) => KIND_NAMES[k]).join("/") || "なし"}
                    </small>
                  </span>
                  <span className="chev" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && <QuestionForm q={q} onChange={(fn) => update(q.id, fn)} />}
                {isOpen && (
                  <div className="btn-row compact">
                    <button type="button" className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                      上へ
                    </button>
                    <button type="button" className="btn ghost" disabled={i === draft.questions.length - 1} onClick={() => move(i, 1)}>
                      下へ
                    </button>
                    <button type="button" className="btn danger" onClick={() => remove(q.id)}>
                      この質問を削除
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="btn-row">
          <button
            type="button"
            className="btn ghost"
            disabled={draft.questions.length >= LIMITS.questions}
            onClick={() => add({ id: newId(), label: "", options: ["", ""], hint: "", cells: { same: "" } })}
          >
            質問を追加
          </button>
          {templates.length > 0 && (
            <select
              className="select"
              id="template"
              value=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) add(clone({ questions: [t] }).questions[0]);
              }}
            >
              <option value="">定番の質問から追加…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>

      {check.errors.length > 0 && (
        <ul className="errors">
          {check.errors.slice(0, 8).map((e) => (
            <li key={e}>{e}</li>
          ))}
          {check.errors.length > 8 && <li>ほか {check.errors.length - 8}件</li>}
        </ul>
      )}

      <div className="btn-row">
        <button type="button" className="btn" disabled={locked || busy || !dirty || !check.game} onClick={save}>
          {busy ? "保存中…" : dirty ? "保存する" : "保存済み"}
        </button>
        <button type="button" className="btn ghost" disabled={locked || busy || !dirty} onClick={() => setDraft(clone(game))}>
          変更を取り消す
        </button>
      </div>
      {message && <p className="small">{message}</p>}

      <details className="more">
        <summary>そのほかの操作</summary>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={copyJson}>
            設定を JSON でコピー
          </button>
          <button type="button" className="btn ghost" disabled={locked} onClick={() => setImportText(importText ?? "")}>
            JSON を貼り付けて読み込む
          </button>
          <button type="button" className="btn ghost" disabled={locked} onClick={() => setDraft(clone(DEFAULT_GAME))}>
            定番の20問に戻す
          </button>
        </div>
        {importText !== null && (
          <div className="field">
            <textarea id="game-json" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div className="btn-row">
              <button type="button" className="btn ghost" disabled={locked} onClick={loadJson}>
                読み込む
              </button>
              <button type="button" className="btn ghost" onClick={() => setImportText(null)}>
                閉じる
              </button>
            </div>
          </div>
        )}
        <p className="muted small">コピーした JSON は、難易度シミュレーション（npm run sim:balance -- --game ファイル名）にも使えます。</p>
      </details>
    </section>
  );
}

function QuestionForm({ q, onChange }: { q: Question; onChange: (fn: (q: Question) => Question) => void }) {
  const setOption = (i: number, v: string) => onChange((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? v : o)) }));
  const removeOption = (i: number) => onChange((x) => dropDisallowed({ ...x, options: x.options.filter((_, j) => j !== i) }));
  const raiseOption = (i: number) =>
    onChange((x) => {
      const o = [...x.options];
      [o[i - 1], o[i]] = [o[i], o[i - 1]];
      return { ...x, options: o };
    });
  const toggleKind = (kind: CellKind, on: boolean) =>
    onChange((x) => {
      const cells = { ...x.cells };
      if (on) cells[kind] = suggestLabel(x, kind);
      else delete cells[kind];
      return { ...x, cells };
    });

  return (
    <div className="qform">
      <label className="field">
        <span className="label">質問文</span>
        <input id={`${q.id}-label`} value={q.label} maxLength={LIMITS.questionLabel} onChange={(e) => onChange((x) => ({ ...x, label: e.target.value }))} placeholder="例：好きな季節" />
      </label>

      <div className="field">
        <span className="label">選択肢（「となり」マスはこの並び順で判定）</span>
        <div className="opts-edit">
          {q.options.map((o, i) => (
            <div key={i} className="opt-edit">
              <input
                id={`${q.id}-opt-${i}`}
                value={o}
                maxLength={LIMITS.optionLabel}
                aria-label={`選択肢${i + 1}`}
                onChange={(e) => setOption(i, e.target.value)}
              />
              <button type="button" className="icon" aria-label="ひとつ上へ" disabled={i === 0} onClick={() => raiseOption(i)}>
                ↑
              </button>
              <button type="button" className="icon" aria-label="この選択肢を削除" disabled={q.options.length <= LIMITS.options.min} onClick={() => removeOption(i)}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn ghost small-btn"
          disabled={q.options.length >= LIMITS.options.max}
          onClick={() => onChange((x) => dropDisallowed({ ...x, options: [...x.options, ""] }))}
        >
          選択肢を追加
        </button>
        <label className="check">
          <input id={`${q.id}-skip`} type="checkbox" checked={!!q.allowSkip} onChange={(e) => onChange((x) => ({ ...x, allowSkip: e.target.checked || undefined }))} />
          「{SKIP}」を選べるようにする（選んだ人はこの質問のマスが開かない）
        </label>
      </div>

      <div className="field">
        <span className="label">この質問から作るマス</span>
        {CELL_KINDS.map((kind) => {
          const allowed = kindAllowed(kind, q.options.length);
          const on = q.cells[kind] !== undefined;
          return (
            <div key={kind} className={`kind${allowed ? "" : " disabled"}`}>
              <label className="check">
                <input id={`${q.id}-${kind}`} type="checkbox" checked={on && allowed} disabled={!allowed} onChange={(e) => toggleKind(kind, e.target.checked)} />
                <span>
                  <b>{KIND_NAMES[kind]}</b>
                  <small>
                    {kind === "same" && "二人の答えが同じなら開く"}
                    {kind === "opp" && (allowed ? "二人の答えが違えば開く" : "2択の質問でだけ使えます")}
                    {kind === "adj" && (allowed ? "答えが並び順でとなりなら開く" : "3択以上の質問でだけ使えます")}
                  </small>
                </span>
              </label>
              {on && allowed && (
                <input
                  id={`${q.id}-${kind}-label`}
                  className="cell-label"
                  value={q.cells[kind]}
                  maxLength={LIMITS.cellLabel}
                  aria-label={`「${KIND_NAMES[kind]}」マスの表示名`}
                  placeholder="カードに出る名前"
                  onChange={(e) => onChange((x) => ({ ...x, cells: { ...x.cells, [kind]: e.target.value } }))}
                />
              )}
              {kind === "adj" && on && allowed && (
                <label className="check sub">
                  <input id={`${q.id}-cyclic`} type="checkbox" checked={!!q.cyclic} onChange={(e) => onChange((x) => ({ ...x, cyclic: e.target.checked || undefined }))} />
                  最後と最初の選択肢もとなり扱い（12月と1月など）
                </label>
              )}
            </div>
          );
        })}
      </div>

      <label className="field">
        <span className="label">開けたあとに出す話題のヒント（任意）</span>
        <input id={`${q.id}-hint`} value={q.hint} maxLength={LIMITS.hint} onChange={(e) => onChange((x) => ({ ...x, hint: e.target.value }))} placeholder="例：その季節にやりたいことは？" />
      </label>
    </div>
  );
}
