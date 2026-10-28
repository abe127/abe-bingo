import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, doc, onSnapshot, type Timestamp } from "firebase/firestore";
import type { Answers, OpenedEntry } from "../../shared/game";
import { auth, db } from "./firebase";

export type EventDoc = { name: string; status: "playing" | "finished" };
export type Player = {
  id: string;
  nickname: string;
  card: string[];
  opened: Record<string, OpenedEntry>;
  openedCount: number;
  lines: number;
  bingoAt: Timestamp | null;
};
export type PrivateDoc = { answers: Answers; code: string };

/** 匿名サインイン。同じブラウザなら次に開いても同じ参加者として扱われる */
export function useUid(): { uid: string | null; error: string | null } {
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (u) setUid(u.uid);
        else signInAnonymously(auth).catch(() => setError("サインインできませんでした。ページを開き直してください"));
      }),
    [],
  );
  return { uid, error };
}

type Loadable<T> = { data: T; loading: boolean };

export function useEventDoc(eventId: string, enabled: boolean): Loadable<EventDoc | null> {
  const [state, setState] = useState<Loadable<EventDoc | null>>({ data: null, loading: true });
  useEffect(() => {
    if (!enabled || !eventId) return;
    return onSnapshot(
      doc(db, "events", eventId),
      (s) => setState({ data: s.exists() ? (s.data() as EventDoc) : null, loading: false }),
      () => setState({ data: null, loading: false }),
    );
  }, [eventId, enabled]);
  return state;
}

export function usePlayers(eventId: string, enabled: boolean): Loadable<Player[]> {
  const [state, setState] = useState<Loadable<Player[]>>({ data: [], loading: true });
  useEffect(() => {
    if (!enabled || !eventId) return;
    return onSnapshot(
      collection(db, "events", eventId, "players"),
      (s) => setState({ data: s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Player, "id">) })), loading: false }),
      () => setState({ data: [], loading: false }),
    );
  }, [eventId, enabled]);
  return state;
}

export function usePrivate(eventId: string, uid: string | null): Loadable<PrivateDoc | null> {
  const [state, setState] = useState<Loadable<PrivateDoc | null>>({ data: null, loading: true });
  useEffect(() => {
    if (!uid || !eventId) return;
    return onSnapshot(
      doc(db, "events", eventId, "private", uid),
      (s) => setState({ data: s.exists() ? (s.data() as PrivateDoc) : null, loading: false }),
      () => setState({ data: null, loading: false }),
    );
  }, [eventId, uid]);
  return state;
}

/** 並び順：ビンゴ数が多い → 先にビンゴした → 開けたマスが多い */
export function ranked(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) =>
      b.lines - a.lines ||
      (a.bingoAt?.toMillis() ?? Infinity) - (b.bingoAt?.toMillis() ?? Infinity) ||
      b.openedCount - a.openedCount,
  );
}

/** URL の #/xxx を読む */
export function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#\/?/, "");
}
