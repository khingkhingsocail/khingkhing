import { createHash, timingSafeEqual } from "node:crypto";
export function validMediaToken(token: string, storedHash: string): boolean {
  if (
    !/^[A-Za-z0-9_-]{40,50}$/.test(token) ||
    !/^[a-f0-9]{64}$/.test(storedHash)
  )
    return false;
  const hash = createHash("sha256").update(token).digest();
  return timingSafeEqual(hash, Buffer.from(storedHash, "hex"));
}
export function canClaimMedia(
  owner: number | null,
  userId: number,
  token: string,
  storedHash: string
): boolean {
  return (
    (owner === null || owner === userId) && validMediaToken(token, storedHash)
  );
}
