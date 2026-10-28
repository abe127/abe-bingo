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
import { parseArgs } from "node:util";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const { values } = parseArgs({
  options: {
    id: { type: "string" },
    name: { type: "string" },
    passphrase: { type: "string" },
    "admin-key": { type: "string" },
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
const adminKey = values["admin-key"] ?? randomBytes(9).toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s.trim(), "utf8").digest("hex");

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

await db.doc(`events/${id}`).set(
  { name: values.name, status: "playing", createdAt: FieldValue.serverTimestamp() },
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
