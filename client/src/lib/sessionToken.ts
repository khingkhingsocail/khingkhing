import { COOKIE_NAME } from "../../../shared/const";

// Parsing is transport only. The server still verifies signature, expiry,
// project binding, identity and permissions before trusting this credential.
export function parseMirroredSession(raw: string | null): string | null {
  if (!raw) return null;
  const prefix = `${COOKIE_NAME}=`;
  const pair = raw
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  const candidate = (pair ? pair.slice(prefix.length) : raw).trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(candidate)
    ? candidate
    : null;
}
export function previewSessionToken(): string | null {
  try {
    return parseMirroredSession(sessionStorage.getItem("manus-cookie"));
  } catch {
    return null;
  }
}
