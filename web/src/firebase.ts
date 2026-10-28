import { initializeApp } from "firebase/app";
import type { Game } from "../../shared/game";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

export const app = initializeApp(
  useEmulators
    ? { apiKey: "demo-key", projectId: "demo-kyotsuten-bingo", appId: "demo-app", authDomain: "localhost" }
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "asia-northeast1");

if (useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}

/** URL の ?e=xxx、なければ既定値 */
export const eventId: string =
  new URLSearchParams(location.search).get("e") ?? import.meta.env.VITE_DEFAULT_EVENT_ID ?? "";

/* ---------- Cloud Functions の呼び出し ---------- */
export type Candidate = { index: number; label: string; detail: string };
export type Preview = {
  partner: { uid: string; nickname: string };
  alreadyUsed: { index: number; label: string } | null;
  candidates: Candidate[];
  commons: { label: string; value: string }[];
};
export type OpenResult = { index: number; label: string; detail: string; hint: string; lines: number; newBingo: boolean };

const call =
  <Req, Res>(name: string) =>
  async (data: Req): Promise<Res> =>
    (await httpsCallable<Req, Res>(functions, name)(data)).data;

export const api = {
  join: call<{ eventId: string; nickname: string; passphrase: string; answers: Record<string, string> }, { code: string }>(
    "joinEvent",
  ),
  preview: call<{ eventId: string; code: string }, Preview>("previewPartner"),
  open: call<{ eventId: string; code: string; index: number }, OpenResult>("openCell"),
  admin: call<
    { eventId: string; adminKey: string; action: "check" | "start" | "finish" | "reset" | "saveGame"; game?: Game },
    { ok: true }
  >("adminAction"),
};

/** Functions のエラーから、そのまま見せられる日本語メッセージを取り出す */
export function errorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code?.startsWith("functions/") && err.code !== "functions/internal" && err.message) return err.message;
  return "通信がうまくいきませんでした。電波のよい場所でもう一度試してください";
}
