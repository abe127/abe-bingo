import { describe, expect, it } from "vitest";
import {
  CELLS,
  CELLS_BY_ID,
  CENTER,
  FREE,
  QUESTIONS,
  candidateCells,
  commonAnswers,
  countLines,
  makeCard,
  matches,
  validateAnswers,
  type Answers,
} from "./game";

const base: Answers = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options[0]]));

describe("マスと質問の定義", () => {
  it("すべてのマスが存在する質問を参照している", () => {
    const ids = new Set(QUESTIONS.map((q) => q.id));
    for (const c of CELLS) expect(ids.has(c.q)).toBe(true);
  });
  it("カードに必要な24種類以上ある", () => {
    expect(CELLS.length).toBeGreaterThanOrEqual(24);
  });
  it("opp マスは2択の質問にだけ使う", () => {
    for (const c of CELLS.filter((c) => c.kind === "opp")) {
      expect(QUESTIONS.find((q) => q.id === c.q)!.options.length).toBe(2);
    }
  });
});

describe("makeCard", () => {
  it("25マスで中央が FREE、重複がない", () => {
    const card = makeCard();
    expect(card).toHaveLength(25);
    expect(card[CENTER]).toBe(FREE);
    expect(new Set(card).size).toBe(25);
  });
});

describe("matches", () => {
  it("same は一致で開き、「わからない」同士では開かない", () => {
    expect(matches(CELLS_BY_ID.blood, { ...base, blood: "A" }, { ...base, blood: "A" })).toBe(true);
    expect(matches(CELLS_BY_ID.blood, { ...base, blood: "A" }, { ...base, blood: "B" })).toBe(false);
    expect(matches(CELLS_BY_ID.blood, { ...base, blood: "わからない" }, { ...base, blood: "わからない" })).toBe(false);
  });
  it("opp は違うときに開く", () => {
    expect(matches(CELLS_BY_ID.snackOpp, { ...base, snack: "きのこの山" }, { ...base, snack: "たけのこの里" })).toBe(true);
    expect(matches(CELLS_BY_ID.snackOpp, base, base)).toBe(false);
  });
  it("adj は隣の月で開き、12月と1月もつながる", () => {
    expect(matches(CELLS_BY_ID.monthAdj, { ...base, month: "3月" }, { ...base, month: "4月" })).toBe(true);
    expect(matches(CELLS_BY_ID.monthAdj, { ...base, month: "12月" }, { ...base, month: "1月" })).toBe(true);
    expect(matches(CELLS_BY_ID.monthAdj, { ...base, month: "3月" }, { ...base, month: "5月" })).toBe(false);
  });
});

describe("countLines", () => {
  it("中央を含むナナメは4マスでそろう", () => {
    expect(countLines([0, 6, 18, 24])).toBe(1);
  });
  it("何も開いていなければ0", () => {
    expect(countLines([])).toBe(0);
  });
  it("十字でタテとヨコの2ライン", () => {
    expect(countLines([2, 7, 17, 22, 10, 11, 13, 14])).toBe(2);
  });
});

describe("validateAnswers", () => {
  it("全問そろった正しい回答を通す", () => {
    expect(validateAnswers(base)).toEqual(base);
  });
  it("欠けた回答や選択肢にない値をはじく", () => {
    const { blood: _omit, ...missing } = base;
    expect(validateAnswers(missing)).toBeNull();
    expect(validateAnswers({ ...base, blood: "C" })).toBeNull();
  });
});

describe("candidateCells と commonAnswers", () => {
  it("開いているマスは候補に出ない", () => {
    const card = makeCard(() => 0.5);
    const all = candidateCells(card, {}, base, base);
    expect(all.length).toBeGreaterThan(0);
    const first = all[0].index;
    expect(candidateCells(card, { [first]: {} }, base, base).some((c) => c.index === first)).toBe(false);
  });
  it("同じ回答は共通点として出る", () => {
    expect(commonAnswers(base, base)).toHaveLength(QUESTIONS.length);
  });
});
