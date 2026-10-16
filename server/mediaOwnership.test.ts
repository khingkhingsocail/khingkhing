import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canClaimMedia, validMediaToken } from "./mediaOwnership";
const token = "a".repeat(43),
  hash = createHash("sha256").update(token).digest("hex");
describe("media account ownership", () => {
  it("claims only anonymous or already owned media with matching token", () => {
    expect(canClaimMedia(null, 1, token, hash)).toBe(true);
    expect(canClaimMedia(1, 1, token, hash)).toBe(true);
    expect(canClaimMedia(2, 1, token, hash)).toBe(false);
    expect(canClaimMedia(null, 1, "b".repeat(43), hash)).toBe(false);
  });
  it("rejects malformed capability and hash", () => {
    expect(validMediaToken("", hash)).toBe(false);
    expect(validMediaToken(token, "bad")).toBe(false);
  });
});
