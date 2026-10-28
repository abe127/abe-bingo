/**
 * 共通点ビンゴの Cloud Functions。
 * 参加者のマスの書き込みはすべてここを通し、ブラウザから直接は書き込ませない。
 * 質問とマスの設定はイベントごと（events/{id}.game）。最初の参加者が登録したあとは変更できない。
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type DocumentSnapshot, type Timestamp } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  CENTER,
  candidateCells,
  commonAnswers,
  countLines,
  detailText,
  gameOf,
  indexOf,
  makeCard,
  matches,
  validateAnswers,
  validateGame,
  type Answers,
  type Game,
  type OpenedEntry,
} from "../../shared/game";

initializeApp();
const db = getFirestore();

setGlobalOptions({ region: "asia-northeast1", maxInstances: 10 });

const EVENT_ID = /^[a-z0-9-]{1,40}$/;
const CODE = /^\d{4}$/;
const NICKNAME_MAX = 20;

type EventDoc = { name: string; status: "playing" | "finished"; game?: Game };
type PlayerDoc = {
  nickname: string;
  card: string[];
  opened: Record<string, OpenedEntry>;
  openedCount: number;
  lines: number;
  bingoAt: Timestamp | null;
};
type PrivateDoc = { answers: Answers; code: string };

const paths = (eventId: string) => ({
  event: db.doc(`events/${eventId}`),
  secret: db.doc(`events/${eventId}/secret/config`),
  players: db.collection(`events/${eventId}/players`),
  player: (uid: string) => db.doc(`events/${eventId}/players/${uid}`),
  priv: (uid: string) => db.doc(`events/${eventId}/private/${uid}`),
  code: (code: string) => db.doc(`events/${eventId}/codes/${code}`),
});

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function sameSecret(input: string, expectedHash: string | undefined): boolean {
  if (!expectedHash) return false;
  const a = Buffer.from(sha256(input.trim()));
  const b = Buffer.from(expectedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireUid(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "ページを開き直してください（サインインできていません）");
  return uid;
}

function readEventId(data: Record<string, unknown>): string {
  const id = data.eventId;
  if (typeof id !== "string" || !EVENT_ID.test(id)) throw new HttpsError("invalid-argument", "イベントのURLが正しくありません");
  return id;
}

function readCode(data: Record<string, unknown>): string {
  const code = typeof data.code === "string" ? data.code.trim() : "";
  if (!CODE.test(code)) throw new HttpsError("invalid-argument", "4けたの数字を入力してください");
  return code;
}

function eventFrom(snap: DocumentSnapshot): EventDoc {
  if (!snap.exists) throw new HttpsError("not-found", "このイベントは見つかりません");
  return snap.data() as EventDoc;
}

function requirePlaying(ev: EventDoc) {
  if (ev.status !== "playing") throw new HttpsError("failed-precondition", "このイベントは終了しています");
}

/** 参加登録。カードとコードを発行する。同じ人が2回呼んでも同じカードのまま */
export const joinEvent = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const eventId = readEventId(data);
  const nickname = typeof data.nickname === "string" ? data.nickname.trim() : "";
  if (!nickname || [...nickname].length > NICKNAME_MAX)
    throw new HttpsError("invalid-argument", `ニックネームは1〜${NICKNAME_MAX}文字で入力してください`);
  const passphrase = typeof data.passphrase === "string" ? data.passphrase : "";
  const p = paths(eventId);

  const secret = (await p.secret.get()).data() as { passphraseHash?: string } | undefined;
  if (!sameSecret(passphrase, secret?.passphraseHash)) {
    eventFrom(await p.event.get()); // イベント自体がなければ「見つかりません」を優先
    throw new HttpsError("permission-denied", "合言葉が違います");
  }

  return db.runTransaction(async (tx) => {
    // 設定の保存と同時に登録されても食い違わないよう、イベントもトランザクション内で読む
    const ev = eventFrom(await tx.get(p.event));
    requirePlaying(ev);
    const game = gameOf(ev);
    const answers = validateAnswers(game, data.answers);
    if (!answers) throw new HttpsError("invalid-argument", "すべての質問に答えてください（質問が更新された場合はページを開き直してください）");

    const existing = await tx.get(p.priv(uid));
    if (existing.exists) return { code: (existing.data() as PrivateDoc).code, alreadyJoined: true };

    let code: string | null = null;
    for (let i = 0; i < 30 && !code; i++) {
      const candidate = String(randomInt(1000, 10000));
      if (!(await tx.get(p.code(candidate))).exists) code = candidate;
    }
    if (!code) throw new HttpsError("resource-exhausted", "コードを発行できませんでした。もう一度試してください");

    tx.set(p.code(code), { uid });
    tx.set(p.priv(uid), { answers, code } satisfies PrivateDoc);
    tx.set(p.player(uid), {
      nickname,
      card: makeCard(game),
      opened: {},
      openedCount: 0,
      lines: 0,
      bingoAt: null,
      joinedAt: FieldValue.serverTimestamp(),
    });
    return { code, alreadyJoined: false };
  });
});

