import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../../../shared/const";
import { parseMirroredSession, previewSessionToken } from "./sessionToken";
const shapedToken = "header.payload.signature";
afterEach(() => vi.unstubAllGlobals());
describe("Preview session credential transport", () => {
  it("parses raw JWT and the same value inside mirrored cookie format consistently", () => {
    expect(parseMirroredSession(shapedToken)).toBe(shapedToken);
    expect(parseMirroredSession(`${COOKIE_NAME}=${shapedToken}`)).toBe(
      shapedToken
    );
    expect(
      parseMirroredSession(`other=value; ${COOKIE_NAME}=${shapedToken}; Path=/`)
    ).toBe(shapedToken);
  });
  it("does not mistake cookies, empty storage or malformed values for a credential", () => {
    for (const raw of [
      null,
      "",
      "not-a-token",
      `other=${shapedToken}`,
      `${COOKIE_NAME}=`,
      "header.payload.",
    ])
      expect(parseMirroredSession(raw)).toBeNull();
  });
  it("returns no credential when browser storage is blocked and never synthesizes one", () => {
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new Error("disabled");
      },
    });
    expect(previewSessionToken()).toBeNull();
  });
});
