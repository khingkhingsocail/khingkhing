import { describe, expect, it } from "vitest";
import { createDefaultLocalProfile, normalizeProfileWebsite, validateLocalProfile } from "./localProfile";

describe("local profile validation", () => {
  it("accepts the default bilingual profile draft", () => {
    expect(validateLocalProfile(createDefaultLocalProfile())).toBeNull();
  });

  it("requires a display name and a supported handle", () => {
    const profile = createDefaultLocalProfile();
    expect(validateLocalProfile({ ...profile, displayName: "   " })).toContain("ชื่อที่แสดง");
    expect(validateLocalProfile({ ...profile, handle: "two words" })).toContain("ชื่อผู้ใช้");
  });

  it("rejects unsafe website schemes and normalizes a domain to HTTPS", () => {
    expect(normalizeProfileWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeProfileWebsite("portfolio.example.com")).toBe("https://portfolio.example.com/");
    expect(validateLocalProfile({ ...createDefaultLocalProfile(), website: "javascript:alert(1)" })).toContain("ลิงก์เว็บไซต์");
  });

  it("enforces bio and location length limits", () => {
    const profile = createDefaultLocalProfile();
    expect(validateLocalProfile({ ...profile, bio: "x".repeat(161) })).toContain("160");
    expect(validateLocalProfile({ ...profile, location: "x".repeat(81) })).toContain("80");
  });
});
