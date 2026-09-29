import type { Scenario } from './solver/types';
import { createDefaultScenario } from './solver/defaults';

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

export async function loadDraft(): Promise<Scenario> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (value && typeof value === 'object') {
      return normalize(value as Partial<Scenario>);
    }
  } catch (err) {
    console.warn('草稿读取失败，使用示例数据：', err);
  }
  return createDefaultScenario();
}

export async function saveDraft(scenario: Scenario): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(scenario, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 从旧草稿恢复时补齐缺失字段，避免结构演进导致页面崩溃 */
function normalize(raw: Partial<Scenario>): Scenario {
  const fallback = createDefaultScenario();
  return {
    lampOrder: Array.isArray(raw.lampOrder) ? raw.lampOrder.map(String) : fallback.lampOrder,
    states: Array.isArray(raw.states)
      ? raw.states.map((s) => ({
          name: String(s?.name ?? ''),
          lamps: Array.isArray(s?.lamps) ? s!.lamps.map(String) : [],
        }))
      : fallback.states,
    edges: Array.isArray(raw.edges)
      ? raw.edges.map((e) => ({ from: String(e?.from ?? ''), to: String(e?.to ?? '') }))
      : fallback.edges,
    frames: Array.isArray(raw.frames)
      ? raw.frames.map((f) => ({
          observed: Array.isArray(f?.observed) ? f!.observed.map(String) : [],
        }))
      : fallback.frames,
  };
}
