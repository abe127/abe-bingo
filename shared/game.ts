/**
 * 共通点ビンゴのゲームロジック。
 * Webアプリと Cloud Functions の両方から読み込み、判定が必ず一致するようにする。
 *
 * 質問とマスはイベント（部屋）ごとに主催者が設定する（events/{id}.game）。
 * 設定がないイベントは DEFAULT_GAME を使う。
 * マスは質問ごとに「同じ」「違う」「となり」の3種類から選んで作る。
 */

/** 選択肢に加えられる「答えない」。どのマスの条件にも当てはまらない */
export const SKIP = "答えない";

export type CellKind = "same" | "opp" | "adj";
export const CELL_KINDS: CellKind[] = ["same", "opp", "adj"];

export type Question = {
  /** 半角英数字・_・- の識別子。カードとの対応に使う */
  id: string;
  label: string;
  options: string[];
  /** マスを開けたあとに出す話題のヒント */
  hint: string;
  /** 選択肢の最後に「答えない」を加える */
  allowSkip?: boolean;
  /** 「となり」マスで、最後と最初の選択肢もとなり扱いにする（12月と1月など） */
  cyclic?: boolean;
  /** この質問から作るマスと、カードに表示するラベル。キーがないマスは作らない */
  cells: Partial<Record<CellKind, string>>;
};

export type Game = { questions: Question[] };

export type Cell = {
  /** `${質問id}:${種類}` */
  id: string;
  q: string;
  kind: CellKind;
  label: string;
};

export type Answers = Record<string, string>;

/** 開けたマス1つぶんの記録。opened のキーはカード上の位置（0〜24） */
export type OpenedEntry = {
  by: string;
  at: number;
  detail: string;
};

export const FREE = "FREE";
export const SIZE = 5;
export const CENTER = 12;
export const PLAYABLE_CELLS = SIZE * SIZE - 1;

/** 設定の上限 */
export const LIMITS = {
  questions: 40,
  options: { min: 2, max: 12 },
  questionLabel: 30,
  optionLabel: 16,
  cellLabel: 12,
  hint: 40,
};

export const KIND_NAMES: Record<CellKind, string> = { same: "同じ", opp: "違う", adj: "となり" };

/** その種類のマスを作れる質問か（違う=2択のみ、となり=3択以上） */
export function kindAllowed(kind: CellKind, optionCount: number): boolean {
  if (kind === "opp") return optionCount === 2;
  if (kind === "adj") return optionCount >= 3;
  return true;
}

