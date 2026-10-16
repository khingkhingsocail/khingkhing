export type MediaKind = "image" | "video";

export interface LocalMediaRecord {
  id: string;
  name: string;
  description: string;
  kind: MediaKind;
  mimeType: string;
  createdAt: string;
  file: Blob;
}

const DATABASE_NAME = "playfolio-private-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "media";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("เบราว์เซอร์นี้ยังไม่รองรับการจัดเก็บไฟล์ในเครื่อง"));
  }

  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("เปิดคลังไฟล์ไม่สำเร็จ"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("กรุณาปิดแท็บขิงขิงอื่นก่อน แล้วลองอีกครั้ง"));
    };
  });

  return databasePromise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = createRequest(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("ดำเนินการกับคลังไฟล์ไม่สำเร็จ"));
        transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกข้อมูลไม่สำเร็จ"));
      }),
  );
}

export function getAllLocalMedia(): Promise<LocalMediaRecord[]> {
  return runRequest("readonly", (store) => store.getAll()).then((items) =>
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export function saveLocalMediaBatch(items: LocalMediaRecord[]): Promise<void> {
  return openDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        for (const item of items) store.add(item);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกไฟล์ไม่สำเร็จ"));
        transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกไฟล์ไม่สำเร็จ"));
      }),
  );
}

export function updateLocalMedia(item: LocalMediaRecord): Promise<IDBValidKey> {
  return runRequest("readwrite", (store) => store.put(item));
}

export function deleteLocalMedia(id: string): Promise<undefined> {
  return runRequest("readwrite", (store) => store.delete(id));
}

export function clearLocalMedia(): Promise<undefined> {
  return runRequest("readwrite", (store) => store.clear());
}
