import { describe, expect, it } from "vitest";
import { isPublicFeedDeepLink } from "./loginEntry";
describe("existing public media deep links", () => {
  it("allows public post links while the new entry page remains branded", () => {
    expect(isPublicFeedDeepLink("#feed-public-" + "a".repeat(32))).toBe(true);
    for (const hash of [
      "",
      "#feed",
      "#admin",
      "#feed-private-example",
      "#feed-public-short",
      "#feed-public-" + "a".repeat(32) + "x",
    ])
      expect(isPublicFeedDeepLink(hash)).toBe(false);
  });
});
