import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';

export interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

interface Snapshot<T> {
  key: string;
  data: T;
  error: Error | null;
}

/** Live document. Re-subscribes when the document path changes; pass null to skip. */
export function useDoc<T = DocumentData>(
  ref: DocumentReference | null,
): LiveState<(T & { id: string }) | null> {
  const key = ref?.path ?? null;
  const [snap, setSnap] = useState<Snapshot<(T & { id: string }) | null> | null>(null);
  useEffect(() => {
    if (!ref || !key) return;
    return onSnapshot(
      ref,
      (s) =>
        setSnap({ key, data: s.exists() ? { id: s.id, ...(s.data() as T) } : null, error: null }),
      (error) => setSnap({ key, data: null, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = key !== null && snap?.key === key ? snap : null;
  return {
    data: current?.data ?? null,
    loading: key !== null && !current,
    error: current?.error ?? null,
  };
}

/** Live query. `key` identifies the query so it only re-subscribes when it changes. */
export function useCollection<T = DocumentData>(
  query: Query | null,
  key: string,
): LiveState<(T & { id: string })[]> {
  const activeKey = query ? key : null;
  const [snap, setSnap] = useState<Snapshot<(T & { id: string })[]> | null>(null);
  useEffect(() => {
    if (!query || activeKey === null) return;
    return onSnapshot(
      query,
      (s) =>
        setSnap({
          key: activeKey,
          data: s.docs.map((d) => ({ id: d.id, ...(d.data() as T) })),
          error: null,
        }),
      (error) => setSnap({ key: activeKey, data: [], error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);
  const current = activeKey !== null && snap?.key === activeKey ? snap : null;
  return {
    data: current?.data ?? [],
    loading: activeKey !== null && !current,
    error: current?.error ?? null,
  };
}
