import { describe, expect, it } from "vitest";
import {
  hedgeFollowEntityLink,
  hedgeFollowStockUrl,
  hedgeFollowReference,
} from "./hedgeFollow";

describe("HedgeFollow reference links", () => {
  it("maps Buffett to the organization portfolio, not a personal account", () => {
    expect(hedgeFollowEntityLink("warren-buffett")).toEqual(
      hedgeFollowEntityLink("berkshire-hathaway")
    );
    expect(hedgeFollowEntityLink("warren-buffett")?.note).toContain(
      "ไม่ใช่พอร์ตส่วนตัว"
    );
    expect(hedgeFollowEntityLink("apple")?.url).toBe(
      "https://hedgefollow.com/stocks/AAPL"
    );
    expect(hedgeFollowEntityLink("voo")).toBeNull();
    expect(hedgeFollowEntityLink("ray-dalio")).toBeNull();
  });
  it("creates only stock URLs from safe normalized symbols", () => {
    expect(hedgeFollowStockUrl(" nvda ")).toBe(
      "https://hedgefollow.com/stocks/NVDA"
    );
    expect(hedgeFollowStockUrl("BRK.B")).toBe(
      "https://hedgefollow.com/stocks/BRK.B"
    );
    for (const value of [
      "",
      "//example.com",
      "../AAPL",
      "AAPL?x=1",
      "https://example.com",
      "AAPL#test",
      "BRK.A / BRK.B",
      "AAPL<script>",
    ])
      expect(hedgeFollowStockUrl(value)).toBeNull();
  });
  it("provides plain reference URLs, not an automatic importer", () => {
    for (const url of [
      hedgeFollowReference.home,
      hedgeFollowReference.guide,
      hedgeFollowReference.terms,
    ])
      expect(new URL(url).origin).toBe("https://hedgefollow.com");
    expect(hedgeFollowReference.secGuide).toContain("www.sec.gov");
  });
});
