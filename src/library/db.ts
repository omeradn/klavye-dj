/** Tiny IndexedDB wrapper for the library (folder handles + analysis cache). */

const DB_NAME = 'klavye-dj';
const DB_VER = 1;
export type StoreName = 'roots' | 'analysis';

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('roots')) db.createObjectStore('roots', { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains('analysis')) db.createObjectStore('analysis');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return (await open()).transaction(name, mode).objectStore(name);
}

export async function dbAll<T>(name: StoreName): Promise<T[]> {
  return req((await store(name, 'readonly')).getAll()) as Promise<T[]>;
}
export async function dbGet<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return req((await store(name, 'readonly')).get(key)) as Promise<T | undefined>;
}
export async function dbPut(name: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey> {
  return req((await store(name, 'readwrite')).put(value, key));
}
export async function dbDelete(name: StoreName, key: IDBValidKey): Promise<void> {
  await req((await store(name, 'readwrite')).delete(key));
}
