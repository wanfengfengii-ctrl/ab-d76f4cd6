/**
 * IndexedDB 草稿持久化。保存最近一次编辑的题面，刷新页面后自动恢复。
 */
import type { ReviewInput } from '../solver/types';

const DB_NAME = 'substation-review';
const STORE = 'drafts';
const KEY = 'current';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function saveDraft(input: ReviewInput): Promise<void> {
  return tx('readwrite', (store) =>
    store.put({ input, savedAt: Date.now() }, KEY),
  ).then(() => undefined);
}

export async function loadDraft(): Promise<ReviewInput | null> {
  const row = await tx<{ input: ReviewInput } | undefined>('readonly', (
    store,
  ) => store.get(KEY) as IDBRequest<{ input: ReviewInput } | undefined>);
  return row?.input ?? null;
}
