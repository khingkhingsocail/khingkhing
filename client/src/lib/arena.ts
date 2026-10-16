import type {
  ArenaBoard,
  ArenaEntry,
  ArenaEntryInput,
  ArenaLeaderboard,
  ArenaProfile,
  ArenaProfileInput,
} from "../../../shared/arena";
const KEY = "khingkhing.arena.edit-capabilities.v1";
const sessionTokens: Record<string, string> = {};
export function arenaCapabilities(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return { ...sessionTokens };
    const result: Record<string, string> = { ...sessionTokens };
    for (const [id, token] of Object.entries(stored))
      if (
        /^[a-f0-9]{32}$/.test(id) &&
        typeof token === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(token)
      )
        result[id] = token;
    return result;
  } catch {
    return { ...sessionTokens };
  }
}
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string
): Promise<T> {
  const response = await fetch(`/api/arena${path}`, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "X-Arena-Token": token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(payload?.error ?? `คำขอไม่สำเร็จ (${response.status})`);
  return payload as T;
}
export function fetchArenaBoards() {
  return api<{ boards: ArenaBoard[] }>("/boards");
}
export function fetchArenaLeaderboard(
  board: string,
  period: string,
  verified: boolean | "all" | "verified" | "ai-supported"
) {
  return api<ArenaLeaderboard>(
    `/leaderboard?${new URLSearchParams({ board, period, verification: typeof verified === "string" ? verified : verified ? "verified" : "all" })}`
  );
}
export function fetchArenaProfile(id: string) {
  return api<{ profile: ArenaProfile; entries: ArenaEntry[] }>(
    `/profiles/${encodeURIComponent(id)}`
  );
}
export async function createArenaProfile(input: ArenaProfileInput) {
  const current = localStorage.getItem(KEY) ?? "{}";
  localStorage.setItem(KEY, current); // Fail before publishing if storage is unavailable.
  const result = await api<{ profile: ArenaProfile; editToken: string }>(
    "/profiles",
    "POST",
    input
  );
  sessionTokens[result.profile.id] = result.editToken;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...arenaCapabilities(),
        [result.profile.id]: result.editToken,
      })
    );
  } catch {
    window.alert(
      "โปรไฟล์เผยแพร่แล้ว แต่เก็บสิทธิ์แก้ถาวรไม่ได้ อย่าปิดหน้านี้ก่อนสำรองรหัสแก้จากหน้าโปรไฟล์"
    );
  }
  return result.profile;
}
export async function updateArenaProfile(id: string, input: ArenaProfileInput) {
  const token = arenaCapabilities()[id];
  if (!token) throw new Error("ไม่มีสิทธิ์แก้โปรไฟล์นี้ในเบราว์เซอร์นี้");
  return (
    await api<{ profile: ArenaProfile }>(
      `/profiles/${id}`,
      "PATCH",
      input,
      token
    )
  ).profile;
}
export function saveArenaEntry(input: ArenaEntryInput) {
  const token = arenaCapabilities()[input.profileId];
  if (!token) throw new Error("ไม่มีสิทธิ์ลงสถิติให้โปรไฟล์นี้");
  return api<{
    board: ArenaBoard;
    message: string;
    entryId: string;
    revision: string;
  }>("/entries", "POST", input, token);
}

export async function prepareArenaAvatar(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("เลือกรูป JPG/PNG/WebP ไม่เกิน 5 MB");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000)
      throw new Error("รูปใหญ่เกินไป กรุณาย่อก่อนเลือก");
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เตรียมรูปไม่ได้");
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256
    );
    const result = canvas.toDataURL("image/webp", 0.8);
    if (result.length > 270000)
      throw new Error("รูปใหญ่เกินไปหลังย่อ กรุณาเลือกรูปอื่น");
    return result;
  } finally {
    bitmap.close();
  }
}
