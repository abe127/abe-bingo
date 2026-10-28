/**
 * 難易度シミュレーション（Firebase 不要）。
 * 架空の参加者に回答させ、ランダムに相手と話す（照合する）ことを繰り返して、
 * 「何人と話したらビンゴできるか」を調べる。質問やマスを変えたら回して確認する。
 *
 *   npx tsx scripts/simulate-balance.ts --players 30 --runs 300
 *   npx tsx scripts/simulate-balance.ts --game my-game.json   # 主催者画面で書き出した設定で試す
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  CENTER,
  DEFAULT_GAME,
  LINES,
  candidateCells,
  choicesOf,
  countLines,
  indexOf,
  makeCard,
  validateGame,
  type Answers,
  type Game,
  type Question,
} from "../shared/game";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "30" },
    runs: { type: "string", default: "300" },
    talks: { type: "string", default: "20" },
    game: { type: "string" },
  },
});
const N = Number(values.players);
const RUNS = Number(values.runs);
const MAX_TALKS = Number(values.talks);

function loadGame(): Game {
  if (!values.game) return DEFAULT_GAME;
  const result = validateGame(JSON.parse(readFileSync(values.game, "utf8")));
  if (!result.game) {
    console.error("設定に問題があります:\n- " + result.errors.join("\n- "));
    process.exit(1);
  }
  return result.game;
}
const game = loadGame();

/** 既定の質問の回答の偏り（実際の分布に近づけるための目安）。選択肢の数が合わない・指定がない質問は均等 */
const WEIGHTS: Record<string, number[]> = {
  blood: [38, 22, 30, 9, 1],
  region: [4, 7, 40, 14, 18, 6, 9, 2],
  sibling: [15, 40, 15, 30],
  pet: [40, 30, 20, 10],
  chrono: [45, 55],
  snack: [35, 65],
  holiday: [60, 40],
  breakfast: [40, 35, 20, 5],
  drink: [55, 10, 25, 10],
  taste: [40, 25, 35],
  phone: [65, 33, 2],
  hand: [88, 10, 2],
  trip: [55, 45],
  karaoke: [40, 40, 20],
  egg: [45, 15, 30, 10],
};

const weightsFor = (q: Question) => (WEIGHTS[q.id]?.length === choicesOf(q).length ? WEIGHTS[q.id] : undefined);

function pickWeighted(options: string[], weights?: number[]): string {
  const w = weights ?? options.map(() => 1);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) if ((r -= w[i]) < 0) return options[i];
  return options[options.length - 1];
}

type Sim = { answers: Answers; card: string[]; opened: Record<string, string>; met: Set<number>; bingoAt: number | null };

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const bingoTalks: number[] = [];
let noBingo = 0;
let emptyTalks = 0;
let totalTalks = 0;
const openedByCell: Record<string, number> = {};
const shownByCell: Record<string, number> = {};

for (let run = 0; run < RUNS; run++) {
  const people: Sim[] = Array.from({ length: N }, () => ({
    answers: Object.fromEntries(game.questions.map((q) => [q.id, pickWeighted(choicesOf(q), weightsFor(q))])),
    card: makeCard(game),
    opened: {},
    met: new Set<number>(),
    bingoAt: null,
  }));
  people.forEach((p) => p.card.forEach((id) => (shownByCell[id] = (shownByCell[id] ?? 0) + 1)));

  // 1回の「ラウンド」で全員がまだ話していない誰かと話す
  for (let talk = 1; talk <= MAX_TALKS; talk++) {
    const order = shuffle(people.map((_, i) => i));
    for (const i of order) {
      const me = people[i];
      const others = people.map((_, j) => j).filter((j) => j !== i && !me.met.has(j));
      if (!others.length) continue;
      const j = others[Math.floor(Math.random() * others.length)];
      me.met.add(j);
      totalTalks++;
      const cands = candidateCells(game, me.card, me.opened, me.answers, people[j].answers);
      if (!cands.length) {
        emptyTalks++;
        continue;
      }
      // 人はビンゴに近づくマスを選びがち：そのマスを含むラインのうち、いちばん埋まっているものを優先
      const openNow = new Set([...Object.keys(me.opened).map(Number), CENTER]);
      const progress = (idx: number) =>
        Math.max(...LINES.filter((l) => l.includes(idx)).map((l) => l.filter((x) => openNow.has(x)).length));
      const best = cands
        .map((c) => ({ c, score: progress(c.index) + Math.random() * 0.5 }))
        .sort((a, b) => b.score - a.score)[0].c;
      me.opened[String(best.index)] = String(j);
      openedByCell[best.cell.id] = (openedByCell[best.cell.id] ?? 0) + 1;
      if (me.bingoAt === null && countLines(Object.keys(me.opened).map(Number)) > 0) me.bingoAt = talk;
    }
  }
  for (const p of people) p.bingoAt === null ? noBingo++ : bingoTalks.push(p.bingoAt);
}

const pct = (q: number) => {
  const s = [...bingoTalks].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const total = N * RUNS;
console.log(`参加者 ${N}人 × ${RUNS}回、1人あたり最大 ${MAX_TALKS}人と話す想定\n`);
console.log(`ビンゴできた人の割合: ${(((total - noBingo) / total) * 100).toFixed(1)}%`);
console.log(`初ビンゴまでに話した人数: 最速 ${pct(0)}人 / 上位25% ${pct(0.25)}人 / 中央値 ${pct(0.5)}人 / 下位25% ${pct(0.75)}人`);
console.log(`開けられるマスがなかった会話: ${((emptyTalks / totalTalks) * 100).toFixed(1)}%\n`);
for (const k of [5, 8, 10, 12, 15]) {
  const share = bingoTalks.filter((t) => t <= k).length / total;
  console.log(`  ${String(k).padStart(2)}人と話した時点でビンゴ済み: ${(share * 100).toFixed(1)}%`);
}
console.log("\nマスごとの開きやすさ（カードに出た回数あたりの開いた回数。低いほど難しい）");
Object.keys(shownByCell)
  .filter((id) => indexOf(game).cells[id])
  .map((id) => ({ id, rate: (openedByCell[id] ?? 0) / shownByCell[id] }))
  .sort((a, b) => a.rate - b.rate)
  .forEach(({ id, rate }) => console.log(`  ${indexOf(game).cells[id].label.padEnd(12, "　")} ${(rate * 100).toFixed(0)}%`));