/** 相手のコードを照合し、開けられるマスの候補と共通点を返す（まだ書き込まない） */
export const previewPartner = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const eventId = readEventId(data);
  const code = readCode(data);
  const p = paths(eventId);

  const [evSnap, codeSnap, meSnap, myPrivSnap] = await Promise.all([
    p.event.get(),
    p.code(code).get(),
    p.player(uid).get(),
    p.priv(uid).get(),
  ]);
  const game = gameOf(eventFrom(evSnap));
  if (!meSnap.exists || !myPrivSnap.exists) throw new HttpsError("failed-precondition", "先に参加登録をしてください");
  if (!codeSnap.exists) throw new HttpsError("not-found", "そのコードの参加者が見つかりません。数字を確かめてください");
  const partnerUid = (codeSnap.data() as { uid: string }).uid;
  if (partnerUid === uid) throw new HttpsError("invalid-argument", "それはあなたのコードです");

  const [partnerSnap, partnerPrivSnap] = await Promise.all([p.player(partnerUid).get(), p.priv(partnerUid).get()]);
  const me = meSnap.data() as PlayerDoc;
  const mine = (myPrivSnap.data() as PrivateDoc).answers;
  const theirs = (partnerPrivSnap.data() as PrivateDoc).answers;
  const partner = { uid: partnerUid, nickname: (partnerSnap.data() as PlayerDoc).nickname };

  const used = Object.entries(me.opened ?? {}).find(([, o]) => o.by === partnerUid);
  if (used) {
    const cell = indexOf(game).cells[me.card[Number(used[0])]];
    return { partner, alreadyUsed: { index: Number(used[0]), label: cell?.label ?? "" }, candidates: [], commons: [] };
  }

  const candidates = candidateCells(game, me.card, me.opened ?? {}, mine, theirs).map(({ index, cell }) => ({
    index,
    label: cell.label,
    detail: detailText(cell, mine, theirs),
  }));
  return { partner, alreadyUsed: null, candidates, commons: commonAnswers(game, mine, theirs).slice(0, 6) };
});

/** マスを開ける。条件と「1人1マス」をサーバー側で確かめてから書き込む */
export const openCell = onCall(async (req) => {
  const uid = requireUid(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const eventId = readEventId(data);
  const code = readCode(data);
  const index = data.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 24 || index === CENTER)
    throw new HttpsError("invalid-argument", "マスの指定が正しくありません");
  const p = paths(eventId);

  return db.runTransaction(async (tx) => {
    const [evSnap, codeSnap, meSnap, myPrivSnap] = await Promise.all([
      tx.get(p.event),
      tx.get(p.code(code)),
      tx.get(p.player(uid)),
      tx.get(p.priv(uid)),
    ]);
    const ev = eventFrom(evSnap);
    requirePlaying(ev);
    const game = gameOf(ev);
    if (!meSnap.exists || !myPrivSnap.exists) throw new HttpsError("failed-precondition", "先に参加登録をしてください");
    if (!codeSnap.exists) throw new HttpsError("not-found", "そのコードの参加者が見つかりません");
    const partnerUid = (codeSnap.data() as { uid: string }).uid;
    if (partnerUid === uid) throw new HttpsError("invalid-argument", "それはあなたのコードです");
    const partnerPrivSnap = await tx.get(p.priv(partnerUid));

    const me = meSnap.data() as PlayerDoc;
    const opened = me.opened ?? {};
    if (opened[String(index)]) throw new HttpsError("already-exists", "そのマスはもう開いています");
    if (Object.values(opened).some((o) => o.by === partnerUid))
      throw new HttpsError("already-exists", "この人とはもう1マス開けています");

    const cell = indexOf(game).cells[me.card[index]];
    const mine = (myPrivSnap.data() as PrivateDoc).answers;
    const theirs = (partnerPrivSnap.data() as PrivateDoc).answers;
    if (!cell || !matches(game, cell, mine, theirs))
      throw new HttpsError("failed-precondition", "このマスの条件には当てはまりません");

    const entry: OpenedEntry = { by: partnerUid, at: Date.now(), detail: detailText(cell, mine, theirs) };
    const before = countLines(Object.keys(opened).map(Number));
    const after = countLines([...Object.keys(opened).map(Number), index]);
    const update: Record<string, unknown> = {
      [`opened.${index}`]: entry,
      openedCount: Object.keys(opened).length + 1,
      lines: after,
    };
    if (after > 0 && !me.bingoAt) update.bingoAt = FieldValue.serverTimestamp();
    tx.update(p.player(uid), update);

    return {
      index,
      label: cell.label,
      detail: entry.detail,
      hint: indexOf(game).questions[cell.q]?.hint ?? "",
      lines: after,
      newBingo: after > before,
    };
  });
});

/** 主催者の操作。主催者キーを知っている人だけが使える */
export const adminAction = onCall({ timeoutSeconds: 120 }, async (req) => {
  requireUid(req);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const eventId = readEventId(data);
  const adminKey = typeof data.adminKey === "string" ? data.adminKey : "";
  const p = paths(eventId);
  eventFrom(await p.event.get());
  const secret = (await p.secret.get()).data() as { adminKeyHash?: string } | undefined;
  if (!sameSecret(adminKey, secret?.adminKeyHash)) throw new HttpsError("permission-denied", "主催者キーが違います");

  switch (data.action) {
    case "check":
      return { ok: true };
    case "start":
      await p.event.update({ status: "playing" });
      return { ok: true };
    case "finish":
      await p.event.update({ status: "finished" });
      return { ok: true };
    case "reset":
      for (const name of ["players", "private", "codes"]) await db.recursiveDelete(db.collection(`events/${eventId}/${name}`));
      return { ok: true };
    case "saveGame": {
      const result = validateGame(data.game);
      if (!result.game) throw new HttpsError("invalid-argument", result.errors.join("\n"));
      const game = result.game;
      await db.runTransaction(async (tx) => {
        const anyone = await tx.get(p.players.limit(1));
        if (!anyone.empty)
          throw new HttpsError("failed-precondition", "参加者がいるため質問を変更できません。全員のデータを削除してから編集してください");
        tx.update(p.event, { game, gameUpdatedAt: FieldValue.serverTimestamp() });
      });
      return { ok: true };
    }
    default:
      throw new HttpsError("invalid-argument", "不明な操作です");
  }
});