/* ---------- 既定の設定 ---------- */
export const DEFAULT_GAME: Game = {
  questions: [
    { id: "blood", label: "血液型", options: ["A", "B", "O", "AB"], allowSkip: true, hint: "血液型占い、信じる派？", cells: { same: "血液型が同じ" } },
    { id: "month", label: "誕生月", options: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"], cyclic: true, hint: "誕生日はどう過ごす？", cells: { same: "誕生月が同じ", adj: "誕生月がおとなり" } },
    { id: "region", label: "出身地方", options: ["北海道", "東北", "関東", "中部", "近畿", "中国・四国", "九州・沖縄", "海外"], hint: "地元のおすすめを聞いてみよう", cells: { same: "出身地方が同じ" } },
    { id: "sibling", label: "きょうだいの中では", options: ["一人っ子", "いちばん上", "真ん中", "末っ子"], hint: "きょうだいあるあるを話してみよう", cells: { same: "きょうだい順が同じ" } },
    { id: "pet", label: "犬派？猫派？", options: ["犬派", "猫派", "どっちも好き", "どっちでもない"], hint: "飼っている子・飼いたい子の話を", cells: { same: "犬猫派が同じ" } },
    { id: "chrono", label: "朝型？夜型？", options: ["朝型", "夜型"], hint: "一日のルーティンを聞いてみよう", cells: { same: "朝型夜型が同じ", opp: "朝型×夜型" } },
    { id: "snack", label: "きのこの山？たけのこの里？", options: ["きのこの山", "たけのこの里"], hint: "推しポイントを語り合おう", cells: { same: "きのこたけのこ同盟", opp: "きのこ×たけのこ" } },
    { id: "holiday", label: "休日は", options: ["インドア", "アウトドア"], hint: "最近の休日の過ごし方は？", cells: { same: "休日派が同じ", opp: "インドア×アウトドア" } },
    { id: "breakfast", label: "朝ごはんは", options: ["ご飯", "パン", "食べない", "その他"], hint: "定番の朝ごはんメニューは？", cells: { same: "朝ごはんが同じ" } },
    { id: "drink", label: "よく飲むのは", options: ["コーヒー", "紅茶", "お茶", "水・その他"], hint: "こだわりの一杯を聞いてみよう", cells: { same: "よく飲むものが同じ" } },
    { id: "season", label: "好きな季節", options: ["春", "夏", "秋", "冬"], cyclic: true, hint: "その季節にやりたいことは？", cells: { same: "好きな季節が同じ" } },
    { id: "noodle", label: "いちばん好きな麺", options: ["ラーメン", "うどん", "そば", "パスタ"], hint: "おすすめのお店を交換しよう", cells: { same: "好きな麺が同じ" } },
    { id: "taste", label: "甘党？辛党？", options: ["甘党", "辛党", "どっちも"], hint: "最近ハマっている食べ物は？", cells: { same: "甘党辛党が同じ" } },
    { id: "sea", label: "行くなら山？海？", options: ["山", "海"], hint: "行ってよかった場所を教えあおう", cells: { same: "山派海派が同じ", opp: "山派×海派" } },
    { id: "phone", label: "スマホは", options: ["iPhone", "Android", "その他"], hint: "よく使うアプリを見せあおう", cells: { same: "スマホが同じ" } },
    { id: "hand", label: "利き手", options: ["右", "左", "両方"], hint: "利き手で困ったことはある？", cells: { same: "利き手が同じ" } },
    { id: "trip", label: "旅行するなら", options: ["国内", "海外"], hint: "次に行きたい場所は？", cells: { same: "旅行派が同じ", opp: "国内派×海外派" } },
    { id: "karaoke", label: "カラオケでは", options: ["歌う派", "聴く派", "行かない"], hint: "十八番を聞いてみよう", cells: { same: "カラオケ派が同じ" } },
    { id: "power", label: "欲しい超能力", options: ["時間を止める", "瞬間移動", "心を読む", "空を飛ぶ"], hint: "その力で何をしたい？", cells: { same: "欲しい超能力が同じ" } },
    { id: "egg", label: "目玉焼きにかけるのは", options: ["しょうゆ", "ソース", "塩こしょう", "ケチャップ・その他"], hint: "他にもこだわりの調味料はある？", cells: { same: "目玉焼きの味が同じ" } },
  ],
};

/* ---------- 設定から派生するもの ---------- */

/** 参加者が選べる選択肢（「答えない」を含む） */
export function choicesOf(q: Question): string[] {
  return q.allowSkip ? [...q.options, SKIP] : q.options;
}

export function cellsOf(game: Game): Cell[] {
  const out: Cell[] = [];
  for (const q of game.questions)
    for (const kind of CELL_KINDS) {
      const label = q.cells[kind];
      if (label && kindAllowed(kind, q.options.length)) out.push({ id: `${q.id}:${kind}`, q: q.id, kind, label });
    }
  return out;
}

/** 毎回配列を作らないよう、設定ごとに索引をキャッシュする */
const indexCache = new WeakMap<Game, { questions: Record<string, Question>; cells: Record<string, Cell> }>();
export function indexOf(game: Game) {
  let idx = indexCache.get(game);
  if (!idx) {
    idx = {
      questions: Object.fromEntries(game.questions.map((q) => [q.id, q])),
      cells: Object.fromEntries(cellsOf(game).map((c) => [c.id, c])),
    };
    indexCache.set(game, idx);
  }
  return idx;
}

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

/* ---------- 設定の検証 ---------- */

const ID = /^[A-Za-z0-9_-]{1,24}$/;
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && [...s].length <= max ? s : null;
};

/**
 * 主催者が送ってきた設定を検証し、正規化した設定かエラー一覧を返す。
 * エラーは画面にそのまま出せる日本語。
 */
