/**
 * 共通点ビンゴのゲームロジック。
 * Webアプリと Cloud Functions の両方から読み込み、判定が必ず一致するようにする。
 * 質問やマスを変えるときは、このファイルだけを直せばよい。
 */

export type Question = {
  id: string;
  label: string;
  options: string[];
  /** マスを開けたあとに出す話題のヒント */
  hint: string;
};

export type CellKind = "same" | "opp" | "adj";

export type Cell = {
  id: string;
  /** 判定に使う質問の id */
  q: string;
  kind: CellKind;
  /** カードに表示する短いラベル（全角9文字程度まで） */
  label: string;
};

export type Answers = Record<string, string>;

/** 開けたマス1つぶんの記録。opened のキーはカード上の位置（0〜24） */
export type OpenedEntry = {
  by: string;
  at: number;
  detail: string;
};

/** 「わからない」など、一致してもマスを開けない回答 */
export const NEUTRAL_ANSWERS = new Set(["わからない"]);

export const QUESTIONS: Question[] = [
  { id: "blood", label: "血液型", options: ["A", "B", "O", "AB", "わからない"], hint: "血液型占い、信じる派？" },
  { id: "month", label: "誕生月", options: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"], hint: "誕生日はどう過ごす？" },
  { id: "region", label: "出身地方", options: ["北海道", "東北", "関東", "中部", "近畿", "中国・四国", "九州・沖縄", "海外"], hint: "地元のおすすめを聞いてみよう" },
  { id: "sibling", label: "きょうだいの中では", options: ["一人っ子", "いちばん上", "真ん中", "末っ子"], hint: "きょうだいあるあるを話してみよう" },
  { id: "pet", label: "犬派？猫派？", options: ["犬派", "猫派", "どっちも好き", "どっちでもない"], hint: "飼っている子・飼いたい子の話を" },
  { id: "chrono", label: "朝型？夜型？", options: ["朝型", "夜型"], hint: "一日のルーティンを聞いてみよう" },
  { id: "snack", label: "きのこの山？たけのこの里？", options: ["きのこの山", "たけのこの里"], hint: "推しポイントを語り合おう" },
  { id: "holiday", label: "休日は", options: ["インドア", "アウトドア"], hint: "最近の休日の過ごし方は？" },
  { id: "breakfast", label: "朝ごはんは", options: ["ご飯", "パン", "食べない", "その他"], hint: "定番の朝ごはんメニューは？" },
  { id: "drink", label: "よく飲むのは", options: ["コーヒー", "紅茶", "お茶", "水・その他"], hint: "こだわりの一杯を聞いてみよう" },
  { id: "season", label: "好きな季節", options: ["春", "夏", "秋", "冬"], hint: "その季節にやりたいことは？" },
  { id: "noodle", label: "いちばん好きな麺", options: ["ラーメン", "うどん", "そば", "パスタ"], hint: "おすすめのお店を交換しよう" },
  { id: "taste", label: "甘党？辛党？", options: ["甘党", "辛党", "どっちも"], hint: "最近ハマっている食べ物は？" },
  { id: "sea", label: "行くなら山？海？", options: ["山", "海"], hint: "行ってよかった場所を教えあおう" },
  { id: "phone", label: "スマホは", options: ["iPhone", "Android", "その他"], hint: "よく使うアプリを見せあおう" },
  { id: "hand", label: "利き手", options: ["右", "左", "両方"], hint: "利き手で困ったことはある？" },
  { id: "trip", label: "旅行するなら", options: ["国内", "海外"], hint: "次に行きたい場所は？" },
  { id: "karaoke", label: "カラオケでは", options: ["歌う派", "聴く派", "行かない"], hint: "十八番を聞いてみよう" },
  { id: "power", label: "欲しい超能力", options: ["時間を止める", "瞬間移動", "心を読む", "空を飛ぶ"], hint: "その力で何をしたい？" },
  { id: "egg", label: "目玉焼きにかけるのは", options: ["しょうゆ", "ソース", "塩こしょう", "ケチャップ・その他"], hint: "他にもこだわりの調味料はある？" },
];

export const CELLS: Cell[] = [
  { id: "blood", q: "blood", kind: "same", label: "血液型が同じ" },
  { id: "month", q: "month", kind: "same", label: "誕生月が同じ" },
  { id: "monthAdj", q: "month", kind: "adj", label: "誕生月がおとなり" },
  { id: "region", q: "region", kind: "same", label: "出身地方が同じ" },
  { id: "sibling", q: "sibling", kind: "same", label: "きょうだい順が同じ" },
  { id: "pet", q: "pet", kind: "same", label: "犬猫派が同じ" },
  { id: "chrono", q: "chrono", kind: "same", label: "朝型夜型が同じ" },
  { id: "chronoOpp", q: "chrono", kind: "opp", label: "朝型×夜型" },
  { id: "snack", q: "snack", kind: "same", label: "きのこたけのこ同盟" },
  { id: "snackOpp", q: "snack", kind: "opp", label: "きのこ×たけのこ" },
  { id: "holiday", q: "holiday", kind: "same", label: "休日派が同じ" },
  { id: "holidayOpp", q: "holiday", kind: "opp", label: "インドア×アウトドア" },
  { id: "breakfast", q: "breakfast", kind: "same", label: "朝ごはんが同じ" },
  { id: "drink", q: "drink", kind: "same", label: "よく飲むものが同じ" },
  { id: "season", q: "season", kind: "same", label: "好きな季節が同じ" },
  { id: "noodle", q: "noodle", kind: "same", label: "好きな麺が同じ" },
  { id: "taste", q: "taste", kind: "same", label: "甘党辛党が同じ" },
  { id: "sea", q: "sea", kind: "same", label: "山派海派が同じ" },
  { id: "seaOpp", q: "sea", kind: "opp", label: "山派×海派" },
  { id: "phone", q: "phone", kind: "same", label: "スマホが同じ" },
  { id: "hand", q: "hand", kind: "same", label: "利き手が同じ" },
  { id: "trip", q: "trip", kind: "same", label: "旅行派が同じ" },
  { id: "tripOpp", q: "trip", kind: "opp", label: "国内派×海外派" },
  { id: "karaoke", q: "karaoke", kind: "same", label: "カラオケ派が同じ" },
  { id: "power", q: "power", kind: "same", label: "欲しい超能力が同じ" },
  { id: "egg", q: "egg", kind: "same", label: "目玉焼きの味が同じ" },
];

export const QUESTIONS_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const CELLS_BY_ID: Record<string, Cell> = Object.fromEntries(CELLS.map((c) => [c.id, c]));

export const FREE = "FREE";
export const SIZE = 5;
export const CENTER = 12;
export const PLAYABLE_CELLS = SIZE * SIZE - 1;

/** タテ5・ヨコ5・ナナメ2の計12ライン */
export const LINES: number[][] = (() => {
  const lines: number[][] = [];
  for (let i = 0; i < SIZE; i++) {
    lines.push([0, 1, 2, 3, 4].map((j) => i * SIZE + j));
    lines.push([0, 1, 2, 3, 4].map((j) => j * SIZE + i));
  }
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();

/** 回答が全問そろっていて、選択肢の中の値かを確かめる */
export function validateAnswers(input: unknown): Answers | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: Answers = {};
  for (const q of QUESTIONS) {
    const v = src[q.id];
    if (typeof v !== "string" || !q.options.includes(v)) return null;
    out[q.id] = v;
  }
  return out;
}

/** 24種類をランダムに選んで並べ、中央に FREE を置いたカードを作る */
export function makeCard(random: () => number = Math.random): string[] {
  const ids = CELLS.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const card = ids.slice(0, PLAYABLE_CELLS);
  card.splice(CENTER, 0, FREE);
  return card;
}

/** 自分（a）と相手（b）がこのマスの条件に当てはまるか */
export function matches(cell: Cell, a: Answers, b: Answers): boolean {
  const x = a[cell.q];
  const y = b[cell.q];
  if (!x || !y) return false;
  switch (cell.kind) {
    case "same":
      return x === y && !NEUTRAL_ANSWERS.has(x);
    case "opp":
      return x !== y && !NEUTRAL_ANSWERS.has(x) && !NEUTRAL_ANSWERS.has(y);
    case "adj": {
      const d = Math.abs(parseInt(x, 10) - parseInt(y, 10));
      return d === 1 || d === 11;
    }
  }
}

/** 開けたときに表示する説明。自分（a）から見た書き方にする */
export function detailText(cell: Cell, a: Answers, b: Answers): string {
  const x = a[cell.q];
  const y = b[cell.q];
  if (cell.kind === "same") return `二人とも「${x}」`;
  return `あなた「${x}」・相手「${y}」`;
}

/** 開いている位置の集合から、そろったライン数を数える（中央は常に開いている扱い） */
export function countLines(openIndices: Iterable<number>): number {
  const open = new Set(openIndices);
  open.add(CENTER);
  return LINES.filter((line) => line.every((i) => open.has(i))).length;
}

/** ラインがそろっているマスの位置 */
export function lineCells(openIndices: Iterable<number>): Set<number> {
  const open = new Set(openIndices);
  open.add(CENTER);
  const out = new Set<number>();
  for (const line of LINES) if (line.every((i) => open.has(i))) line.forEach((i) => out.add(i));
  return out;
}

/** 二人の回答が一致している質問（話題として表示する） */
export function commonAnswers(a: Answers, b: Answers): { label: string; value: string }[] {
  return QUESTIONS.filter((q) => a[q.id] && a[q.id] === b[q.id] && !NEUTRAL_ANSWERS.has(a[q.id])).map((q) => ({
    label: q.label,
    value: a[q.id],
  }));
}

/** 相手に対して、まだ開いていないマスのうち開けられるもの */
export function candidateCells(
  card: string[],
  opened: Record<string, unknown>,
  a: Answers,
  b: Answers,
): { index: number; cell: Cell }[] {
  return card
    .map((id, index) => ({ index, cell: CELLS_BY_ID[id] }))
    .filter(({ index, cell }) => cell && !opened[String(index)] && matches(cell, a, b));
}
