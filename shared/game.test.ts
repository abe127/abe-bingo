import { describe, expect, it } from "vitest";
import {
  CENTER,
  DEFAULT_GAME,
  FREE,
  PLAYABLE_CELLS,
  SKIP,
  candidateCells,
  cellsOf,
  commonAnswers,
  countLines,
  gameOf,
  indexOf,
  makeCard,
  matches,
  validateAnswers,
  validateGame,
  type Answers,
  type Game,
} from "./game";

const G = DEFAULT_GAME;
const cell = (id: string) => indexOf(G).cells[id];
const base: Answers = Object.fromEntries(G.questions.map((q) => [q.id, q.options[0]]));

describe("既定の設定", () => {
  it("検証を通り、カードに必要なマス数がある", () => {
    const r = validateGame(G);
    expect(r.errors).toEqual([]);
    expect(cellsOf(G).length).toBeGreaterThanOrEqual(PLAYABLE_CELLS);
  });
  it("設定のないイベントは既定の設定を使う", () => {
    expect(gameOf(null)).toBe(G);
    expect(gameOf({ game: { questions: [] } })).toBe(G);
  });
});

describe("makeCard", () => {
  it("25マスで中央が FREE、重複がない", () => {
    const card = makeCard(G);
    expect(card).toHaveLength(25);
    expect(card[CENTER]).toBe(FREE);
    expect(new Set(card).size).toBe(25);
  });
});

describe("matches", () => {
  it("same は一致で開き、「答えない」同士では開かない", () => {
    expect(matches(G, cell("blood:same"), { ...base, blood: "A" }, { ...base, blood: "A" })).toBe(true);
    expect(matches(G, cell("blood:same"), { ...base, blood: "A" }, { ...base, blood: "B" })).toBe(false);
    expect(matches(G, cell("blood:same"), { ...base, blood: SKIP }, { ...base, blood: SKIP })).toBe(false);
  });
  it("opp は違うときに開く", () => {
    expect(matches(G, cell("snack:opp"), { ...base, snack: "きのこの山" }, { ...base, snack: "たけのこの里" })).toBe(true);
    expect(matches(G, cell("snack:opp"), base, base)).toBe(false);
  });
  it("adj は隣の選択肢で開き、cyclic なら最後と最初もつながる", () => {
    expect(matches(G, cell("month:adj"), { ...base, month: "3月" }, { ...base, month: "4月" })).toBe(true);
    expect(matches(G, cell("month:adj"), { ...base, month: "12月" }, { ...base, month: "1月" })).toBe(true);
    expect(matches(G, cell("month:adj"), { ...base, month: "3月" }, { ...base, month: "5月" })).toBe(false);
  });
  it("cyclic でなければ最後と最初はとなりではない", () => {
    const g: Game = { questions: [{ id: "x", label: "x", options: ["a", "b", "c"], hint: "", cells: { adj: "x" } }] };
    const c = indexOf(g).cells["x:adj"];
    expect(matches(g, c, { x: "a" }, { x: "c" })).toBe(false);
    expect(matches(g, c, { x: "a" }, { x: "b" })).toBe(true);
  });
});

describe("countLines", () => {
  it("中央を含むナナメは4マスでそろう", () => expect(countLines([0, 6, 18, 24])).toBe(1));
  it("何も開いていなければ0", () => expect(countLines([])).toBe(0));
  it("十字でタテとヨコの2ライン", () => expect(countLines([2, 7, 17, 22, 10, 11, 13, 14])).toBe(2));
});

describe("validateAnswers", () => {
  it("全問そろった正しい回答を通す", () => expect(validateAnswers(G, base)).toEqual(base));
  it("「答えない」は allowSkip の質問でだけ選べる", () => {
    expect(validateAnswers(G, { ...base, blood: SKIP })).not.toBeNull();
    expect(validateAnswers(G, { ...base, region: SKIP })).toBeNull();
  });
  it("欠けた回答や選択肢にない値をはじく", () => {
    const { blood: _omit, ...missing } = base;
    expect(validateAnswers(G, missing)).toBeNull();
    expect(validateAnswers(G, { ...base, blood: "C" })).toBeNull();
  });
});

describe("validateGame", () => {
  const q = (id: string, over: object = {}) => ({ id, label: `質問${id}`, options: ["はい", "いいえ"], hint: "", cells: { same: "同じ" }, ...over });
  it("マスが24種類に足りないとエラー", () => {
    const r = validateGame({ questions: [q("a")] });
    expect(r.game).toBeNull();
    expect(r.errors.join()).toContain("24種類以上");
  });
  it("違うマスは2択、となりマスは3択以上でだけ使える", () => {
    const r = validateGame({ questions: [q("a", { options: ["1", "2", "3"], cells: { opp: "x" } }), q("b", { cells: { adj: "y" } })] });
    expect(r.errors.some((e) => e.includes("2択"))).toBe(true);
    expect(r.errors.some((e) => e.includes("3択以上"))).toBe(true);
  });
  it("識別子の重複や空の選択肢をはじく", () => {
    const r = validateGame({ questions: [q("a"), q("a", { options: ["", "x"] })] });
    expect(r.errors.some((e) => e.includes("重複"))).toBe(true);
    expect(r.errors.some((e) => e.includes("空の選択肢"))).toBe(true);
  });
  it("前後の空白を取り除いて保存する", () => {
    const questions = Array.from({ length: 12 }, (_, i) => q(`q${i}`, { label: ` 質問${i} `, cells: { same: "同じ", opp: "違う" } }));
    const r = validateGame({ questions });
    expect(r.errors).toEqual([]);
    expect(r.game!.questions[0].label).toBe("質問0");
  });
});

describe("candidateCells と commonAnswers", () => {
  it("開いているマスは候補に出ない", () => {
    const card = makeCard(G, () => 0.5);
    const all = candidateCells(G, card, {}, base, base);
    expect(all.length).toBeGreaterThan(0);
    const first = all[0].index;
    expect(candidateCells(G, card, { [first]: {} }, base, base).some((c) => c.index === first)).toBe(false);
  });
  it("同じ回答は共通点として出る", () => expect(commonAnswers(G, base, base)).toHaveLength(G.questions.length));
});