export function validateGame(input: unknown): { game: Game; errors: [] } | { game: null; errors: string[] } {
  const errors: string[] = [];
  const raw = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(raw) || raw.length === 0) return { game: null, errors: ["質問が1つもありません"] };
  if (raw.length > LIMITS.questions) errors.push(`質問は${LIMITS.questions}問までです`);

  const ids = new Set<string>();
  const questions: Question[] = [];
  raw.slice(0, LIMITS.questions).forEach((r: Record<string, unknown>, i: number) => {
    const n = `${i + 1}問目`;
    const id = typeof r?.id === "string" && ID.test(r.id) ? r.id : null;
    if (!id) errors.push(`${n}: 識別子が正しくありません`);
    else if (ids.has(id)) errors.push(`${n}: 識別子が重複しています`);
    else ids.add(id);

    const label = str(r?.label, LIMITS.questionLabel);
    if (!label) errors.push(`${n}: 質問文を${LIMITS.questionLabel}文字以内で入力してください`);
    const hint = typeof r?.hint === "string" ? r.hint.trim() : "";
    if ([...hint].length > LIMITS.hint) errors.push(`${n}: 話題のヒントは${LIMITS.hint}文字以内にしてください`);

    const opts = Array.isArray(r?.options) ? r.options.map((o) => str(o, LIMITS.optionLabel)) : [];
    if (opts.some((o) => !o)) errors.push(`${n}: 空の選択肢か、${LIMITS.optionLabel}文字を超える選択肢があります`);
    const options = opts.filter((o): o is string => !!o);
    if (options.length < LIMITS.options.min || options.length > LIMITS.options.max)
      errors.push(`${n}: 選択肢は${LIMITS.options.min}〜${LIMITS.options.max}個にしてください`);
    if (new Set(options).size !== options.length) errors.push(`${n}: 同じ選択肢が2つあります`);
    if (options.includes(SKIP)) errors.push(`${n}: 「${SKIP}」は選択肢に入れず、「答えない」を加える設定を使ってください`);

    const cells: Question["cells"] = {};
    const rc = (r?.cells ?? {}) as Record<string, unknown>;
    for (const kind of CELL_KINDS) {
      if (rc[kind] === undefined || rc[kind] === null) continue;
      const cl = str(rc[kind], LIMITS.cellLabel);
      if (!cl) errors.push(`${n}: 「${KIND_NAMES[kind]}」マスの表示名を${LIMITS.cellLabel}文字以内で入力してください`);
      else if (!kindAllowed(kind, options.length))
        errors.push(`${n}: 「${KIND_NAMES[kind]}」マスは${kind === "opp" ? "2択" : "3択以上"}の質問でだけ使えます`);
      else cells[kind] = cl;
    }
    if (Object.keys(cells).length === 0) errors.push(`${n}: マスを1種類以上選んでください`);

    questions.push({
      id: id ?? "",
      label: label ?? "",
      options,
      hint,
      ...(r?.allowSkip ? { allowSkip: true } : {}),
      ...(r?.cyclic ? { cyclic: true } : {}),
      cells,
    });
  });

  const game: Game = { questions };
  const count = cellsOf(game).length;
  if (count < PLAYABLE_CELLS) errors.push(`マスが${count}種類しかありません。カードを埋めるには${PLAYABLE_CELLS}種類以上必要です`);
  return errors.length ? { game: null, errors } : { game, errors: [] };
}

/* ---------- プレイ中の判定 ---------- */

/** 回答が全問そろっていて、選択肢の中の値かを確かめる */
export function validateAnswers(game: Game, input: unknown): Answers | null {
  if (!input || typeof input !== "object") return null;
  const src = input as Record<string, unknown>;
  const out: Answers = {};
  for (const q of game.questions) {
    const v = src[q.id];
    if (typeof v !== "string" || !choicesOf(q).includes(v)) return null;
    out[q.id] = v;
  }
  return out;
}

/** マスをランダムに24個選んで並べ、中央に FREE を置いたカードを作る */
export function makeCard(game: Game, random: () => number = Math.random): string[] {
  const ids = cellsOf(game).map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const card = ids.slice(0, PLAYABLE_CELLS);
  card.splice(CENTER, 0, FREE);
  return card;
}

/** 自分（a）と相手（b）がこのマスの条件に当てはまるか */
export function matches(game: Game, cell: Cell, a: Answers, b: Answers): boolean {
  const q = indexOf(game).questions[cell.q];
  const x = a[cell.q];
  const y = b[cell.q];
  if (!q || !x || !y || x === SKIP || y === SKIP) return false;
  switch (cell.kind) {
    case "same":
      return x === y;
    case "opp":
      return x !== y;
    case "adj": {
      const i = q.options.indexOf(x);
      const j = q.options.indexOf(y);
      if (i < 0 || j < 0) return false;
      const d = Math.abs(i - j);
      return d === 1 || (!!q.cyclic && d === q.options.length - 1);
    }
  }
}

/** 開けたときに表示する説明。自分（a）から見た書き方にする */
export function detailText(cell: Cell, a: Answers, b: Answers): string {
  if (cell.kind === "same") return `二人とも「${a[cell.q]}」`;
  return `あなた「${a[cell.q]}」・相手「${b[cell.q]}」`;
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
export function commonAnswers(game: Game, a: Answers, b: Answers): { label: string; value: string }[] {
  return game.questions
    .filter((q) => a[q.id] && a[q.id] === b[q.id] && a[q.id] !== SKIP)
    .map((q) => ({ label: q.label, value: a[q.id] }));
}

/** 相手に対して、まだ開いていないマスのうち開けられるもの */
export function candidateCells(
  game: Game,
  card: string[],
  opened: Record<string, unknown>,
  a: Answers,
  b: Answers,
): { index: number; cell: Cell }[] {
  const cells = indexOf(game).cells;
  return card
    .map((id, index) => ({ index, cell: cells[id] }))
    .filter(({ index, cell }) => cell && !opened[String(index)] && matches(game, cell, a, b));
}

/** イベントの設定（なければ既定の設定） */
export function gameOf(event: { game?: Game | null } | null | undefined): Game {
  return event?.game?.questions?.length ? event.game : DEFAULT_GAME;
}
