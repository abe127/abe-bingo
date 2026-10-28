/**
 * エミュレーター上で架空の参加者（ボット）を動かす通し試験。
 * 参加登録 → 照合 → マスを開ける、を同時に行い、エラーや不正操作の拒否を確かめる。
 *
 * 先に `npm run emulators` と `npm run seed:emu` を実行しておくこと。
 *   npx tsx scripts/simulate-emulator.ts --players 30 --rounds 8
 */
import { parseArgs } from "node:util";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { gameOf, type Game } from "../shared/game";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "30" },
    rounds: { type: "string", default: "8" },
    event: { type: "string", default: "demo" },
    passphrase: { type: "string", default: "もみじ" },
  },
});
const N = Number(values.players);
const ROUNDS = Number(values.rounds);
const eventId = values.event!;

/** イベントに設定された質問を読む（主催者画面で編集したものがあればそれ） */
async function loadGame(): Promise<Game> {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-kyotsuten-bingo", appId: "demo" }, "probe");
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  await signInAnonymously(auth);
  const snap = await getDoc(doc(fs, "events", eventId));
  if (!snap.exists()) {
    console.error(`イベント ${eventId} がありません。先に npm run seed:emu を実行してください`);
    process.exit(1);
  }
  return gameOf(snap.data() as { game?: Game });
}
const game = await loadGame();
const randomChoice = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

type Preview = { partner: { uid: string }; alreadyUsed: unknown; candidates: { index: number }[] };

async function makeBot(i: number) {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-kyotsuten-bingo", appId: "demo" }, `bot-${i}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const fns = getFunctions(app, "asia-northeast1");
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  await signInAnonymously(auth);
  const call = <T>(name: string, data: unknown) => httpsCallable<unknown, T>(fns, name)(data).then((r) => r.data);
  const answers = Object.fromEntries(game.questions.map((q) => [q.id, randomChoice(q.options)]));
  const { code } = await call<{ code: string }>("joinEvent", { eventId, nickname: `ボット${i + 1}`, passphrase: values.passphrase, answers });
  return { i, code, call, met: new Set<string>(), opened: 0 };
}

const started = Date.now();
const errors: string[] = [];
console.log(`ボット ${N}体で参加登録中…`);
const bots = await Promise.all(Array.from({ length: N }, (_, i) => makeBot(i)));
console.log(`  完了（${((Date.now() - started) / 1000).toFixed(1)}秒）。コードの重複: ${N - new Set(bots.map((b) => b.code)).size}件`);

// 不正操作が拒否されるか
const [a, b] = bots;
const expectReject = async (label: string, p: Promise<unknown>, code: string) => {
  try {
    await p;
    errors.push(`${label}: 拒否されるべき操作が通った`);
  } catch (e) {
    const got = (e as { code?: string }).code;
    if (got !== `functions/${code}`) errors.push(`${label}: 想定 ${code} / 実際 ${got}`);
    else console.log(`  OK 拒否: ${label}`);
  }
};
await expectReject("自分のコードで照合", a.call("previewPartner", { eventId, code: a.code }), "invalid-argument");
await expectReject("存在しないコード", a.call("openCell", { eventId, code: "0000", index: 0 }), "not-found");
await expectReject("中央マスを開ける", a.call("openCell", { eventId, code: b.code, index: 12 }), "invalid-argument");
const anyAnswers = Object.fromEntries(game.questions.map((q) => [q.id, q.options[0]]));
await expectReject("合言葉違いで参加", a.call("joinEvent", { eventId, nickname: "x", passphrase: "ちがう", answers: anyAnswers }), "permission-denied");
await expectReject("回答が欠けた参加", a.call("joinEvent", { eventId, nickname: "x", passphrase: values.passphrase, answers: {} }), "invalid-argument");

for (let round = 1; round <= ROUNDS; round++) {
  const t = Date.now();
  await Promise.all(
    bots.map(async (me) => {
      const others = bots.filter((o) => o !== me && !me.met.has(o.code));
      if (!others.length) return;
      const partner = others[Math.floor(Math.random() * others.length)];
      me.met.add(partner.code);
      try {
        const pv = await me.call<Preview>("previewPartner", { eventId, code: partner.code });
        if (!pv.candidates.length) return;
        await me.call("openCell", { eventId, code: partner.code, index: pv.candidates[0].index });
        me.opened++;
        // 同じ相手でもう1マス開けようとすると拒否されるはず
        if (pv.candidates[1] && Math.random() < 0.2)
          await expectReject("同じ相手で2マス目", me.call("openCell", { eventId, code: partner.code, index: pv.candidates[1].index }), "already-exists");
      } catch (e) {
        errors.push(`ラウンド${round} ボット${me.i + 1}: ${(e as Error).message}`);
      }
    }),
  );
  console.log(`ラウンド${round}: ${((Date.now() - t) / 1000).toFixed(1)}秒、累計 ${bots.reduce((s, x) => s + x.opened, 0)}マス`);
}

console.log(errors.length ? `\n問題 ${errors.length}件:\n- ${errors.join("\n- ")}` : "\n問題は見つかりませんでした");
console.log("ランキングはエミュレーターの Web アプリ（#/screen）で確認できます");
process.exit(errors.length ? 1 : 0);
