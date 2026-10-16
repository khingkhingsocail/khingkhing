export type LocalProfileImageField = "avatar" | "cover";

export interface LocalProfile {
  id: "local";
  displayName: string;
  handle: string;
  bio: string;
  location: string;
  website: string;
  category: string;
  avatar: Blob | null;
  cover: Blob | null;
  updatedAt: number | null;
}

const DATABASE_NAME = "khingkhing-local-profile";
const DATABASE_VERSION = 1;
const STORE_NAME = "profiles";
const PROFILE_KEY = "local";
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HANDLE_PATTERN = /^[\p{L}\p{M}\p{N}._]{3,24}$/u;

let databasePromise: Promise<IDBDatabase> | null = null;

export function createDefaultLocalProfile(): LocalProfile {
  return {
    id: PROFILE_KEY,
    displayName: "ขิงขิง",
    handle: "khingkhing",
    bio: "พื้นที่รวมผลงาน เกมสั้น ๆ และโพสต์จากผู้เข้าชม",
    location: "",
    website: "",
    category: "ครีเอเตอร์",
    avatar: null,
    cover: null,
    updatedAt: null,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("เบราว์เซอร์นี้ยังไม่รองรับการบันทึกโปรไฟล์ในเครื่อง"));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("เปิดพื้นที่โปรไฟล์ในเครื่องไม่สำเร็จ"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("กรุณาปิดแท็บขิงขิงอื่นก่อน แล้วลองอีกครั้ง"));
    };
  });
  return databasePromise;
}

export function getLocalProfile(): Promise<LocalProfile> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(PROFILE_KEY);
    request.onsuccess = () => {
      const saved = request.result as Partial<LocalProfile> | undefined;
      resolve(saved ? { ...createDefaultLocalProfile(), ...saved, id: PROFILE_KEY } : createDefaultLocalProfile());
    };
    request.onerror = () => reject(request.error ?? new Error("อ่านโปรไฟล์ในเครื่องไม่สำเร็จ"));
    transaction.onabort = () => reject(transaction.error ?? new Error("อ่านโปรไฟล์ในเครื่องไม่สำเร็จ"));
  }));
}

export function saveLocalProfile(profile: LocalProfile): Promise<void> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...profile, id: PROFILE_KEY });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("บันทึกโปรไฟล์ในเครื่องไม่สำเร็จ"));
    transaction.onabort = () => reject(transaction.error ?? new Error("บันทึกโปรไฟล์ในเครื่องไม่สำเร็จ"));
  }));
}

export function clearLocalProfile(): Promise<void> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(PROFILE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("ลบโปรไฟล์ในเครื่องไม่สำเร็จ"));
    transaction.onabort = () => reject(transaction.error ?? new Error("ลบโปรไฟล์ในเครื่องไม่สำเร็จ"));
  }));
}

export function normalizeProfileWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateLocalProfile(profile: Pick<LocalProfile, "displayName" | "handle" | "bio" | "location" | "website" | "category">): string | null {
  const displayName = profile.displayName.trim();
  const handle = profile.handle.trim().normalize("NFC");
  if (!displayName) return "กรุณากรอกชื่อที่แสดง";
  if (displayName.length > 60) return "ชื่อที่แสดงต้องไม่เกิน 60 ตัวอักษร";
  if (!HANDLE_PATTERN.test(handle)) return "ชื่อผู้ใช้ต้องมี 3–24 ตัวอักษร และใช้ได้เฉพาะตัวอักษร ตัวเลข จุด หรือขีดล่าง";
  if (profile.bio.length > 160) return "แนะนำตัวต้องไม่เกิน 160 ตัวอักษร";
  if (profile.location.length > 80) return "สถานที่ต้องไม่เกิน 80 ตัวอักษร";
  if (profile.category.length > 40) return "หมวดหมู่ต้องไม่เกิน 40 ตัวอักษร";
  if (profile.website.trim() && normalizeProfileWebsite(profile.website) === null) return "กรุณากรอกลิงก์เว็บไซต์ที่ขึ้นต้นด้วย https:// หรือชื่อโดเมนที่ถูกต้อง";
  if (profile.website.length > 200) return "ลิงก์เว็บไซต์ต้องไม่เกิน 200 ตัวอักษร";
  return null;
}

export async function prepareLocalProfileImage(file: File, field: LocalProfileImageField): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP");
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    throw new Error("รูปภาพต้องมีขนาดไม่เกิน 5 MB");
  }
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("เปิดรูปภาพนี้ไม่ได้ กรุณาเลือกไฟล์รูปภาพที่ถูกต้อง");
  }
  if (bitmap.width * bitmap.height > 40_000_000) {
    bitmap.close();
    throw new Error("รูปภาพมีความละเอียดสูงเกินไป กรุณาย่อภาพก่อนเลือกอีกครั้ง");
  }

  const maxDimension = field === "avatar" ? 640 : 1800;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("เตรียมรูปภาพไม่สำเร็จ กรุณาลองใหม่");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("บีบอัดรูปภาพไม่สำเร็จ กรุณาลองไฟล์อื่น"));
    }, "image/webp", 0.84);
  });
}
