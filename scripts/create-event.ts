/**
 * イベントを作る（または合言葉・主催者キーを変更する）。
 *
 * エミュレーター:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-kyotsuten-bingo \
 *     npx tsx scripts/create-event.ts --id party-2026 --name "秋の懇親会" --passphrase もみじ --admin-key xxxx
 *
 * 本番（事前に gcloud auth application-default login）:
 *   GCLOUD_PROJECT=<プロジェクトID> npx tsx scripts/create-event.ts --id ...
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { DEFAULT_GAME, validateGame } from "../shared/game";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    name: { type: "string" },
    passphrase: { type: "string" },
    "admin-key": { type: "string" },
    game: { type: "string" },
  },
});

const id = values.id ?? "";
if (!/^[a-z0-9-]{1,40}$/.test(id)) {
  console.error("--id は半角英小文字・数字・ハイフンで指定してください（例: party-2026）");
  process.exit(1);
}
if (!values.name || !values.passphrase) {
  console.error("--name と --passphrase は必須です");
  process.exit(1);
}
let game = DEFAULT_GAME;
if (values.game) {
  const result = validateGame(JSON.parse(readFileSync(values.game, "utf8")));
  if (!result.game) {
    console.error("質問の設定に問題があります:\n- " + result.errors.join("\n- "));
    process.exit(1);
  }
  game = result.game;
}
const adminKey = values["admin-key"] ?? randomBytes(9).toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s.trim(), "utf8").digest("hex");

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const existing = await db.doc(`events/${id}`).get();
const hasPlayers = !(await db.collection(`events/${id}/players`).limit(1).get()).empty;
if (values.game && hasPlayers) console.warn("参加者がいるため、質問の設定は変更しませんでした（主催者画面でデータを削除してから再実行してください）");

await db.doc(`events/${id}`).set(
  {
    name: values.name,
    status: "playing",
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    // 参加者がいるイベントの質問は変えない（カードと食い違うため）
    ...(values.game || !existing.exists ? (hasPlayers ? {} : { game }) : {}),
  },
  { merge: true },
);
await db.doc(`events/${id}/secret/config`).set({
  passphraseHash: sha256(values.passphrase),
  adminKeyHash: sha256(adminKey),
});

console.log(`イベント「${values.name}」(${id}) を作成しました`);
console.log(`  参加URL:      https://<ホスト>/?e=${id}`);
console.log(`  会場スクリーン: https://<ホスト>/?e=${id}#/screen`);
console.log(`  主催者画面:    https://<ホスト>/?e=${id}#/admin`);
console.log(`  主催者キー:    ${adminKey}  ← 控えておいてください（再表示できません）`);
